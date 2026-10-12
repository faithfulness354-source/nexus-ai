import fs from 'fs/promises';
import path from 'path';
import { RENDER_POSITIVE, negativePrompt } from '../../config/card-prompts';

const COMFY_ORIGIN = 'http://127.0.0.1:8188';
const POLL_MS = 1500;
const POLL_LIMIT = 120;

/** Fixed scene shape. The action slot is the only text that can change. */
const SCENE_POSITIVE_TEMPLATE = `{character}, {action}, ${RENDER_POSITIVE}`;
/** Artifact block. Not extended per request. */
const SCENE_NEGATIVE_PROMPT = 'disfigured, mutated, extra limbs, clones, background crowds, distorted faces';
const IP_ADAPTER_WEIGHT_MIN = 0.35;
const IP_ADAPTER_WEIGHT_MAX = 0.45;
const IP_ADAPTER_WEIGHT = 0.4;

function pinIpAdapterWeight(weight: number): number {
  const value = Number.isFinite(weight) ? weight : IP_ADAPTER_WEIGHT;
  return Math.min(IP_ADAPTER_WEIGHT_MAX, Math.max(IP_ADAPTER_WEIGHT_MIN, value));
}

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

type Workflow = Record<string, WorkflowNode>;

type HistoryImage = { filename?: string; subfolder?: string; type?: string };

/** Refuse portrait prompts that describe a minor. Fictional adults remain allowed. */
function rejectsMinor(promptText: string): boolean {
  const text = promptText.toLowerCase();
  if (/\b(child|children|minor|minors|underage|preteen|toddler|infant|loli|lolita|shota)\b/.test(text)) return true;
  const age = text.match(/\b(\d{1,2})\s*(?:years?\s*old|yo|y\/o)\b/);
  return !!age && Number(age[1]) < 18;
}

function injectPrompt(workflow: Workflow, promptText: string, isNsfw: boolean, negativePrompt?: string) {
  const alreadyDressed = /fully dressed|fully clothed|complete modest outfit/i.test(promptText);
  const text = isNsfw || alreadyDressed ? promptText : `${promptText}, fully clothed, complete outfit`;
  let found = false;
  for (const node of Object.values(workflow)) {
    const title = node?._meta?.title ?? '';
    if (node?.class_type === 'CLIPTextEncode' && /positive/i.test(title)) {
      node.inputs = { ...node.inputs, text };
      found = true;
    }
    if (negativePrompt?.trim() && node?.class_type === 'CLIPTextEncode' && /negative/i.test(title)) {
      node.inputs = { ...node.inputs, text: negativePrompt.trim() };
    }
    if (node?.class_type === 'KSampler' && node.inputs) {
      node.inputs.seed = Math.floor(Math.random() * 2_147_483_647);
    }
    if (negativePrompt?.trim() && node?.class_type === 'ConditioningZeroOut') {
      node.class_type = 'CLIPTextEncode';
      node._meta = { title: 'Negative Prompt' };
      node.inputs = { text: negativePrompt.trim(), clip: ['30', 0] };
    }
  }
  if (!found) throw new Error('The ComfyUI workflow has no positive prompt node.');
}

function viewUrl(image: HistoryImage): string | null {
  if (!image.filename) return null;
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type || 'output',
  });
  return `${COMFY_ORIGIN}/view?${params.toString()}`;
}

function firstImage(historyEntry: { outputs?: Record<string, { images?: HistoryImage[] }> } | undefined): HistoryImage | null {
  const outputs = historyEntry?.outputs ?? {};
  for (const output of Object.values(outputs)) {
    const image = output.images?.[0];
    if (image?.filename) return image;
  }
  return null;
}

async function saveImage(image: HistoryImage, folder: string, fileStem: string | undefined, fallbackName: string, outputRoot?: string): Promise<string> {
  const remote = viewUrl(image);
  if (!remote) throw new Error('ComfyUI did not return an image file.');
  const response = await fetch(remote);
  if (!response.ok) throw new Error('ComfyUI did not return the image file.');
  const ext = (image.filename?.match(/\.(png|jpe?g|webp)$/i)?.[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg');
  const safeStem = fileStem?.replace(/[^\w-]+/g, '').slice(0, 80);
  const filename = safeStem ? `${safeStem}.${ext}` : fallbackName.replace(/\.png$/i, `.${ext}`);
  const root = outputRoot ?? path.join(process.cwd(), 'public', 'nexus_assets', 'images');
  const dir = path.join(root, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), Buffer.from(await response.arrayBuffer()));
  return `/nexus_assets/images/${folder}/${filename}`;
}

async function savePortrait(image: HistoryImage, isNsfw: boolean, outputRoot?: string, fileStem?: string): Promise<string> {
  return saveImage(image, isNsfw ? 'nsfw' : 'sfw', fileStem, `${Date.now()}-portrait.png`, outputRoot);
}

async function uploadReference(reference: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(reference)]), filename);
  form.append('type', 'input');
  form.append('overwrite', 'true');
  let response: Response;
  try {
    response = await fetch(`${COMFY_ORIGIN}/upload/image`, { method: 'POST', body: form });
  } catch {
    throw new Error('ComfyUI is not running. Start it, then render the scene again.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.name) throw new Error('ComfyUI could not accept the character portrait.');
  return String(body.name);
}

/** Drops appearance, camera, and style wording so a chat description cannot rewrite the card look. */
function sceneAction(description: string): string {
  const appearance = /\b(hair|hairstyles?|eyes?|face|facial|skin|outfit|clothes|clothing|dress(?:ed)?|body|physique|ethnicity|age|lighting|camera|close-?up|portrait|lens|masterpiece|quality|detailed|realistic|style|shot|framing|zoom(?:ed)?|full[\s-]?body|waist[\s-]?up|identical|same|recognizable|reference|color|wide|close)\b/gi;
  const action = description
    .replace(/\s+/g, ' ')
    .split(/[.!?;]/)[0]
    .replace(appearance, ' ')
    .replace(/[^a-z0-9 '\-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
  return action || 'in the current place';
}

function scenePositive(characterName: string, description: string): string {
  const character = characterName.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim() || 'character';
  return SCENE_POSITIVE_TEMPLATE.replace('{character}', character).replace('{action}', sceneAction(description));
}

function sceneWorkflow(workflow: Workflow, uploadedName: string, positive: string, weight: number) {
  const referenceWeight = pinIpAdapterWeight(weight);
  workflow['5'] = { class_type: 'EmptyLatentImage', inputs: { width: 1216, height: 832, batch_size: 1 } };
  workflow['10'] = { class_type: 'LoadImage', inputs: { image: uploadedName } };
  workflow['20'] = { class_type: 'CLIPVisionLoader', inputs: { clip_name: 'clip_vision_h.safetensors' } };
  workflow['22'] = { class_type: 'IPAdapterModelLoader', inputs: { ipadapter_file: 'ip-adapter-plus_sdxl_vit-h.safetensors' } };
  workflow['23'] = {
    class_type: 'IPAdapterAdvanced',
    inputs: {
      model: ['47', 0],
      ipadapter: ['22', 0],
      image: ['10', 0],
      weight: referenceWeight,
      weight_type: 'linear',
      combine_embeds: 'concat',
      start_at: 0,
      end_at: 1,
      embeds_scaling: 'V only',
      clip_vision: ['20', 0],
    },
  };
  const positiveNode = workflow['6'];
  const negativeNode = workflow['7'];
  if (positiveNode?.inputs) positiveNode.inputs.text = positive;
  if (negativeNode?.inputs) negativeNode.inputs.text = SCENE_NEGATIVE_PROMPT;
  const sampler = workflow['3'];
  if (sampler?.inputs) {
    sampler.inputs.model = ['23', 0];
    sampler.inputs.positive = ['6', 0];
    sampler.inputs.latent_image = ['5', 0];
    sampler.inputs.denoise = 1;
    sampler.inputs.seed = Math.floor(Math.random() * 2_147_483_647);
  }
  const saver = workflow['9'];
  if (saver?.inputs) saver.inputs.filename_prefix = 'nexus-scene';
}

async function queueWorkflow(workflow: Workflow): Promise<HistoryImage> {
  let queued: Response;
  try {
    queued = await fetch(`${COMFY_ORIGIN}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });
  } catch {
    throw new Error('ComfyUI is not running. Start it, then render the scene again.');
  }
  const queuedBody = await queued.json().catch(() => ({}));
  if (!queued.ok || !queuedBody?.prompt_id) {
    const detail = queuedBody?.error?.message || queuedBody?.error || 'ComfyUI rejected the job.';
    throw new Error(typeof detail === 'string' ? detail : 'ComfyUI rejected the job.');
  }
  const promptId = String(queuedBody.prompt_id);
  for (let attempt = 0; attempt < POLL_LIMIT; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const history = await fetch(`${COMFY_ORIGIN}/history/${promptId}`);
    if (!history.ok) continue;
    const body = await history.json().catch(() => ({}));
    const entry = body?.[promptId];
    if (!entry) continue;
    const status = String(entry?.status?.status_str ?? '');
    if (status === 'error') throw new Error('ComfyUI failed while rendering the image.');
    const image = firstImage(entry);
    if (image) return image;
    if (entry?.status?.completed) break;
  }
  throw new Error('ComfyUI did not finish the image in time.');
}

/** Scene illustration. The card portrait is an IP-Adapter reference at a pinned low weight. */
export async function generateComfyScene(description: string, characterName: string, reference: Buffer, _isNsfw: boolean): Promise<string> {
  const scene = description.replace(/\s+/g, ' ').trim();
  if (!scene) throw new Error('A scene description is required.');
  const positive = scenePositive(characterName, scene);
  if (rejectsMinor(positive) || rejectsMinor(SCENE_NEGATIVE_PROMPT)) throw new Error('Portraits of minors are not allowed.');
  const weight = pinIpAdapterWeight(IP_ADAPTER_WEIGHT);

  const file = await fs.readFile(path.join(process.cwd(), 'src', 'lib', 'comfy', 'workflows', 'noobai_vpred_workflow.json'), 'utf8');
  const workflow = JSON.parse(file) as Workflow;
  const uploadedName = await uploadReference(reference, `scene-ref-${Date.now()}.png`);
  sceneWorkflow(workflow, uploadedName, positive, weight);
  const image = await queueWorkflow(workflow);
  return saveImage(image, 'scenes', `scene-${Date.now()}`, `scene-${Date.now()}.png`);
}

/** Queue a local ComfyUI portrait, store it under nexus_assets, and return that public path. */
export async function generateComfyImage(
  promptText: string,
  isNsfw: boolean,
  negativePrompt?: string,
  outputRoot?: string,
  fileStem?: string,
  workflowFile = 'comfy_workflow.json',
): Promise<string> {
  const prompt = promptText.trim();
  if (!prompt) throw new Error('A portrait prompt is required.');
  if (rejectsMinor(prompt)) throw new Error('Portraits of minors are not allowed.');
  if (negativePrompt && rejectsMinor(negativePrompt)) throw new Error('Portraits of minors are not allowed.');

  const file = await fs.readFile(path.join(process.cwd(), 'src', 'lib', 'comfy', 'workflows', workflowFile), 'utf8');
  const workflow = JSON.parse(file) as Workflow;
  injectPrompt(workflow, prompt, isNsfw, negativePrompt);

  const image = await queueWorkflow(workflow);
  return savePortrait(image, isNsfw, outputRoot, fileStem);
}
