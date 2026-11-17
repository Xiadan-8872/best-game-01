// EMBERFALL's drawing: one canvas, a fixed 960 x 640 logical field scaled to the
// window, and every screen the game shows (title, play, pause, upgrade, game over,
// victory) painted from the same world. Glow comes from additive blending ('lighter'),
// not shadowBlur, so it stays fast with hundreds of particles on screen.
import { FIELD, PLAYER, PICKUP, ENEMY } from './config.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_UPGRADE = 3;
export const SCREEN_OVER = 4;
export const SCREEN_WIN = 5;

const BG_TOP = '#171226';
const BG_BOTTOM = '#0b0d18';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFlame(ctx, x, y, r, color, t) {
  // A teardrop flame: a circle with a flickering tip.
  const flick = 1 + Math.sin(t * 9 + x * 0.05) * 0.08;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.5 * flick);
  ctx.bezierCurveTo(x + r * 0.9, y - r * 0.4, x + r * 0.75, y + r * 0.7, x, y + r * 0.8);
  ctx.bezierCurveTo(x - r * 0.75, y + r * 0.7, x - r * 0.9, y - r * 0.4, x, y - r * 1.5 * flick);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const scale = Math.min(w / FIELD.width, h / FIELD.height);
    view = {
      scale,
      ox: (w - FIELD.width * scale) / 2,
      oy: (h - FIELD.height * scale) / 2,
      w,
      h,
      dpr,
    };
  }
  resize();
  window.addEventListener('resize', resize);

  // Logical (field) coordinates of a client point, for mouse aim.
  function toField(clientX, clientY) {
    return { x: (clientX - view.ox) / view.scale, y: (clientY - view.oy) / view.scale };
  }

  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, BG_TOP);
    g.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Faint hearth-glow at the centre and a dim grid, so the field reads as a place.
    const rg = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 40, FIELD.width / 2, FIELD.height / 2, 420);
    rg.addColorStop(0, 'rgba(255, 150, 60, 0.10)');
    rg.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.strokeStyle = 'rgba(140, 160, 220, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= FIELD.width; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.height); }
    for (let y = 0; y <= FIELD.height; y += 80) { ctx.moveTo(0, y); ctx.lineTo(FIELD.width, y); }
    ctx.stroke();
    // Slow drifting motes, purely decorative.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 24; i += 1) {
      const x = (i * 173.3 + t * 6) % FIELD.width;
      const y = (i * 97.7 + t * 3) % FIELD.height;
      ctx.fillStyle = 'rgba(255, 180, 90, 0.10)';
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawEnemy(e, t) {
    const x = e.x;
    const y = e.y;
    const r = e.radius;
    const flash = e.flash > 0;
    const color = flash ? '#ffffff' : e.color;
    ctx.save();
    ctx.translate(x, y);
    if (e.kind === 'cinder') {
      // A lumpy ash rock: a rough polygon that slowly tumbles.
      ctx.rotate(Math.sin(e.wobble * 0.8) * 0.25);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        const rad = r * (0.82 + 0.18 * Math.sin(i * 2.7 + e.wobble));
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(-r * 0.25, -r * 0.2, r * 0.22, 0, Math.PI * 2);
      ctx.arc(r * 0.3, r * 0.25, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'wisp') {
      // A small violet wisp: a diamond with a trailing glow.
      ctx.rotate(Math.sin(e.wobble * 2) * 0.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(201, 167, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.3);
      ctx.lineTo(r * 0.9, 0);
      ctx.lineTo(0, r * 1.3);
      ctx.lineTo(-r * 0.9, 0);
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === 'spitter') {
      // A green spitter: a ring with a pulsing core.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
      const pulse = 0.6 + 0.4 * Math.sin(e.wobble * 4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(127, 224, 168, ${0.5 * pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.5 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (e.kind === 'brute') {
      // A big brute: a heavy hexagon with a dark core.
      ctx.rotate(e.wobble * 0.15);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(-r * 0.2, -r * 0.1, r * 0.1, 0, Math.PI * 2);
      ctx.arc(r * 0.2, -r * 0.1, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'mite') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'boss') {
      // The Ashen Maw: a huge dark maw ringed in ember, with a glowing core.
      const pulse = 1 + Math.sin(e.wobble * 2.4) * 0.04;
      ctx.scale(pulse, pulse);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 77, 109, 0.28)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#2a1420';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      // Teeth around the maw.
      ctx.fillStyle = '#ffd166';
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2 + e.wobble * 0.2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // A thin health arc over anything hurt.
    if (e.hp < e.maxHp && !e.boss) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + (e.hp / e.maxHp) * Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayer(state, t) {
    const p = state.player;
    const blink = p.invulnerable > 0 && Math.floor(t * 14) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    // Aim tick.
    ctx.rotate(p.aim);
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(PLAYER.radius + 4, 0);
    ctx.lineTo(PLAYER.radius + 16, 0);
    ctx.stroke();
    ctx.rotate(-p.aim);
    // Glow.
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, PLAYER.radius * 2.6);
    glow.addColorStop(0, 'rgba(255, 170, 60, 0.55)');
    glow.addColorStop(1, 'rgba(255, 170, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.radius * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (!blink) {
      drawFlame(ctx, 0, 0, PLAYER.radius * 0.95, '#ff9d2e', t);
      drawFlame(ctx, 0, 2, PLAYER.radius * 0.55, '#ffd166', t);
      ctx.fillStyle = '#fff7e0';
      ctx.beginPath();
      ctx.arc(0, 1, PLAYER.radius * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shield ring while the ember shield lasts.
    if (p.shieldTimer > 0) {
      ctx.strokeStyle = `rgba(142, 203, 255, ${0.5 + 0.3 * Math.sin(t * 8)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud(state, screen) {
    const p = state.player;
    // Top bar: score left, wave centre, best right.
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${state.score}`, 18, 36);
    ctx.textAlign = 'center';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(state.wave > 0 ? `WAVE ${state.wave} / 10` : 'EMBERFALL', FIELD.width / 2, 34);
    ctx.textAlign = 'right';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`BEST ${Math.max(state.best, state.score)}`, FIELD.width - 18, 33);
    // Health bar under the score.
    const bw = 190;
    const bx = 18;
    const by = 48;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    rr(ctx, bx, by, bw, 12, 6);
    ctx.fill();
    const hpr = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = hpr > 0.5 ? '#7fe0a8' : hpr > 0.25 ? '#ffd166' : '#ff4d6d';
    if (hpr > 0) {
      rr(ctx, bx, by, bw * hpr, 12, 6);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${Math.ceil(p.hp)} / ${p.maxHp}`, bx, by + 28);
    // Combo, right under the best.
    if (state.combo > 1) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 20px system-ui, sans-serif';
      ctx.fillText(`COMBO x${state.combo}`, FIELD.width - 18, 58);
      ctx.fillStyle = 'rgba(255, 209, 102, 0.5)';
      ctx.fillRect(FIELD.width - 118, 64, 100 * (state.comboTimer / 2.5), 4);
    }
    // Active power-up timers, bottom left.
    let ty = FIELD.height - 18;
    ctx.textAlign = 'left';
    ctx.font = '600 14px system-ui, sans-serif';
    if (p.spreadTimer > 0) { ctx.fillStyle = '#ffd166'; ctx.fillText(`TRIPLE FLAME ${Math.ceil(p.spreadTimer)}s`, 18, ty); ty -= 20; }
    if (p.rapidTimer > 0) { ctx.fillStyle = '#ffd166'; ctx.fillText(`RAPID ${Math.ceil(p.rapidTimer)}s`, 18, ty); ty -= 20; }
    if (p.shieldTimer > 0) { ctx.fillStyle = '#8ecbff'; ctx.fillText(`SHIELD ${Math.ceil(p.shieldTimer)}s`, 18, ty); ty -= 20; }
    if (p.phoenix) { ctx.fillStyle = '#ff9d5c'; ctx.fillText('PHOENIX CHARM — revive once', 18, ty); }
    // Boss health bar, top centre under the wave label.
    const boss = state.enemies.find((e) => e.active && e.boss);
    if (boss) {
      const bw2 = 420;
      const bx2 = (FIELD.width - bw2) / 2;
      const by2 = 52;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      rr(ctx, bx2, by2, bw2, 10, 5);
      ctx.fill();
      ctx.fillStyle = '#ff4d6d';
      rr(ctx, bx2, by2, bw2 * Math.max(0, boss.hp / boss.maxHp), 10, 5);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8fa3';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillText(state.wave >= 10 ? 'THE CINDER TYRANT' : 'THE ASHEN MAW', FIELD.width / 2, by2 + 26);
    }
    if (screen === SCREEN_PLAY) {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText('P pause · M mute', FIELD.width - 18, FIELD.height - 18);
    }
  }

  function centerText(lines, y0, gap) {
    ctx.textAlign = 'center';
    let y = y0;
    for (const line of lines) {
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, FIELD.width / 2, y);
      y += gap;
    }
    return y;
  }

  function drawTitle(state, t) {
    ctx.fillStyle = 'rgba(8, 8, 16, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const pulse = 1 + Math.sin(t * 2.2) * 0.02;
    ctx.save();
    ctx.translate(FIELD.width / 2, 218);
    ctx.scale(pulse, pulse);
    ctx.textAlign = 'center';
    ctx.font = '900 84px system-ui, sans-serif';
    ctx.fillStyle = '#ffb347';
    ctx.fillText('EMBERFALL', 0, 0);
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 240, 200, 0.9)';
    ctx.fillText('The last Ember Warden holds the Hearth against the Ashen horde.', 0, 40);
    ctx.restore();
    centerText([
      { text: 'WASD or arrows — move      Mouse — aim      Hold click or Space — shoot', font: '600 17px system-ui, sans-serif', color: 'rgba(255,255,255,0.85)' },
      { text: 'Clear each wave, pick an upgrade, slay the boss on wave 10.', font: '600 17px system-ui, sans-serif', color: 'rgba(255,255,255,0.65)' },
    ], 330, 30);
    if (state.best > 0) {
      ctx.textAlign = 'center';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`BEST SCORE ${state.best}`, FIELD.width / 2, 420);
    }
    const blink = Math.floor(t * 1.6) % 2 === 0;
    if (blink) {
      ctx.textAlign = 'center';
      ctx.font = '800 24px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Click or press Space to begin', FIELD.width / 2, 480);
    }
    ctx.textAlign = 'center';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('P pause · M mute · sound on after your first click', FIELD.width / 2, FIELD.height - 24);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8, 8, 16, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    centerText([
      { text: 'PAUSED', font: '900 56px system-ui, sans-serif', color: '#ffffff' },
      { text: 'Press P or click to keep playing', font: '600 18px system-ui, sans-serif', color: 'rgba(255,255,255,0.75)' },
    ], 300, 44);
  }

  function drawUpgrade(state) {
    ctx.fillStyle = 'rgba(8, 8, 16, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.font = '900 40px system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 130);
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Choose an upgrade — click a card, or press 1, 2 or 3.', FIELD.width / 2, 168);
    const cards = state.upgradeChoices;
    const cw = 250;
    const ch = 190;
    const gap = 28;
    const total = cards.length * cw + (cards.length - 1) * gap;
    let x = (FIELD.width - total) / 2;
    const y = 220;
    cards.forEach((card, i) => {
      const owned = state.player.upgrades[card.id] || 0;
      ctx.fillStyle = 'rgba(255, 190, 90, 0.12)';
      rr(ctx, x, y, cw, ch, 14);
      ctx.fill();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2;
      rr(ctx, x, y, cw, ch, 14);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb347';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.fillText(`PRESS ${i + 1}`, x + cw / 2, y + 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.fillText(card.name, x + cw / 2, y + 72);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillText(card.desc, x + cw / 2, y + 106);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(owned > 0 ? `Owned: ${owned}` : 'New', x + cw / 2, y + 140);
      x += cw + gap;
    });
    ctx.textAlign = 'center';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`Score ${state.score} · Wave ${state.wave} of 10 · Kills ${state.kills}`, FIELD.width / 2, y + ch + 52);
  }

  function drawOver(state, win) {
    ctx.fillStyle = 'rgba(8, 8, 16, 0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const title = win ? 'THE HEARTH ENDURES' : 'THE FLAME GOES OUT';
    const color = win ? '#ffd166' : '#ff4d6d';
    ctx.textAlign = 'center';
    ctx.font = '900 52px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(title, FIELD.width / 2, 210);
    const acc = state.shotsFired > 0 ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
    const isBest = state.score >= state.best && state.score > 0;
    centerText([
      { text: `Score ${state.score}${isBest ? ' — a new best!' : ` · Best ${state.best}`}`, font: '700 24px system-ui, sans-serif', color: '#ffffff' },
      { text: `Wave ${state.wave} · ${state.kills} Ashen slain · ${state.embersGot} embers gathered · ${acc}% shots hit`, font: '600 17px system-ui, sans-serif', color: 'rgba(255,255,255,0.8)' },
    ], 268, 36);
    const blink = Math.floor(performance.now() / 600) % 2 === 0;
    if (blink) {
      ctx.textAlign = 'center';
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(win ? 'Press R or click for Endless mode — or Space to play again' : 'Press R or click to play again', FIELD.width / 2, 380);
    }
  }

  function drawBanner(state) {
    const b = state.banner;
    if (!b) return;
    const a = Math.min(1, b.timer / 0.4, (b.max - b.timer) / 0.15 + 0.2);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.textAlign = 'center';
    ctx.font = '900 54px system-ui, sans-serif';
    ctx.fillStyle = '#ffb347';
    ctx.fillText(b.text, FIELD.width / 2, 250);
    if (b.sub) {
      ctx.font = '600 20px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(b.sub, FIELD.width / 2, 286);
    }
    ctx.restore();
  }

  function draw(state, screen, best, t) {
    const dpr = view.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, view.w, view.h);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * (view.ox + shakeX * view.scale), dpr * (view.oy + shakeY * view.scale));
    drawBackground(t);

    // Embers and pickups under everything, then bullets, enemies, the player.
    ctx.globalCompositeOperation = 'lighter';
    for (const em of state.embers) {
      if (!em.active) continue;
      const a = Math.max(0.35, em.life / 2);
      ctx.fillStyle = `rgba(255, 180, 80, ${a})`;
      ctx.beginPath();
      ctx.arc(em.x, em.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const p of state.pickups) {
      if (!p.active) continue;
      const bob = Math.sin(t * 4 + p.x) * 2;
      const colors = { heart: '#7fe0a8', spread: '#ffd166', rapid: '#ffd166', shield: '#8ecbff', nova: '#ff9d5c' };
      const glyphs = { heart: '+', spread: 'x3', rapid: '>>', shield: 'O', nova: '*' };
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 220, 120, 0.25)';
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, PICKUP.radius + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = colors[p.kind] || '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, PICKUP.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#101018';
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyphs[p.kind] || '?', p.x, p.y + bob + 0.5);
      ctx.textBaseline = 'alphabetic';
    }

    for (const e of state.enemies) if (e.active) drawEnemy(e, t);

    ctx.globalCompositeOperation = 'lighter';
    for (const b of state.bullets) {
      if (!b.active) continue;
      ctx.fillStyle = 'rgba(255, 214, 110, 0.9)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff7e0';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of state.ebullets) {
      if (!b.active) continue;
      ctx.fillStyle = 'rgba(190, 120, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of state.particles) {
      if (!p.active) continue;
      const a = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (screen !== SCREEN_TITLE) drawPlayer(state, t);

    for (const f of state.floats) {
      if (!f.active) continue;
      ctx.globalAlpha = Math.min(1, f.life / 0.4);
      ctx.fillStyle = f.color;
      ctx.font = `800 ${f.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_UPGRADE) drawHud(state, screen);
    if (screen === SCREEN_PLAY) drawBanner(state);
    if (screen === SCREEN_TITLE) drawTitle(state, t);
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    if (screen === SCREEN_OVER) drawOver(state, false);
    if (screen === SCREEN_WIN) drawOver(state, true);
  }

  return { draw, resize, toField };
}
