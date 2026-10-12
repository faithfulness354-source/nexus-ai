/**
 * Shared portrait anchors for the local ComfyUI prompt API (http://127.0.0.1:8188/prompt).
 * Visual style is chosen per card by the batch pipeline so the queue is not locked to one look.
 */

const FACE_VARIETY = 'unique distinct face, individual facial features, varied ethnicity, distinct personal style';

/** Safe-for-work clothing anchor. Adults, fully dressed. */
export const sfwPrompt = `fully dressed, complete modest outfit, proper clothing, genre-appropriate attire, ${FACE_VARIETY}`;

/** Adult clothing anchor. Fictional adults only. */
export const nsfwPrompt = `sensual attire, explicit, lingerie, boudoir wear, bare skin, provocative pose, ${FACE_VARIETY}`;

/** Mandatory positive rendering tags. Appended to every batch image prompt. */
export const RENDER_POSITIVE = '2.5D semi-realistic, soft realistic lighting, subsurface scattering, highly detailed face features, delicate skin texture, polished digital illustration, masterpiece, best quality, smooth gradients';

/** Rejects flat cartoon renders. Appended to the shared negative prompt. */
export const RENDER_NEGATIVE = 'flat 2D, minimal cartoon, low detail, line art, simple shading, exaggerated anime features, blocky geometry, bad anatomy, low res';

/** Shared negative prompt. Blocks photography and flat cartoon renders. */
export const negativePrompt = `photorealistic, photograph, live action, hyperrealistic, camera photo, DSLR, skin pores, stock photo, 3D Pixar render, 3D Disney render, chibi, low-poly, flat lighting, stiff posture, cropped head, passport photo, real person, ${RENDER_NEGATIVE}`;
