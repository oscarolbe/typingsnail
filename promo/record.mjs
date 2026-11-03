// Records a promo video by playing the real game frame by frame in headless Chromium.
// Time is virtual (we drive requestAnimationFrame ourselves), so playback is perfectly smooth.
// Usage: node promo/record.mjs . promo/typing-snails-promo.mp4 [--preview]
// Needs ffmpeg, plus these env vars:
//   PW_CORE  path to a playwright-core package (e.g. one from `npx playwright install chromium`)
//   CHROME   path to a Chromium executable
// With --preview, the second argument is a folder that gets a PNG still every half second.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE);

const [repo, out] = process.argv.slice(2);
const PREVIEW = process.argv.includes('--preview'); // writes PNG stills instead of a video
const FPS = 30, DT = 1 / FPS, SCALE = 1.5; // 1280x720 game -> 1920x1080 video

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: SCALE });

await page.addInitScript(() => {
  // Seeded random so every run records the same video.
  let seed = 7;
  Math.random = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Virtual clock.
  let now = 0, queue = [];
  performance.now = () => now;
  window.requestAnimationFrame = cb => queue.push(cb);
  window.__step = ms => {
    now += ms;
    const q = queue; queue = [];
    q.forEach(cb => cb(now));
  };
  localStorage.setItem('typing-snails-v2', JSON.stringify({ stars: [], spl: 2.2, sound: false, unlockAll: true }));
});

// Serve the game over HTTP and expose a read-only peek at its private state for the script.
const fs = require('node:fs');
const http = require('node:http');
const server = http.createServer((req, res) => {
  const file = path.join(repo, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file);
  if (file.endsWith('game.js')) {
    body = body.toString().replace('  function currentLetter() {',
      '  window.__state = () => ({ screen, phase: game && game.phase, lane: game && game.laneIndex, letter: currentLetter(),' +
      ' left: game && game.lane && game.lane.bike ? game.lane.total - game.lane.elapsed + game.lane.ready : null });\n  function currentLetter() {');
  }
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
}).listen(0);
await page.goto(`http://localhost:${server.address().port}/`);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => document.fonts.load('700 40px Fredoka'));

const W = 1280, H = 720;
let frameNo = 0, ff = null;
if (!PREVIEW) {
  ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
}

// Overlay state, drawn on top of the game every frame.
let caption = null, captionAge = 0, fade = 0, card = null;

async function frame(capture = true) {
  const png = await page.evaluate(({ dt, caption, captionAge, fade, card, capture }) => {
    window.__step(dt * 1000);
    const c = document.getElementById('game'), ctx = c.getContext('2d');
    const F = '"Fredoka", sans-serif';
    ctx.save();
    if (card) {
      // End card.
      ctx.fillStyle = 'rgba(30,70,30,0.55)';
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.roundRect(290, 148, 700, 420, 36); ctx.fill();
      ctx.fillStyle = '#fffdf7';
      ctx.beginPath(); ctx.roundRect(290, 140, 700, 420, 36); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2b8a3e'; ctx.font = `700 84px ${F}`;
      ctx.fillText('Typing Snails', 640, 240);
      ctx.fillStyle = '#495057'; ctx.font = `600 30px ${F}`;
      ctx.fillText('Free typing game for kids 5+', 640, 310);
      ctx.fillStyle = '#868e96'; ctx.font = `600 24px ${F}`;
      ctx.fillText('No install · no ads · plays in your browser', 640, 352);
      ctx.fillStyle = '#40c057';
      ctx.beginPath(); ctx.roundRect(330, 420, 620, 76, 38); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 32px ${F}`;
      ctx.fillText('oscarolbe.github.io/typingsnail', 640, 459);
    }
    if (caption) {
      const a = Math.min(1, captionAge * 4);
      const y = 646 + (1 - a) * 20;
      ctx.globalAlpha = a;
      ctx.font = `700 34px ${F}`;
      const w = ctx.measureText(caption).width + 64;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.roundRect(640 - w / 2, y + 5, w, 64, 32); ctx.fill();
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath(); ctx.roundRect(640 - w / 2, y, w, 64, 32); ctx.fill();
      ctx.fillStyle = '#5c3d1e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(caption, 640, y + 34);
      ctx.globalAlpha = 1;
    }
    if (fade > 0) {
      ctx.fillStyle = `rgba(20,40,20,${fade})`;
      ctx.fillRect(0, 0, 1280, 720);
    }
    ctx.restore();
    return capture ? c.toDataURL('image/png') : null;
  }, { dt: DT, caption, captionAge, fade, card, capture });
  captionAge += DT;
  if (!png) return;
  const buf = Buffer.from(png.split(',')[1], 'base64');
  if (PREVIEW) {
    if (frameNo % 15 === 0) require('node:fs').writeFileSync(path.join(out, `f${String(frameNo).padStart(4, '0')}.png`), buf);
  } else if (!ff.stdin.write(buf)) {
    await new Promise(r => ff.stdin.once('drain', r));
  }
  frameNo++;
}

const hold = async secs => { for (let i = 0; i < Math.round(secs * FPS); i++) await frame(); };
const skip = async secs => { for (let i = 0; i < Math.round(secs * FPS); i++) await frame(false); };
const key = k => page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k })), k);
const say = text => { caption = text; captionAge = 0; };
const fadeIn = async (secs = 0.4) => { for (let i = 1; i <= secs * FPS; i++) { fade = 1 - i / (secs * FPS); await frame(); } fade = 0; };
const fadeOut = async (secs = 0.4) => { for (let i = 1; i <= secs * FPS; i++) { fade = i / (secs * FPS); await frame(); } };
const state = () => page.evaluate(() => window.__state());

// ---- Storyboard -------------------------------------------------------------
await skip(1);
fade = 1;
await fadeIn(0.6);
await hold(1.4);
say('A typing game for kids 5+');
await hold(2.2);
await fadeOut();

// Menu
caption = null;
await key(' ');
await skip(0.3);
await fadeIn();
say('64 levels, from the very first key');
await hold(1);
for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight']) { await key(k); await hold(0.35); }
await hold(0.6);
await key(' ');
await hold(1.6); // level intro
caption = null;
await key(' ');
await hold(0.5);

// Bike level: type the prompted letters.
say('Type the letter, save the snails!');
let typed = 0;
for (;;) {
  const st = await state();
  if (st.phase === 'finish') break;
  if (!st.letter) { await frame(); continue; }
  if (typed === 3) {
    say('Wrong keys never hurt the snails');
    await key(st.letter === 'f' ? 'j' : 'f');
    await hold(0.9);
  }
  if (typed === 6) say('The hands show which finger to use');
  await key(st.letter);
  typed++;
  await hold(typed % 2 ? 0.45 : 0.75);
}
say('Hooray!');
await hold(2.4);
caption = null;
await hold(1.8); // win screen
await fadeOut();

// Words level with a splash.
await key('Escape');
await skip(0.2);
const wordsLevel = await page.evaluate(() => LEVELS.findIndex(l => l.title === 'More words'));
for (let i = 0; i < wordsLevel; i++) await key('ArrowRight');
await key(' ');
await skip(0.2);
await key(' ');
await skip(0.3);
await fadeIn();
say('Then whole words');
for (;;) {
  const st = await state();
  if (st.lane > 0) break;
  if (st.letter) await key(st.letter);
  await hold(0.4);
}
await hold(1.2);
// Cut ahead to just before the bike reaches the puddle.
while ((await state()).left > 1.6) await frame(false);
say("Too slow? SPLASH! (The snail's fine)");
await hold(4.2);
caption = null;
await fadeOut();

// End card
card = true;
for (let i = 0; i < 3; i++) await key('Escape');
await skip(0.5);
await fadeIn();
await hold(4.5);
await fadeOut(0.6);

server.close();
await browser.close();
if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); }
console.log(`frames: ${frameNo} (${(frameNo / FPS).toFixed(1)}s)`);
