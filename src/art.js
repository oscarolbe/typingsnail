// Cartoon drawing helpers. Everything is drawn with canvas shapes, no image files.
const Art = (() => {
  const TAU = Math.PI * 2;
  const FONT = '"Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
  const SKIN = '#ffd9b8', SKIN_EDGE = '#e0a97f';

  const font = (px, weight = 600) => `${weight} ${px}px ${FONT}`;

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // amt < 0 darkens, amt > 0 lightens.
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function shell(ctx, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = shade(color, -0.35);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (let a = 0; a < 4.2 * Math.PI; a += 0.2) {
      const r = 17 * (1 - a / (4.6 * Math.PI));
      a === 0 ? ctx.moveTo(r, 0) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-8, -10, 6, 3.5, -0.6, 0, TAU);
    ctx.fill();
  }

  function shellIcon(ctx, x, y, color, s = 1, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    shell(ctx, color);
    ctx.restore();
  }

  // Side view, facing right.
  function snail(ctx, x, y, { color = '#ff6b6b', t = 0, moving = false, shocked = false, s = 1 } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(2, 20, 36, 6, 0, 0, TAU);
    ctx.fill();

    const stretch = moving ? Math.sin(t * 16) * 0.07 : 0;
    ctx.scale(1 + stretch, 1 - stretch * 0.6);

    ctx.fillStyle = '#f7d98b';
    ctx.strokeStyle = '#d4a548';
    ctx.lineWidth = 2.5;
    rr(ctx, -34, 6, 66, 14, 7);
    ctx.fill();
    ctx.stroke();

    const bob = Math.sin(t * (moving ? 16 : 3)) * 1.5;
    const eyes = [[22, -22 + bob], [36, -20 - bob]];
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(24, 0); ctx.lineTo(...eyes[0]);
    ctx.moveTo(30, 0); ctx.lineTo(...eyes[1]);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(28, 4, 12, 0, TAU);
    ctx.fill();
    ctx.stroke();

    for (const [ex, ey] of eyes) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ex, ey, shocked ? 6.5 : 5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(ex + (shocked ? 0 : 1.5), ey + (shocked ? 0 : 0.5), shocked ? 2 : 2.6, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = '#7a4b1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (shocked) ctx.arc(32, 8, 3, 0, TAU);
    else ctx.arc(31, 6, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,120,0.5)';
    ctx.beginPath();
    ctx.arc(23, 8, 3, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(-6, -8);
    ctx.rotate(moving ? Math.sin(t * 16) * 0.05 : 0);
    shell(ctx, color);
    ctx.restore();
    ctx.restore();
  }

  // Seen from above, riding down the screen.
  function bike(ctx, x, y, { color = '#e64980', helmet = '#fab005', shirt = '#339af0', moving = false } = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (moving) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const dx of [-14, 0, 14]) { ctx.moveTo(dx, -56); ctx.lineTo(dx, -76); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(5, 4, 22, 48, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#2b2b2b';
    rr(ctx, -5, -46, 10, 28, 5); ctx.fill();
    rr(ctx, -5, 18, 10, 28, 5); ctx.fill();

    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(0, 26); ctx.stroke();

    ctx.strokeStyle = '#495057';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-22, 20); ctx.lineTo(22, 20); ctx.stroke();
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath(); ctx.arc(14, 14, 4, 0, TAU); ctx.fill();

    ctx.strokeStyle = '#f1c19a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-14, -2); ctx.lineTo(-20, 19);
    ctx.moveTo(14, -2); ctx.lineTo(20, 19);
    ctx.stroke();

    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.ellipse(0, -6, 19, 13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = helmet;
    ctx.beginPath(); ctx.arc(0, 2, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(helmet, -0.3);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 12); ctx.stroke();
    ctx.restore();
  }

  function puddle(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#7d5f42';
    ctx.beginPath(); ctx.ellipse(0, 0, 32, 13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9a7a57';
    ctx.beginPath(); ctx.ellipse(-4, -2, 21, 7, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    const r = (t * 14) % 16;
    ctx.beginPath(); ctx.ellipse(0, 0, 6 + r, 2.5 + r * 0.4, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function star(ctx, x, y, r, fill, stroke) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.48 : r;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
  }

  function key(ctx, x, y, w, h, label, { fill = '#f1f3f5', text = '#495057', glow = null, outline = null, down = 0, size = 24 } = {}) {
    ctx.save();
    ctx.translate(0, down * 3);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    rr(ctx, x, y + 4 - down * 3, w, h, 10);
    ctx.fill();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 26; }
    ctx.fillStyle = fill;
    rr(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 4; ctx.stroke(); }
    ctx.fillStyle = text;
    ctx.font = font(size, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  // Left hand fingers from pinky to pointer: x offset and length.
  const FINGERS = [{ dx: -36, len: 34 }, { dx: -13, len: 46 }, { dx: 10, len: 52 }, { dx: 33, len: 46 }];

  function finger(ctx, x, len, id, lit, target, t) {
    const on = id === target;
    ctx.save();
    ctx.translate(x, on ? -6 - Math.abs(Math.sin(t * 6)) * 6 : 0);
    rr(ctx, -9, -len, 18, len + 14, 9);
    ctx.fillStyle = SKIN;
    ctx.fill();
    if (on || lit.includes(id)) {
      ctx.globalAlpha = on ? 1 : 0.45;
      ctx.fillStyle = FINGER_COLORS[id];
      if (on) { ctx.shadowColor = FINGER_COLORS[id]; ctx.shadowBlur = 22; }
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
    ctx.strokeStyle = SKIN_EDGE;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    rr(ctx, -5, -len + 3, 10, 9, 4);
    ctx.fill();
    ctx.restore();
  }

  function hand(ctx, cx, cy, left, { lit = [], target = -1, t = 0 } = {}) {
    const ids = left ? [0, 1, 2, 3, 4] : [9, 8, 7, 6, 5];
    ctx.save();
    ctx.translate(cx, cy);
    if (!left) ctx.scale(-1, 1);
    ctx.save();
    ctx.translate(0, -22);
    FINGERS.forEach((f, i) => finger(ctx, f.dx, f.len, ids[i], lit, target, t));
    ctx.restore();
    ctx.save();
    ctx.translate(46, 6);
    ctx.rotate(0.9);
    finger(ctx, 0, 34, ids[4], lit, target, t);
    ctx.restore();
    ctx.fillStyle = SKIN;
    ctx.strokeStyle = SKIN_EDGE;
    ctx.lineWidth = 3;
    rr(ctx, -50, -30, 100, 70, 26);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function lettuce(ctx, x, y) {
    ctx.fillStyle = '#2f9e44';
    ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = '#51cf66';
    for (const [dx, dy] of [[-8, -6], [8, -4], [0, 7]]) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, 12, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#b2f2bb';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
  }

  function mushroom(ctx, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(x, y + 36, 34, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff4e6';
    rr(ctx, x - 18, y - 2, 36, 40, 12); ctx.fill();
    ctx.fillStyle = '#a0522d';
    rr(ctx, x - 7, y + 14, 14, 22, 7); ctx.fill();
    ctx.fillStyle = '#fa5252';
    ctx.beginPath(); ctx.ellipse(x, y, 46, 34, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    for (const [dx, dy, r] of [[-22, -12, 7], [4, -24, 8], [24, -10, 6], [-4, -8, 4]]) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU); ctx.fill();
    }
  }

  return { TAU, font, rr, shade, snail, shellIcon, bike, puddle, star, key, hand, lettuce, mushroom };
})();
