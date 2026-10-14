(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const { TAU, font, rr, shade } = Art;
  const W = 1280, H = 720;

  // ---- Layout ---------------------------------------------------------------
  const ROAD_TOP = 96, ROAD_BOTTOM = 490;
  const ROAD_LEFT = 160, ROAD_RIGHT = 1120, ISLAND = 96;
  const START_X = 110, END_X = 1170, GARDEN_X = 1212;
  const GROUP_Y = 410, SNAIL_SCALE = 0.85;
  const SLOTS = [-60, -30, 0, 30, 60].map((dy, i) => ({ dy, dx: i % 2 ? 14 : -14 }));
  const SHELLS = ['#ff6b6b', '#ffa94d', '#cc5de8', '#20c997', '#4dabf7'];
  const BIKE_COLORS = ['#e64980', '#7950f2', '#1c7ed6', '#f76707', '#2f9e44'];
  const HELMETS = ['#fab005', '#ff6b6b', '#ffffff', '#69db7c', '#74c0fc'];
  const SHIRTS = ['#339af0', '#f06595', '#20c997', '#845ef7', '#ff922b'];
  const MUD = ['#7a5230', '#8d6e4c', '#5c3d1e'];
  const CONFETTI = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#cc5de8', '#ffa94d'];

  // Keyboard on screen
  const KB_OFFSET = [0, 0.28, 0.78];
  const KEY_W = 52, KEY_H = 48, KEY_PITCH = 58, ROW_PITCH = 55, KB_TOP = 506;
  const KB_LEFT = W / 2 - (9 * KEY_PITCH + KEY_W + KB_OFFSET[2] * KEY_PITCH) / 2;
  const KEY_RECTS = {};
  KB_ROWS.forEach((row, r) => [...row].forEach((k, i) => {
    KEY_RECTS[k] = { x: KB_LEFT + (i + KB_OFFSET[r]) * KEY_PITCH, y: KB_TOP + r * ROW_PITCH, w: KEY_W, h: KEY_H };
  }));

  // Seconds per letter adapt to the child: faster after quick lanes, slower after splashes.
  const SPL_START = 4, SPL_MIN = 0.8, SPL_MAX = 7;

  // ---- Save data ------------------------------------------------------------
  const SAVE_KEY = 'typing-snails-v2';
  const save = (() => {
    const base = { stars: [], spl: SPL_START, sound: true, unlockAll: false };
    try { return Object.assign(base, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); }
    catch (e) { return base; }
  })();
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ }
  }
  Sound.on = save.sound;

  // ---- State ----------------------------------------------------------------
  let screen = 'title'; // title | menu | intro | play | pause | win | lose
  let game = null;
  let particles = [];
  let buttons = [];
  let menuSel = 0, resetArmed = 0, time = 0;
  const mouse = { x: -1, y: -1 };
  const keyFlash = {};
  const TUFTS = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: ROAD_TOP + Math.random() * (H - ROAD_TOP) }));
  const ambient = { layout: makeLayout(4), bikes: [], spawn: 0 };

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isUnlocked = i => i === 0 || save.unlockAll || (save.stars[i - 1] || 0) > 0;
  const aliveSlots = () => game.snails.map((s, i) => (s.alive ? i : -1)).filter(i => i >= 0);
  const bikeLook = () => ({ color: pick(BIKE_COLORS), helmet: pick(HELMETS), shirt: pick(SHIRTS) });

  function makeLayout(lanes) {
    const laneW = (ROAD_RIGHT - ROAD_LEFT - (lanes - 1) * ISLAND) / lanes;
    const laneX = i => ROAD_LEFT + i * (laneW + ISLAND);
    return {
      lanes, laneW, laneX,
      laneCenter: i => laneX(i) + laneW / 2,
      // Where the snails wait before crossing lane i.
      standX: i => (i <= 0 ? START_X : i >= lanes ? END_X : laneX(i) - ISLAND / 2),
    };
  }

  // ---- Flow -----------------------------------------------------------------
  function goMenu() {
    screen = 'menu';
    game = null;
    particles = [];
    menuSel = 0;
    while (menuSel < LEVELS.length - 1 && (save.stars[menuSel] || 0) > 0) menuSel++;
    Sound.hush();
  }

  function startLevel(i) {
    const cfg = LEVELS[i];
    game = {
      level: i, cfg, keys: levelKeys(i), layout: makeLayout(cfg.lanes),
      snails: SHELLS.map(color => ({ color, alive: true })),
      laneIndex: 0, lane: null, passing: [],
      x: START_X, tx: START_X, moving: false, fast: false, shock: 0,
      phase: 'run', timer: 0, correct: 0, mistakes: 0, lastLetter: null, recentWords: [], stars: 0, endTime: 0,
    };
    particles = [];
    screen = 'intro';
    Sound.say(cfg.words ? "Let's type some words!"
      : cfg.pool === 'all' ? "Let's practice all your keys!"
      : 'Keys: ' + [...cfg.keys].map(c => KEY_SAY[c]).join(', '));
  }

  // Seconds the child gets per letter on this level.
  function secondsPerLetter() {
    const cfg = game.cfg;
    return Math.min(save.spl, cfg.maxSpl || Infinity) * cfg.slow;
  }

  function beginPlay() {
    screen = 'play';
    newLane();
  }

  function newLane() {
    const g = game;
    let letters, word = null;
    if (g.cfg.words) {
      word = pickWord(g.keys, g.recentWords);
      g.recentWords = [word, ...g.recentWords].slice(0, 6);
      letters = [...word];
    } else {
      letters = [];
      for (let i = 0; i < g.cfg.perLane; i++) letters.push(g.lastLetter = pickLetter(g.keys, g.lastLetter));
    }
    const frontY = GROUP_Y + SLOTS[aliveSlots()[0]].dy;
    const puddleY = frontY - 40;
    const startY = ROAD_TOP + 20; // low enough to peek out from under the hedge
    g.lane = {
      letters, pos: 0, ready: 0.8, elapsed: 0, rang: false, wiggle: 0, puddleY,
      total: letters.length * secondsPerLetter(),
      // Calm levels have no bike, so there is no timer at all.
      bike: g.cfg.calm ? null
        : { x: g.layout.laneCenter(g.laneIndex), y: startY, startY, hitY: puddleY - 30, speed: 0, pause: 0, ...bikeLook() },
    };
    g.phase = 'run';
    g.tx = groupX();
    if (word) Sound.say(`${word}. ${KEY_SAY[letters[0]]}`);
    else sayLetter();
  }

  function groupX() {
    const g = game, L = g.layout;
    const from = L.standX(g.laneIndex), to = L.standX(g.laneIndex + 1);
    const p = g.lane ? g.lane.pos / g.lane.letters.length : 0;
    return from + (to - from) * p;
  }

  function currentLetter() {
    return game && game.lane ? game.lane.letters[game.lane.pos] : null;
  }

  function sayLetter() {
    const c = currentLetter();
    if (c) Sound.say(KEY_SAY[c]);
  }

  function adjustSpeed(factor) {
    save.spl = clamp(save.spl * factor, SPL_MIN, SPL_MAX);
    persist();
  }

  function typeKey(k) {
    const g = game, l = g.lane;
    if (g.phase !== 'run' || !l) return;
    if (k === l.letters[l.pos]) {
      keyFlash[k] = { t: 0.25, ok: true };
      l.pos++;
      g.correct++;
      Sound.step(l.pos);
      g.tx = groupX();
      sparkle(g.tx + 20, GROUP_Y - 80, 6);
      if (l.pos >= l.letters.length) laneDone();
      else sayLetter();
    } else {
      // Wrong keys never hurt the snails, they just wiggle the prompt.
      keyFlash[k] = { t: 0.3, ok: false };
      g.mistakes++;
      l.wiggle = 0.35;
      Sound.oops();
    }
  }

  function laneDone() {
    const g = game, l = g.lane, b = l.bike;
    if (b) {
      // Speed up gently when the child is comfortably fast.
      const used = l.elapsed / l.total;
      if (used < 0.4) adjustSpeed(0.95);
      else if (used < 0.65) adjustSpeed(0.98);
      b.speed = Math.max(260, (b.hitY - b.startY) / l.total * 1.6);
      g.passing.push(b);
    }
    Sound.laneDone();
    sparkle(g.tx, GROUP_Y - 60, 12);
    g.laneIndex++;
    if (g.laneIndex >= g.cfg.lanes) {
      g.lane = null;
      g.phase = 'finish';
      g.timer = 2;
      g.tx = GARDEN_X;
      Sound.win();
      Sound.say('Hooray!');
      confetti();
    } else {
      newLane();
    }
  }

  // Time ran out: the bike rides through the puddle and splashes the front snail,
  // which hides in its shell and rolls back home. The rest of the group steps back.
  function splash() {
    const g = game, l = g.lane, b = l.bike;
    const front = aliveSlots()[0];
    const snail = g.snails[front];
    snail.alive = false;
    const sx = g.x + SLOTS[front].dx, sy = GROUP_Y + SLOTS[front].dy;
    addParticle({ type: 'shell', x: sx, y: sy, vx: -400, vy: -360, g: 1100, ground: sy + 6, vr: -11, color: snail.color, life: 5 });
    for (let i = 0; i < 26; i++) {
      addParticle({
        x: b.x + (Math.random() - 0.5) * 30, y: l.puddleY,
        vx: (Math.random() - 0.65) * 520, vy: -180 - Math.random() * 360, g: 1000,
        life: 0.9, size: 4 + Math.random() * 6, color: pick(MUD),
      });
    }
    addParticle({ type: 'text', text: 'SPLASH!', x: b.x, y: l.puddleY - 40, vy: -30, life: 1.3, size: 40, color: '#7a5230' });
    Sound.splash();
    adjustSpeed(1.2);

    g.shock = 1;
    g.fast = true;
    l.pos = 0;
    g.tx = groupX();
    b.pause = 0.35;
    b.speed = 300;
    g.passing.push(b);
    g.lane = null;
    g.phase = 'recover';
    g.timer = 1.5;
  }

  function endLevel(won) {
    const g = game;
    g.endTime = time;
    if (won) {
      g.stars = levelStars();
      save.stars[g.level] = Math.max(save.stars[g.level] || 0, g.stars);
      persist();
      screen = 'win';
    } else {
      screen = 'lose';
      Sound.lose();
      Sound.say("Oh no! Let's try again.");
    }
  }

  const accuracy = () => game.correct / Math.max(1, game.correct + game.mistakes);

  // Bike levels score snails saved; calm levels score accuracy (gently);
  // perfectionist levels need both.
  function levelStars() {
    const g = game, n = aliveSlots().length, acc = accuracy();
    const bySnails = n >= 5 ? 3 : n >= 3 ? 2 : 1;
    if (g.cfg.calm) return acc >= 0.8 ? 3 : acc >= 0.55 ? 2 : 1;
    if (g.cfg.perfect) return Math.min(bySnails, acc >= 0.97 ? 3 : acc >= 0.9 ? 2 : 1);
    return bySnails;
  }

  function nextLevel() {
    if (game.level + 1 < LEVELS.length) startLevel(game.level + 1);
    else goMenu();
  }

  function tryStart(i) {
    if (isUnlocked(i)) startLevel(i);
    else Sound.oops();
  }

  function toggleSound() {
    save.sound = Sound.on = !save.sound;
    if (!save.sound) Sound.hush();
    persist();
  }

  function resetProgress() {
    if (resetArmed > 0) {
      save.stars = [];
      save.spl = SPL_START;
      save.unlockAll = false;
      persist();
      resetArmed = 0;
      menuSel = 0;
    } else {
      resetArmed = 3;
    }
  }

  // ---- Particles ------------------------------------------------------------
  function addParticle(p) {
    particles.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 1, age: 0, size: 6, color: '#fff', type: 'dot', rot: 0, vr: 0 }, p));
  }

  function sparkle(x, y, n) {
    for (let i = 0; i < n; i++) {
      addParticle({
        type: 'star', x, y, vx: (Math.random() - 0.5) * 300, vy: -100 - Math.random() * 200, g: 400,
        life: 0.7, size: 7 + Math.random() * 7, color: '#ffd43b', vr: (Math.random() - 0.5) * 8,
      });
    }
  }

  function confetti() {
    for (let i = 0; i < 90; i++) {
      addParticle({
        type: 'confetti', x: Math.random() * W, y: ROAD_TOP - Math.random() * 60,
        vx: (Math.random() - 0.5) * 160, vy: 60 + Math.random() * 160, g: 60,
        life: 3.5, size: 10 + Math.random() * 8, color: pick(CONFETTI), vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === 'shell' && p.y > p.ground) {
        p.y = p.ground;
        p.vy = -Math.abs(p.vy) * 0.45;
      }
    }
    particles = particles.filter(p => p.age < p.life && p.x > -80);
  }

  // ---- Update ---------------------------------------------------------------
  function update(dt) {
    time += dt;
    for (const k in keyFlash) if ((keyFlash[k].t -= dt) <= 0) delete keyFlash[k];
    if (resetArmed > 0) resetArmed -= dt;
    updateParticles(dt);
    if (screen === 'title' || screen === 'menu') updateAmbient(dt);
    else if (game && screen !== 'pause' && screen !== 'intro') updateGame(dt);
  }

  function updateGame(dt) {
    const g = game;
    g.x += (g.tx - g.x) * Math.min(1, dt * (g.fast ? 14 : 5));
    g.moving = Math.abs(g.tx - g.x) > 1.5;
    if (!g.moving) g.fast = false;
    g.shock = Math.max(0, g.shock - dt);
    for (const b of g.passing) {
      if (b.pause > 0) b.pause -= dt;
      else b.y += b.speed * dt;
    }
    g.passing = g.passing.filter(b => b.y < ROAD_BOTTOM + 80);
    if (g.lane) g.lane.wiggle = Math.max(0, g.lane.wiggle - dt);
    if (screen !== 'play') return;

    if (g.phase === 'run') {
      const l = g.lane, b = l.bike;
      if (!b) return;
      if (l.ready > 0) l.ready -= dt;
      else l.elapsed += dt;
      const f = Math.min(1, l.elapsed / l.total);
      b.y = b.startY + (b.hitY - b.startY) * f;
      if (f > 0.6 && !l.rang) { l.rang = true; Sound.bell(); }
      if (f >= 1) splash();
    } else {
      g.timer -= dt;
      if (g.timer <= 0) {
        if (g.phase === 'finish') endLevel(true);
        else if (aliveSlots().length) newLane();
        else endLevel(false);
      }
    }
  }

  function updateAmbient(dt) {
    const a = ambient;
    a.spawn -= dt;
    if (a.spawn <= 0) {
      a.spawn = 0.8 + Math.random() * 1.5;
      const lane = Math.floor(Math.random() * a.layout.lanes);
      if (!a.bikes.some(b => b.lane === lane && b.y < ROAD_TOP + 160)) {
        a.bikes.push({ lane, x: a.layout.laneCenter(lane), y: ROAD_TOP - 60, speed: 140 + Math.random() * 120, ...bikeLook() });
      }
    }
    for (const b of a.bikes) b.y += b.speed * dt;
    a.bikes = a.bikes.filter(b => b.y < H + 80);
  }

  // ---- Drawing: scene -------------------------------------------------------
  function drawScene(L, roadBottom) {
    ctx.fillStyle = '#8fd16a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#78bb55';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const t of TUFTS) {
      ctx.moveTo(t.x - 5, t.y); ctx.lineTo(t.x - 7, t.y - 7);
      ctx.moveTo(t.x, t.y); ctx.lineTo(t.x, t.y - 9);
      ctx.moveTo(t.x + 5, t.y); ctx.lineTo(t.x + 7, t.y - 7);
    }
    ctx.stroke();

    const roadH = roadBottom - ROAD_TOP;
    ctx.fillStyle = '#b9ad92';
    ctx.fillRect(ROAD_LEFT - 6, ROAD_TOP, ROAD_RIGHT - ROAD_LEFT + 12, roadH);
    for (let i = 0; i < L.lanes; i++) {
      const x = L.laneX(i);
      ctx.fillStyle = '#5b6372';
      ctx.fillRect(x, ROAD_TOP, L.laneW, roadH);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x + 5, ROAD_TOP, 3, roadH);
      ctx.fillRect(x + L.laneW - 8, ROAD_TOP, 3, roadH);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 16]);
      ctx.beginPath();
      ctx.moveTo(x + L.laneW / 2, ROAD_TOP);
      ctx.lineTo(x + L.laneW / 2, roadBottom);
      ctx.stroke();
      ctx.setLineDash([]);
      drawBikeLaneSign(x + L.laneW / 2, ROAD_TOP + 150);
    }
    for (let i = 1; i < L.lanes; i++) {
      const x = L.laneX(i) - ISLAND;
      ctx.fillStyle = '#d9cfb8';
      ctx.fillRect(x, ROAD_TOP, ISLAND, roadH);
      ctx.fillStyle = '#b9ad92';
      ctx.fillRect(x, ROAD_TOP, 6, roadH);
      ctx.fillRect(x + ISLAND - 6, ROAD_TOP, 6, roadH);
    }

    // Snail home on the left, lettuce garden on the right.
    Art.mushroom(ctx, 70, 200);
    for (const [fx, fy, c] of [[40, 300, '#ff8fab'], [120, 270, '#ffd43b'], [60, 460, '#b197fc'], [130, 150, '#ff8fab']]) {
      ctx.fillStyle = c;
      for (let a = 0; a < 5; a++) {
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a * 1.256) * 6, fy + Math.sin(a * 1.256) * 6, 5, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#fff3bf';
      ctx.beginPath(); ctx.arc(fx, fy, 4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#8d6e4c';
    rr(ctx, 1134, 126, 134, 350, 20);
    ctx.fill();
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 2; c++) Art.lettuce(ctx, 1170 + c * 62, 160 + r * 56 + (c ? 20 : 0));
    }
  }

  function drawBikeLaneSign(x, y) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x - 12, y, 9, 0, TAU);
    ctx.moveTo(x + 21, y);
    ctx.arc(x + 12, y, 9, 0, TAU);
    ctx.moveTo(x - 12, y); ctx.lineTo(x - 2, y - 12); ctx.lineTo(x + 12, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawHedge() {
    ctx.fillStyle = '#4f9f47';
    ctx.fillRect(0, 0, W, ROAD_TOP);
    for (let i = 0, x = 0; x < W + 40; i++, x += 44) {
      ctx.fillStyle = '#5cb352';
      ctx.beginPath(); ctx.arc(x + (i % 2) * 8, ROAD_TOP - 4, 26, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6cc061';
      ctx.beginPath(); ctx.arc(x + (i % 2) * 8 - 6, ROAD_TOP - 12, 10, 0, TAU); ctx.fill();
    }
  }

  function clipRoad(bottom) {
    ctx.beginPath();
    ctx.rect(ROAD_LEFT - 60, ROAD_TOP, ROAD_RIGHT - ROAD_LEFT + 120, bottom - ROAD_TOP);
    ctx.clip();
  }

  // ---- Drawing: game --------------------------------------------------------
  function drawGame() {
    const g = game, l = g.lane, b = l && l.bike;
    if (b) Art.puddle(ctx, b.x, l.puddleY, time);
    ctx.save();
    clipRoad(ROAD_BOTTOM);
    for (const p of g.passing) Art.bike(ctx, p.x, p.y, { ...p, moving: p.pause <= 0 });
    if (b) Art.bike(ctx, b.x, b.y, { ...b, moving: l.ready <= 0 });
    ctx.restore();

    const worried = b && l.elapsed / l.total > 0.7;
    const party = g.phase === 'finish' || screen === 'win';
    g.snails.forEach((s, i) => {
      if (!s.alive) return;
      const hop = party && !g.moving ? -Math.abs(Math.sin(time * 7 + i)) * 12 : 0;
      Art.snail(ctx, g.x + SLOTS[i].dx, GROUP_Y + SLOTS[i].dy + hop, {
        color: s.color, t: time + i * 0.7, moving: g.moving, shocked: g.shock > 0 || worried, s: SNAIL_SCALE,
      });
    });
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = clamp((p.life - p.age) / 0.4, 0, 1);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.type === 'shell') {
        Art.shellIcon(ctx, 0, 0, p.color, SNAIL_SCALE);
      } else if (p.type === 'star') {
        Art.star(ctx, 0, 0, p.size, p.color);
      } else if (p.type === 'confetti') {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.type === 'text') {
        const s = Math.min(1, p.age * 6);
        ctx.scale(s, s);
        ctx.font = font(p.size, 700);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#fff';
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function pill(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    rr(ctx, x, y + 4, w, h, h / 2); ctx.fill();
    ctx.fillStyle = '#fff';
    rr(ctx, x, y, w, h, h / 2); ctx.fill();
  }

  function text(str, x, y, size, color, { weight = 600, align = 'center' } = {}) {
    ctx.font = font(size, weight);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawHud() {
    const g = game;
    drawHedge();

    pill(16, 16, 250, 64);
    g.snails.forEach((s, i) => {
      ctx.save();
      if (!s.alive) ctx.globalAlpha = 0.3;
      Art.shellIcon(ctx, 52 + i * 45, 48, s.alive ? s.color : '#adb5bd', 0.8);
      ctx.restore();
    });

    pill(W - 316, 16, 300, 64);
    text(`Level ${g.level + 1}`, W - 290, 38, 22, '#343a40', { align: 'left', weight: 700 });
    text(levelTag(g.cfg), W - 290, 62, 18, '#868e96', { align: 'left' });
    iconButton(W - 124, 26, 44, 'sound', toggleSound);
    if (screen === 'play') iconButton(W - 72, 26, 44, 'pause', () => { screen = 'pause'; });

    drawPrompt();
  }

  // Short description of what a level practices, for the HUD and menu cards.
  function levelTag(cfg) {
    if (cfg.words) {
      const { min, max } = cfg.words;
      return `Words: ${min === max ? min : `${min}–${max}`} letters`;
    }
    if (cfg.pool === 'all') return 'All keys';
    return [...cfg.keys].join(' ').toUpperCase() + (cfg.pool === 'mix' ? ' + old' : '');
  }

  // The big letter bubble at the top of the screen.
  function drawPrompt() {
    const g = game, l = g.lane;
    if (!l || screen === 'intro') {
      const msg = screen === 'intro' ? g.cfg.title
        : g.phase === 'recover' ? 'Oops! Try again'
        : g.phase === 'finish' || screen === 'win' ? 'Hooray!'
        : '';
      if (!msg) return;
      pill(W / 2 - 170, 12, 340, 72);
      text(msg, W / 2, 49, 32, g.phase === 'recover' ? '#7a5230' : '#2b8a3e', { weight: 700 });
      return;
    }
    const n = l.letters.length, cw = 78, w = n * cw + 40, h = 80;
    const x = W / 2 - w / 2 + Math.sin(time * 60) * 9 * (l.wiggle / 0.35), y = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    rr(ctx, x, y + 5, w, h, 24); ctx.fill();
    ctx.fillStyle = '#fff';
    rr(ctx, x, y, w, h, 24); ctx.fill();
    l.letters.forEach((c, i) => {
      const cx = x + 20 + cw * i + cw / 2, cy = y + 36, label = c.toUpperCase();
      if (i < l.pos) {
        text(label, cx, cy, 40, '#40c057', { weight: 700 });
      } else if (i === l.pos) {
        const s = 1 + Math.sin(time * 8) * 0.06;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.fillStyle = FINGER_COLORS[fingerOf(c)];
        ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU); ctx.fill();
        text(label, 0, 2, 54, '#212529', { weight: 700 });
        ctx.restore();
      } else {
        text(label, cx, cy, 40, '#ced4da', { weight: 700 });
      }
    });
    // Time left before the bike reaches the puddle.
    if (!l.bike) return;
    const left = 1 - Math.min(1, l.elapsed / l.total);
    ctx.fillStyle = '#e9ecef';
    rr(ctx, x + 18, y + h - 13, w - 36, 7, 3.5); ctx.fill();
    ctx.fillStyle = left > 0.5 ? '#51cf66' : left > 0.25 ? '#fcc419' : '#ff6b6b';
    rr(ctx, x + 18, y + h - 13, (w - 36) * left, 7, 3.5); ctx.fill();
  }

  function drawKeyboardArea() {
    const g = game, all = g.keys.all;
    const target = screen === 'intro' ? g.keys.fresh[Math.floor(time) % g.keys.fresh.length] : currentLetter();

    ctx.fillStyle = '#f6ecd9';
    ctx.fillRect(0, ROAD_BOTTOM, W, H - ROAD_BOTTOM);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, ROAD_BOTTOM, W, 5);

    ctx.fillStyle = '#ddd3c1';
    rr(ctx, KB_LEFT - 14, KB_TOP - 12, 10 * KEY_PITCH + KB_OFFSET[2] * KEY_PITCH + 22, 222, 18);
    ctx.fill();
    for (const k in KEY_RECTS) {
      const r = KEY_RECTS[k], color = FINGER_COLORS[fingerOf(k)], flash = keyFlash[k];
      let o;
      if (flash) o = { fill: flash.ok ? '#8ce99a' : '#ff8787', text: '#212529', down: 1 };
      else if (k === target) o = { fill: color, text: '#212529', outline: '#212529', glow: color };
      else if (all.includes(k)) o = { fill: shade(color, 0.55), text: '#343a40' };
      else o = { fill: '#eef0f2', text: '#b5bcc4' };
      Art.key(ctx, r.x, r.y, r.w, r.h, k.toUpperCase(), o);
      if (k === 'f' || k === 'j') {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        rr(ctx, r.x + r.w / 2 - 8, r.y + r.h - 10, 16, 3, 1.5); ctx.fill();
      }
    }
    Art.key(ctx, KB_LEFT + 2.5 * KEY_PITCH, KB_TOP + 3 * ROW_PITCH, 5 * KEY_PITCH - 6, 34, '', { fill: '#eef0f2' });

    if (target) {
      const r = KEY_RECTS[target], bob = Math.abs(Math.sin(time * 6)) * 6;
      const ax = r.x + r.w / 2, ay = r.y - 6 - bob;
      ctx.fillStyle = '#212529';
      ctx.beginPath();
      ctx.moveTo(ax - 10, ay - 12); ctx.lineTo(ax + 10, ay - 12); ctx.lineTo(ax, ay);
      ctx.closePath();
      ctx.fill();
    }

    const lit = [...new Set([...all].map(fingerOf))];
    const tf = target ? fingerOf(target) : -1;
    Art.hand(ctx, 172, 636, true, { lit, target: tf, t: time });
    Art.hand(ctx, W - 172, 636, false, { lit, target: tf, t: time });
    if (tf >= 0) text(FINGER_NAMES[tf], tf < 5 ? 172 : W - 172, 702, 18, '#868e96');
  }

  // ---- Drawing: buttons & overlays ------------------------------------------
  function hovered(x, y, w, h) {
    return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  }

  function button(x, y, w, h, label, onClick, color = '#40c057') {
    const hover = hovered(x, y, w, h);
    ctx.fillStyle = shade(color, -0.25);
    rr(ctx, x, y + 5, w, h, h / 2); ctx.fill();
    ctx.fillStyle = hover ? shade(color, 0.12) : color;
    rr(ctx, x, y + (hover ? 2 : 0), w, h, h / 2); ctx.fill();
    text(label, x + w / 2, y + h / 2 + (hover ? 3 : 1), 24, '#fff', { weight: 700 });
    buttons.push({ x, y, w, h, onClick });
  }

  function iconButton(x, y, s, icon, onClick) {
    ctx.fillStyle = hovered(x, y, s, s) ? '#e9ecef' : '#f1f3f5';
    ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s / 2, 0, TAU); ctx.fill();
    const cx = x + s / 2, cy = y + s / 2;
    ctx.fillStyle = ctx.strokeStyle = '#495057';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (icon === 'pause') {
      rr(ctx, cx - 9, cy - 10, 6, 20, 2); ctx.fill();
      rr(ctx, cx + 3, cy - 10, 6, 20, 2); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 5); ctx.lineTo(cx - 6, cy - 5); ctx.lineTo(cx + 2, cy - 12);
      ctx.lineTo(cx + 2, cy + 12); ctx.lineTo(cx - 6, cy + 5); ctx.lineTo(cx - 12, cy + 5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      if (save.sound) {
        ctx.arc(cx + 4, cy, 7, -0.8, 0.8);
        ctx.moveTo(cx + 9, cy - 9);
        ctx.arc(cx + 4, cy, 12, -0.8, 0.8);
      } else {
        ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx + 14, cy + 6);
        ctx.moveTo(cx + 14, cy - 6); ctx.lineTo(cx + 6, cy + 6);
      }
      ctx.stroke();
    }
    buttons.push({ x, y, w: s, h: s, onClick });
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(20,50,20,0.35)';
    ctx.fillRect(0, ROAD_TOP, W, ROAD_BOTTOM - ROAD_TOP);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    rr(ctx, x, y + 8, w, h, 30); ctx.fill();
    ctx.fillStyle = '#fffdf7';
    rr(ctx, x, y, w, h, 30); ctx.fill();
  }

  function drawIntro() {
    const g = game, cfg = g.cfg;
    panel(300, 112, 680, 362);
    text(`Level ${g.level + 1}  ·  ${WORLDS[cfg.world].title}`, W / 2, 146, 22, '#868e96');
    text(cfg.title, W / 2, 190, 46, shade(WORLDS[cfg.world].color, -0.3), { weight: 700 });

    if (cfg.words) {
      text('Type whole words!', W / 2, 242, 22, '#868e96');
      text(g.keys.words.slice(0, 4).map(w => w.toUpperCase()).join('   '), W / 2, 302, 44, '#343a40', { weight: 700 });
    } else if (cfg.pool === 'all') {
      text('All your keys!', W / 2, 242, 22, '#868e96');
      drawKeyRow([...g.keys.all], 302, 36, 6);
    } else {
      const isNew = [...cfg.keys].some(c => !learnedBefore(g.level).includes(c));
      text(cfg.pool === 'mix' ? 'These keys, plus the ones you know' : isNew ? 'New keys' : 'Keys', W / 2, 242, 22, '#868e96');
      drawKeyRow([...cfg.keys], 302, 70, 14);
    }

    const tips = cfg.calm ? ['No bikes here. Take your time!', 'Find the glowing key and press it.']
      : cfg.perfect ? ['Be quick, and try to make zero oops!', 'Perfect typing earns 3 stars.']
      : ['Watch out for bikes!', 'Type before the bike reaches the puddle.'];
    if (cfg.world === 0) tips[1] += '  Feel the bumps on F and J.';
    text(tips[0], W / 2, 362, 20, '#495057', { weight: 700 });
    text(tips[1], W / 2, 390, 19, '#495057');
    button(W / 2 - 130, 414, 260, 50, 'Start  (Space)', beginPlay);
  }

  // Key caps centered on cy, wrapping onto more rows when they don't fit the panel.
  function drawKeyRow(keys, cy, size, gap) {
    const perRow = Math.floor((620 + gap) / (size + gap));
    const rows = Math.ceil(keys.length / perRow);
    keys.forEach((c, i) => {
      const row = Math.floor(i / perRow), inRow = Math.min(perRow, keys.length - row * perRow);
      const x = W / 2 - (inRow * size + (inRow - 1) * gap) / 2 + (i % perRow) * (size + gap);
      const y = cy - (rows * size + (rows - 1) * gap) / 2 + row * (size + gap);
      Art.key(ctx, x, y, size, size, c.toUpperCase(), { fill: FINGER_COLORS[fingerOf(c)], text: '#212529', size: size * 0.55 });
    });
  }

  function drawWin() {
    const g = game, age = time - g.endTime;
    panel(340, 112, 600, 362);
    text('Hooray!', W / 2, 168, 56, '#2b8a3e', { weight: 700 });
    for (let i = 0; i < 3; i++) {
      const s = clamp((age - 0.3 - i * 0.3) * 5, 0, 1);
      const earned = i < g.stars;
      Art.star(ctx, W / 2 + (i - 1) * 100, 252, 40, '#e9ecef', '#ced4da');
      if (earned && s > 0) {
        ctx.save();
        ctx.translate(W / 2 + (i - 1) * 100, 252);
        ctx.scale(s * (1 + Math.sin(s * Math.PI) * 0.3), s * (1 + Math.sin(s * Math.PI) * 0.3));
        Art.star(ctx, 0, 0, 40, '#ffd43b', '#f59f00');
        ctx.restore();
      }
    }
    text(`Snails saved: ${aliveSlots().length} of 5`, W / 2, 322, 28, '#343a40', { weight: 700 });
    text(`Right keys: ${g.correct}    Oops keys: ${g.mistakes}    Accuracy: ${Math.round(accuracy() * 100)}%`,
      W / 2, 358, 20, '#868e96');
    const hasNext = g.level + 1 < LEVELS.length;
    button(372, 400, 170, 54, hasNext ? 'Next' : 'Done', nextLevel);
    button(555, 400, 170, 54, 'Again', () => startLevel(g.level), '#4dabf7');
    button(738, 400, 170, 54, 'Levels', goMenu, '#adb5bd');
  }

  function drawLose() {
    panel(340, 112, 600, 362);
    text('Oh no!', W / 2, 170, 56, '#7a5230', { weight: 700 });
    game.snails.forEach((s, i) => Art.shellIcon(ctx, W / 2 + (i - 2) * 56, 248, s.color, 1, Math.sin(time * 3 + i) * 0.3));
    text('The snails got splashed.', W / 2, 314, 26, '#343a40');
    text("Let's try again!", W / 2, 350, 26, '#343a40');
    button(440, 400, 200, 54, 'Try again', () => startLevel(game.level));
    button(660, 400, 180, 54, 'Levels', goMenu, '#adb5bd');
  }

  function drawPause() {
    panel(390, 170, 500, 250);
    text('Paused', W / 2, 236, 52, '#343a40', { weight: 700 });
    button(450, 310, 200, 54, 'Continue', () => { screen = 'play'; });
    button(670, 310, 160, 54, 'Levels', goMenu, '#adb5bd');
  }

  function drawAmbient() {
    ctx.save();
    clipRoad(H);
    for (const b of ambient.bikes) Art.bike(ctx, b.x, b.y, { ...b, moving: true });
    ctx.restore();
    drawHedge();
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    rr(ctx, 330, 148, 620, 400, 36); ctx.fill();
    ctx.fillStyle = '#fffdf7';
    rr(ctx, 330, 140, 620, 400, 36); ctx.fill();
    text('Typing Snails', W / 2, 228, 80, '#2b8a3e', { weight: 700 });
    text('Help the snails cross the bike road!', W / 2, 290, 26, '#868e96');
    SHELLS.slice(0, 3).forEach((c, i) => {
      Art.snail(ctx, W / 2 + (i - 1) * 110, 378, { color: c, t: time + i, moving: true, s: 1.1 });
    });
    const pulse = 1 + Math.sin(time * 4) * 0.03;
    ctx.save();
    ctx.translate(W / 2, 470);
    ctx.scale(pulse, pulse);
    ctx.translate(-W / 2, -470);
    button(W / 2 - 150, 442, 300, 58, 'Play  (Space)', goMenu);
    ctx.restore();
  }

  const MENU_COLS = 5;
  const worldLevels = w => LEVELS.map((lv, i) => i).filter(i => LEVELS[i].world === w);

  function fitText(str, maxW, size, weight = 600) {
    ctx.font = font(size, weight);
    while (size > 12 && ctx.measureText(str).width > maxW) ctx.font = font(--size, weight);
    return size;
  }

  function drawMenu() {
    ctx.fillStyle = 'rgba(25,55,25,0.5)';
    ctx.fillRect(0, 0, W, H);
    const w = LEVELS[menuSel].world, wd = WORLDS[w], ids = worldLevels(w);
    const got = ids.reduce((sum, i) => sum + (save.stars[i] || 0), 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    text(`World ${w + 1}: ${wd.title}`, W / 2, 50, 44, '#fff', { weight: 700 });
    ctx.restore();
    Art.star(ctx, W / 2 - 46, 92, 12, '#ffd43b', '#f59f00');
    text(`${got} / ${ids.length * 3}`, W / 2 - 28, 93, 22, '#fff', { align: 'left', weight: 700 });

    const cw = 204, ch = 120, gap = 20, x0 = (W - (MENU_COLS * cw + (MENU_COLS - 1) * gap)) / 2, y0 = 122;
    ids.forEach((i, n) => {
      const lv = LEVELS[i], open = isUnlocked(i);
      const x = x0 + (n % MENU_COLS) * (cw + gap);
      const y = y0 + Math.floor(n / MENU_COLS) * (ch + gap) + (i === menuSel ? Math.sin(time * 5) * 3 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      rr(ctx, x, y + 6, cw, ch, 20); ctx.fill();
      ctx.fillStyle = open ? '#fff' : '#dee2e6';
      rr(ctx, x, y, cw, ch, 20); ctx.fill();
      if (i === menuSel) { ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 6; ctx.stroke(); }

      ctx.fillStyle = open ? wd.color : '#adb5bd';
      ctx.beginPath(); ctx.arc(x + 28, y + 28, 18, 0, TAU); ctx.fill();
      text(String(i + 1), x + 28, y + 29, i + 1 > 9 ? 18 : 21, '#fff', { weight: 700 });
      const size = fitText(lv.title, cw - 64, 19);
      text(lv.title, x + 54, y + 29, size, open ? '#343a40' : '#868e96', { align: 'left' });

      if (open) {
        const tag = levelTag(lv);
        text(tag, x + cw / 2, y + 66, fitText(tag, cw - 24, 26, 700), '#495057', { weight: 700 });
        const badge = lv.calm ? 'no bikes' : lv.perfect ? 'expert' : '';
        if (badge) text(badge, x + cw - 14, y + 104, 13, lv.calm ? '#2f9e44' : '#e03131', { align: 'right', weight: 700 });
        for (let s = 0; s < 3; s++) {
          const on = s < (save.stars[i] || 0);
          Art.star(ctx, x + 30 + s * 26, y + 102, 10, on ? '#ffd43b' : '#e9ecef', on ? '#f59f00' : '#ced4da');
        }
      } else {
        // padlock
        ctx.strokeStyle = '#868e96';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(x + cw / 2, y + 70, 10, Math.PI, TAU); ctx.stroke();
        ctx.fillStyle = '#868e96';
        rr(ctx, x + cw / 2 - 16, y + 70, 32, 26, 6); ctx.fill();
      }
      buttons.push({ x, y, w: cw, h: ch, onClick: () => { menuSel = i; tryStart(i); } });
    });

    // World tabs
    const tw = 170, tg = 12, tx0 = (W - (WORLDS.length * tw + (WORLDS.length - 1) * tg)) / 2, ty = 548;
    WORLDS.forEach((wo, n) => {
      const x = tx0 + n * (tw + tg), here = n === w, open = isUnlocked(wo.start);
      ctx.fillStyle = here ? wo.color : open ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
      rr(ctx, x, ty, tw, 40, 20); ctx.fill();
      text(wo.title, x + tw / 2, ty + 21, fitText(wo.title, tw - 20, 18, 700), here ? '#fff' : '#495057', { weight: 700 });
      buttons.push({ x, y: ty, w: tw, h: 40, onClick: () => { menuSel = wo.start; } });
    });

    text('Arrow keys + Space, or click a level', W / 2, 614, 20, '#fff');
    button(W / 2 - 250, 642, 230, 50, save.sound ? 'Sound: on' : 'Sound: off', toggleSound, '#4dabf7');
    button(W / 2 + 20, 642, 230, 50, resetArmed > 0 ? 'Click to confirm' : 'Reset progress', resetProgress,
      resetArmed > 0 ? '#fa5252' : '#adb5bd');
  }

  function render() {
    buttons = [];
    const inGame = game && screen !== 'title' && screen !== 'menu';
    if (!inGame) {
      drawScene(ambient.layout, H);
      drawAmbient();
      if (screen === 'title') drawTitle();
      else drawMenu();
    } else {
      drawScene(game.layout, ROAD_BOTTOM);
      drawGame();
      drawParticles();
      drawHud();
      drawKeyboardArea();
      if (screen === 'intro') drawIntro();
      else if (screen === 'pause') drawPause();
      else if (screen === 'win') drawWin();
      else if (screen === 'lose') drawLose();
    }
    canvas.style.cursor = buttons.some(b => hovered(b.x, b.y, b.w, b.h)) ? 'pointer' : 'default';
  }

  // ---- Input ----------------------------------------------------------------
  const CONFIRM = new Set([' ', 'Enter']);
  // Ignore Space for a moment after a level ends so a child mashing keys doesn't skip the result.
  const settled = () => time - game.endTime > 0.8;

  function handleKey(k, e) {
    switch (screen) {
      case 'title':
        if (CONFIRM.has(k)) goMenu();
        break;
      case 'menu': {
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          menuSel = clamp(menuSel + (k === 'ArrowLeft' ? -1 : 1), 0, LEVELS.length - 1);
          Sound.click();
        } else if (k === 'ArrowUp' || k === 'ArrowDown') {
          // Up/down move a row inside the current world.
          const ids = worldLevels(LEVELS[menuSel].world);
          menuSel = clamp(menuSel + (k === 'ArrowUp' ? -MENU_COLS : MENU_COLS), ids[0], ids[ids.length - 1]);
          Sound.click();
        } else if (CONFIRM.has(k)) {
          tryStart(menuSel);
        } else if (k === 'u' && e.shiftKey) {
          // Grown-up shortcut: Shift+U unlocks every level.
          save.unlockAll = true;
          persist();
          Sound.laneDone();
        } else if (k === 'Escape') {
          screen = 'title';
        }
        break;
      }
      case 'intro':
        if (CONFIRM.has(k)) beginPlay();
        else if (k === 'Escape') goMenu();
        break;
      case 'play':
        if (k === 'Escape') screen = 'pause';
        else if (TYPABLE.has(k)) typeKey(k);
        break;
      case 'pause':
        if (CONFIRM.has(k)) screen = 'play';
        else if (k === 'Escape') goMenu();
        break;
      case 'win':
        if (CONFIRM.has(k) && settled()) nextLevel();
        else if (k === 'Escape') goMenu();
        break;
      case 'lose':
        if (CONFIRM.has(k) && settled()) startLevel(game.level);
        else if (k === 'Escape') goMenu();
        break;
    }
  }

  window.addEventListener('keydown', e => {
    Sound.unlock();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    k = SHIFTED[k] || k;
    if (TYPABLE.has(k) || CONFIRM.has(k) || k === 'Escape' || k.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    handleKey(k, e);
  });

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  canvas.addEventListener('pointermove', e => Object.assign(mouse, toCanvas(e)));
  canvas.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1; });
  canvas.addEventListener('pointerdown', e => {
    Sound.unlock();
    canvas.focus();
    const p = toCanvas(e);
    Object.assign(mouse, p);
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        Sound.click();
        b.onClick();
        return;
      }
    }
    if (screen === 'title') goMenu();
  });

  window.addEventListener('blur', () => { if (screen === 'play') screen = 'pause'; });

  // ---- Main loop ------------------------------------------------------------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();
  canvas.focus();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
