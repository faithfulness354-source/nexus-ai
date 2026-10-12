const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = path.join(
  'C:\\Users\\faith\\Downloads\\nexus_roleplay\\nextjs_space\\_splash-tools\\node_modules\\ffmpeg-static\\ffmpeg.exe',
);
const dir = __dirname;
const assets = 'C:\\Users\\faith\\.cursor\\projects\\c-Users-faith-Downloads-nexus-roleplay\\assets';
const song = 'C:\\Users\\faith\\Downloads\\Threshold_of_the_New_World.mp3';
const out = 'C:\\Users\\faith\\Downloads\\Nexus_AI_Commercial.mp4';
const font = 'C\\\\:/Windows/Fonts/georgiai.ttf';
const fontBold = 'C\\\\:/Windows/Fonts/georgiab.ttf';
const fps = 24;

const clips = [
  { src: path.join(assets, 'ad_01_rain.jpg'), dur: 15, text: 'Real connections.', move: 'in' },
  { src: path.join(assets, 'ad_02_cozy.jpg'), dur: 15, text: 'Unscripted moments.', move: 'out' },
  { src: path.join(assets, 'ad_03_rooftop.jpg'), dur: 15, text: '', move: 'right' },
  { src: path.join(assets, 'ad_04_portal.jpg'), dur: 15, text: 'Step into any world.', move: 'in' },
  { src: path.join(assets, 'ad_05_mage.jpg'), dur: 5, text: '', move: 'in' },
  { src: path.join(assets, 'ad_06_rogue.jpg'), dur: 5, text: '', move: 'right' },
  { src: path.join(assets, 'ad_07_warrior.jpg'), dur: 5, text: '', move: 'in' },
  { src: path.join(assets, 'ad_08_ascent.jpg'), dur: 10, text: '', move: 'up' },
  { src: path.join(assets, 'ad_09_summit.jpg'), dur: 15, text: 'Infinite Adventures.', move: 'out' },
  { src: path.join(assets, 'ad_10_dragon.jpg'), dur: 15, text: '', move: 'in' },
  { src: path.join(dir, 'logo_compass.png'), dur: 10, text: '', move: 'in' },
  { src: path.join(dir, 'logo_icon.png'), dur: 9.32, text: 'title', move: 'out' },
];

function zoom(move, frames) {
  if (move === 'out') return `if(eq(on\\,1)\\,1.16\\,max(1.001\\,zoom-0.0009))`;
  if (move === 'right') return 'min(1.0+0.0007*on\\,1.12)';
  if (move === 'up') return 'min(1.0+0.0008*on\\,1.12)';
  return 'min(1.0+0.0008*on\\,1.14)';
}

function pan(move) {
  if (move === 'right') return { x: '(iw-iw/zoom)*on/' + 'FRAMES', y: '(ih-ih/zoom)/2' };
  if (move === 'up') return { x: '(iw-iw/zoom)/2', y: '(ih-ih/zoom)*(1-on/FRAMES)' };
  return { x: '(iw-iw/zoom)/2', y: '(ih-ih/zoom)/2' };
}

function textFilter(text, dur) {
  if (!text) return '';
  const fade = `alpha='if(lt(t\\,0.5)\\,0\\,if(lt(t\\,1.1)\\,(t-0.5)/0.6\\,if(lt(t\\,${(dur - 1.1).toFixed(2)})\\,1\\,if(lt(t\\,${(dur - 0.5).toFixed(2)})\\,(${(dur - 0.5).toFixed(2)}-t)/0.6\\,0))))'`;
  if (text === 'title') {
    return [
      `drawtext=fontfile='${fontBold}':text='Your Story Begins Now.':fontsize=52:fontcolor=white:${fade}:x=(w-text_w)/2:y=h-210:borderw=2:bordercolor=black@0.65`,
      `drawtext=fontfile='${font}':text='Download on Mobile & Web':fontsize=32:fontcolor=white@0.92:${fade}:x=(w-text_w)/2:y=h-140:borderw=2:bordercolor=black@0.55`,
    ].join(',');
  }
  return `drawtext=fontfile='${font}':text='${text}':fontsize=54:fontcolor=white:${fade}:x=(w-text_w)/2:y=h-130:borderw=2:bordercolor=black@0.6`;
}

const list = [];
clips.forEach((clip, index) => {
  if (!fs.existsSync(clip.src)) throw new Error('missing ' + clip.src);
  const frames = Math.round(clip.dur * fps);
  const name = `clip_${String(index + 1).padStart(2, '0')}.mp4`;
  const dest = path.join(dir, name);
  const { x, y } = pan(clip.move);
  const parts = [
    'scale=2400:-2',
    `zoompan=z='${zoom(clip.move)}':x='${x.replaceAll('FRAMES', String(frames))}':y='${y.replaceAll('FRAMES', String(frames))}':d=${frames}:s=1920x1080:fps=${fps}`,
    `fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0, clip.dur - 0.35).toFixed(2)}:d=0.35`,
    'format=yuv420p',
  ];
  const overlay = textFilter(clip.text, clip.dur);
  if (overlay) parts.splice(3, 0, overlay);
  const script = path.join(dir, `f_${index}.txt`);
  fs.writeFileSync(script, parts.join(','));
  console.log('encoding', name, clip.dur);
  const result = spawnSync(ffmpeg, [
    '-y', '-i', clip.src,
    '-filter_script:v', script,
    '-frames:v', String(frames),
    '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-an', dest,
  ], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
  list.push(`file '${dest.replaceAll('\\', '/')}'`);
});

const listPath = path.join(dir, 'list.txt');
fs.writeFileSync(listPath, list.join('\n'));
console.log('muxing');
const mux = spawnSync(ffmpeg, [
  '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-i', song,
  '-map', '0:v:0', '-map', '1:a:0',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
  '-af', 'afade=t=in:st=0:d=0.4,afade=t=out:st=132.3:d=2',
  '-movflags', '+faststart',
  '-t', '134.32',
  out,
], { stdio: 'inherit' });
if (mux.status !== 0) process.exit(mux.status || 1);
console.log('WROTE', out);
