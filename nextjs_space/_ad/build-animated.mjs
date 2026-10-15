import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = import.meta.dirname;
const ffmpeg = 'C:\\Users\\faith\\Downloads\\nexus_roleplay\\nextjs_space\\_splash-tools\\node_modules\\ffmpeg-static\\ffmpeg.exe';
const dl = 'C:\\Users\\faith\\Downloads\\';
const song = dl + 'Threshold_of_the_New_World.mp3';
const out = dl + 'Nexus_AI_Commercial.mp4';
const clips = [
  'Man_and_woman_walking_57713_Kling_30_.mp4',
  'Man_and_woman_walking_63419_Kling_30_.mp4',
  'Man_and_woman_walking_81831_Kling_30_.mp4',
  'Man_and_woman_walking_69682_Kling_30_.mp4',
  'Man_and_woman_walking_71178_Kling_30_.mp4',
  'Man_and_woman_walking_64225_Kling_30_.mp4',
  'Man_and_woman_walking_74832_Kling_30_.mp4',
  'Man_and_woman_walking_12185_Kling_30_.mp4',
  'Man_and_woman_walking_34712_Kling_30_.mp4',
  'Man_and_woman_walking_46092_Kling_30_.mp4',
  'Man_and_woman_walking_94555_Kling_30_.mp4',
  'Man_and_woman_walking_22421_Kling_30_.mp4',
  'Man_and_woman_walking_62900_Kling_30_.mp4',
  'Nexus_AI_Splash_No_Music.mp4',
].map((name) => dl + name);

function duration(file) {
  const result = spawnSync(ffmpeg, ['-i', file], { encoding: 'utf8' });
  const text = (result.stderr || '') + (result.stdout || '');
  const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error('no duration ' + file);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

const durs = clips.map(duration);
const songDur = duration(song);
const splashDur = durs[durs.length - 1];
const storyDur = durs.slice(0, -1).reduce((sum, value) => sum + value, 0);
const factor = (songDur - splashDur) / storyDur;
console.log('song', songDur.toFixed(2), 'story', storyDur.toFixed(2), 'splash', splashDur.toFixed(2), 'slow', factor.toFixed(3));

const outDurs = durs.map((value, i) => (i < durs.length - 1 ? value * factor : value));
const captionDir = path.join(__dirname, 'captions');

const args = ['-y'];
for (const file of clips) args.push('-i', file);
outDurs.forEach((value, i) => {
  const card = path.join(captionDir, String(i + 1).padStart(2, '0') + '.png');
  args.push('-loop', '1', '-t', value.toFixed(3), '-i', card);
});
args.push('-i', song);

const fit = 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,setsar=1,format=yuv420p';
function textFade(dur, late) {
  const start = late ? 5.2 : 0.45;
  const leave = Math.max(start + 1, dur - 0.7);
  return `fade=t=in:st=${start.toFixed(2)}:d=0.45:alpha=1,fade=t=out:st=${leave.toFixed(2)}:d=0.45:alpha=1`;
}
const filters = [];
clips.forEach((_, i) => {
  const slow = i < clips.length - 1 ? `setpts=PTS*${factor.toFixed(6)},` : '';
  filters.push(`[${i}:v]${slow}${fit}[b${i}]`);
  filters.push(`[${clips.length + i}:v]format=rgba,${textFade(outDurs[i], i === clips.length - 1)}[t${i}]`);
  filters.push(`[b${i}][t${i}]overlay=0:0:format=auto[v${i}]`);
});
filters.push(clips.map((_, i) => `[v${i}]`).join('') + `concat=n=${clips.length}:v=1:a=0[v]`);
const fadeAt = Math.max(0, songDur - 1.2);
filters.push(`[${clips.length * 2}:a]afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeAt.toFixed(2)}:d=1.2,atrim=0:${songDur.toFixed(3)}[a]`);
const script = path.join(__dirname, 'animated-filter.txt');
fs.writeFileSync(script, filters.join(';\n'));

args.push(
  '-filter_complex_script', script,
  '-map', '[v]',
  '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  '-shortest', '-movflags', '+faststart',
  out,
);

const result = spawnSync(ffmpeg, args, { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const pic = 'C:\\Users\\faith\\OneDrive\\Pictures\\Nexus AI Commercial\\Nexus AI Commercial.mp4';
fs.copyFileSync(out, pic);
console.log('WROTE', out);
