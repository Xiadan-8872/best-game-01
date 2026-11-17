// EMBERFALL's rules and state, with no drawing and no browser in it: the Ember Warden,
// the Ashen horde and its waves, bullets, pickups, embers, upgrades, the boss, score and
// combo. step() advances one fixed step and returns what happened as bit flags, so the
// caller can react (sound, announcements) without the world knowing about screens.
// Nothing here allocates after createWorld returns.
import {
  BOSS,
  BULLET,
  COMBO,
  EMBER,
  ENEMY,
  FIELD,
  HITSTOP,
  PARTICLES,
  PICKUP,
  PLAYER,
  SHAKE,
  SPITTER,
  STEP,
  UPGRADES,
  WAVES,
  WAVE_TABLE,
} from './config.js';
import { pickWeighted, shuffle } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_PICKUP = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_OVER = 16;
export const EVENT_WIN = 32;
export const EVENT_BOSS = 64;
export const EVENT_EMBER = 128;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    aim: -Math.PI / 2,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    fireTimer: 0,
    invulnerable: 0,
    spreadTimer: 0,
    rapidTimer: 0,
    shieldTimer: 0,
    phoenix: false,
    phoenixUsed: false,
    upgrades: {},
    moving: false,
  };

  const enemies = [];
  for (let i = 0; i < 64; i += 1) {
    enemies.push({ active: false, kind: 'cinder', x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, radius: 10, speed: 0, touch: 0, score: 0, color: '#fff', shootTimer: 0, flash: 0, wobble: 0, scale: 1, boss: false });
  }
  const bullets = [];
  for (let i = 0; i < 128; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, radius: 0, life: 0 });
  const ebullets = [];
  for (let i = 0; i < 96; i += 1) ebullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, radius: 0, life: 0 });
  const particles = [];
  for (let i = 0; i < PARTICLES.max; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', drag: 0, glow: false });
  }
  const pickups = [];
  for (let i = 0; i < 24; i += 1) pickups.push({ active: false, kind: 'heart', x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  const embers = [];
  for (let i = 0; i < 96; i += 1) embers.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, value: 10 });
  const floats = [];
  for (let i = 0; i < 32; i += 1) floats.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#fff', size: 14 });

  const state = {
    player,
    enemies,
    bullets,
    ebullets,
    particles,
    pickups,
    embers,
    floats,
    score: 0,
    best: 0,
    combo: 0,
    comboTimer: 0,
    wave: 0,
    waveState: 'idle',
    spawnQueue: [],
    spawnTimer: 0,
    bossTimer: 0,
    summonTimer: 0,
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    embersGot: 0,
    elapsed: 0,
    shake: 0,
    hitstop: 0,
    banner: null,
    upgradeChoices: [],
    endless: false,
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, color, count, speed, size, glow) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (!p) return;
      const a = random() * TAU;
      const s = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.maxLife = 0.35 + random() * 0.45;
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.8);
      p.color = color;
      p.drag = 2.2;
      p.glow = glow;
    }
  }

  function floatText(x, y, text, color, size) {
    const f = free(floats);
    if (!f) return;
    f.active = true;
    f.x = x;
    f.y = y;
    f.life = 0.9;
    f.text = text;
    f.color = color;
    f.size = size || 14;
  }

  function setBanner(text, sub, seconds) {
    state.banner = { text, sub: sub || '', timer: seconds || 2.2, max: seconds || 2.2 };
  }

  function playerDamage() {
    return PLAYER.bulletDamage * (1 + 0.25 * (player.upgrades.damage || 0));
  }

  function playerFireInterval() {
    return PLAYER.fireInterval / (1 + 0.2 * (player.upgrades.rate || 0)) / (player.rapidTimer > 0 ? 1.5 : 1);
  }

  function playerSpeed() {
    return PLAYER.speed * (1 + 0.12 * (player.upgrades.speed || 0));
  }

  function playerPickupRadius() {
    return PLAYER.pickupRadius * (1 + 0.45 * (player.upgrades.magnet || 0));
  }

  function projectiles() {
    return 1 + (player.upgrades.twin || 0) + (player.spreadTimer > 0 ? 2 : 0);
  }

  function bulletRange() {
    return BULLET.life * (1 + 0.15 * (player.upgrades.fuse || 0));
  }

  function bulletSpeed() {
    return PLAYER.bulletSpeed * (1 + 0.15 * (player.upgrades.fuse || 0));
  }

  function spawnEnemy(kind, x, y, scale) {
    const e = free(enemies);
    if (!e) return null;
    const cfg = ENEMY[kind];
    const s = scale || 1;
    e.active = true;
    e.kind = kind;
    e.boss = kind === 'boss';
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    // Enemies toughen as the waves climb, so later waves are not just more of them.
    const waveHp = 1 + 0.04 * (state.wave - 1);
    e.maxHp = Math.round(cfg.hp * s * waveHp * (kind === 'boss' ? 1 + BOSS.hpPerWave * (state.wave - 5) / 900 : 1));
    e.hp = e.maxHp;
    e.radius = cfg.radius * s;
    e.speed = cfg.speed * (1 + 0.12 * s - 0.12) * (1 + 0.02 * (state.wave - 1));
    e.touch = cfg.touch;
    e.score = Math.round(cfg.score * s);
    e.color = cfg.color;
    e.shootTimer = 1 + random() * 1.5;
    e.flash = 0;
    e.wobble = random() * TAU;
    e.scale = s;
    return e;
  }

  function edgePoint() {
    const side = Math.floor(random() * 4);
    const m = 30;
    if (side === 0) return { x: m + random() * (FIELD.width - m * 2), y: -m };
    if (side === 1) return { x: m + random() * (FIELD.width - m * 2), y: FIELD.height + m };
    if (side === 2) return { x: -m, y: m + random() * (FIELD.height - m * 2) };
    return { x: FIELD.width + m, y: m + random() * (FIELD.height - m * 2) };
  }

  function buildWave(n) {
    const queue = [];
    let budget = WAVES.baseBudget + WAVES.budgetPerWave * (n - 1);
    const table = WAVE_TABLE.filter(([, , first]) => n >= first);
    while (budget > 0) {
      const [kind, cost] = table[Math.floor(random() * table.length)];
      if (cost > budget && queue.length > 0) break;
      queue.push(kind);
      budget -= cost;
    }
    const shuffled = shuffle(random, queue);
    // A boss wave opens with the boss, so the banner and the fight land together.
    if (WAVES.bossWaves.includes(n)) shuffled.unshift('boss');
    return shuffled;
  }

  function startWave(n) {
    state.wave = n;
    state.spawnQueue = buildWave(n);
    state.waveState = 'fight';
    state.spawnTimer = 0.8;
    state.bossTimer = 0;
    state.summonTimer = BOSS.summonInterval;
    if (WAVES.bossWaves.includes(n)) {
      setBanner(n === WAVES.total ? 'THE CINDER TYRANT' : 'THE ASHEN MAW', `Wave ${n} — slay the boss`, 2.6);
    } else {
      setBanner(`WAVE ${n}`, n === 1 ? 'Hold the Hearth' : '', 2.0);
    }
  }

  function offerUpgrades() {
    const owned = player.upgrades;
    const pool = UPGRADES.filter((u) => (owned[u.id] || 0) < u.max);
    const picks = shuffle(random, pool).slice(0, 3);
    state.upgradeChoices = picks;
    return picks;
  }

  function applyUpgrade(id) {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    player.upgrades[id] = (player.upgrades[id] || 0) + 1;
    if (id === 'hide') {
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 25);
    }
    if (id === 'phoenix') player.phoenix = true;
    state.upgradeChoices = [];
    return true;
  }

  function dropEmbers(x, y, count, comboMult) {
    for (let i = 0; i < count; i += 1) {
      const em = free(embers);
      if (!em) return;
      const a = random() * TAU;
      em.active = true;
      em.x = x;
      em.y = y;
      em.vx = Math.cos(a) * (40 + random() * 90);
      em.vy = Math.sin(a) * (40 + random() * 90);
      em.life = EMBER.life;
      em.value = EMBER.value * comboMult;
    }
  }

  function dropPickup(x, y) {
    if (random() > PICKUP.dropChance) return;
    const p = free(pickups);
    if (!p) return;
    p.active = true;
    p.kind = pickWeighted(random, PICKUP.kinds);
    p.x = x;
    p.y = y;
    p.vx = (random() - 0.5) * 40;
    p.vy = 30 + random() * 40;
    p.life = PICKUP.life;
  }

  function killEnemy(e, events) {
    e.active = false;
    state.kills += 1;
    state.combo = Math.min(COMBO.max, state.combo + 1);
    state.comboTimer = COMBO.window;
    const gained = e.score * state.combo;
    state.score += gained;
    floatText(e.x, e.y - e.radius, `+${gained}`, '#ffd166', e.boss ? 22 : 14);
    burst(e.x, e.y, e.color, e.boss ? 70 : 16, e.boss ? 320 : 200, e.boss ? 5 : 3, true);
    burst(e.x, e.y, '#ffffff', e.boss ? 20 : 5, 140, 2, false);
    dropEmbers(e.x, e.y, e.boss ? 8 : 1 + (random() < 0.4 ? 1 : 0), state.combo);
    dropPickup(e.x, e.y);
    if (e.kind === 'mite' && e.scale >= 1) {
      spawnEnemy('mite', e.x - 10, e.y, 0.6);
      spawnEnemy('mite', e.x + 10, e.y, 0.6);
    }
    if (e.kind === 'brute') state.hitstop = Math.max(state.hitstop, HITSTOP.brute);
    if (e.boss) {
      state.shake = Math.max(state.shake, SHAKE.bossKill);
      state.hitstop = Math.max(state.hitstop, HITSTOP.boss);
      dropPickup(e.x, e.y);
      dropPickup(e.x, e.y);
    } else {
      state.shake = Math.max(state.shake, SHAKE.kill);
    }
    return events | EVENT_KILL;
  }

  function hurtPlayer(damage) {
    if (player.invulnerable > 0 || player.shieldTimer > 0 || state.waveState !== 'fight') return 0;
    player.hp -= damage;
    player.invulnerable = PLAYER.invulnerable;
    state.shake = Math.max(state.shake, SHAKE.hit);
    state.combo = 0;
    state.comboTimer = 0;
    burst(player.x, player.y, '#ff4d6d', 18, 220, 3, true);
    if (player.hp <= 0 && player.phoenix && !player.phoenixUsed) {
      player.phoenixUsed = true;
      player.phoenix = false;
      player.hp = Math.round(player.maxHp / 2);
      player.invulnerable = 2;
      setBanner('THE PHOENIX REMEMBERS', 'You rise again', 2.2);
      burst(player.x, player.y, '#ffd166', 60, 300, 4, true);
      return EVENT_HIT;
    }
    if (player.hp <= 0) {
      player.hp = 0;
      state.waveState = 'over';
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function fireBullet(angle) {
    const b = free(bullets);
    if (!b) return;
    const spread = 0.09;
    const a = angle + (random() - 0.5) * spread;
    b.active = true;
    b.x = player.x + Math.cos(angle) * (PLAYER.radius + 6);
    b.y = player.y + Math.sin(angle) * (PLAYER.radius + 6);
    b.vx = Math.cos(a) * bulletSpeed();
    b.vy = Math.sin(a) * bulletSpeed();
    b.damage = playerDamage();
    b.radius = PLAYER.bulletRadius;
    b.life = bulletRange();
    state.shotsFired += 1;
  }

  function fireEnemyBolt(x, y, angle, speed, damage) {
    const b = free(ebullets);
    if (!b) return;
    b.active = true;
    b.x = x;
    b.y = y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.damage = damage;
    b.radius = SPITTER.boltRadius;
    b.life = 4;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.aim = -Math.PI / 2;
    player.hp = PLAYER.maxHp;
    player.maxHp = PLAYER.maxHp;
    player.fireTimer = 0;
    player.invulnerable = 0;
    player.spreadTimer = 0;
    player.rapidTimer = 0;
    player.shieldTimer = 0;
    player.phoenix = false;
    player.phoenixUsed = false;
    player.upgrades = {};
    player.moving = false;
    for (const e of enemies) e.active = false;
    for (const b of bullets) b.active = false;
    for (const b of ebullets) b.active = false;
    for (const p of particles) p.active = false;
    for (const p of pickups) p.active = false;
    for (const em of embers) em.active = false;
    for (const f of floats) f.active = false;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.wave = 0;
    state.waveState = 'idle';
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.shotsHit = 0;
    state.embersGot = 0;
    state.elapsed = 0;
    state.shake = 0;
    state.hitstop = 0;
    state.banner = null;
    state.upgradeChoices = [];
    state.endless = false;
  }

  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.banner) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) state.banner = null;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - SHAKE.decay * dt);
    if (state.hitstop > 0) {
      state.hitstop -= dt;
      return events;
    }
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // Particles and floating text always animate.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
    }
    for (const f of floats) {
      if (!f.active) continue;
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) f.active = false;
    }

    // The title screen's backdrop: embers drift, a few cinders wander, nothing scores.
    if (harmless) {
      if (random() < dt * 6) {
        const p = free(particles);
        if (p) {
          p.active = true;
          p.x = random() * FIELD.width;
          p.y = FIELD.height + 8;
          p.vx = (random() - 0.5) * 12;
          p.vy = -(14 + random() * 26);
          p.maxLife = 4 + random() * 3;
          p.life = p.maxLife;
          p.size = 2 + random() * 2.5;
          p.color = random() < 0.7 ? '#ffb347' : '#ff7a59';
          p.drag = 0;
          p.glow = true;
        }
      }
      if (random() < dt * 0.5) {
        const pt = edgePoint();
        const e = spawnEnemy(random() < 0.6 ? 'cinder' : 'wisp', pt.x, pt.y, 1);
        if (e) { e.vx = (FIELD.width / 2 - e.x) * 0.02; e.vy = (FIELD.height / 2 - e.y) * 0.02; }
      }
      for (const e of enemies) {
        if (!e.active) continue;
        e.x += e.vx * dt + Math.sin(state.elapsed * 1.4 + e.wobble) * 12 * dt;
        e.y += e.vy * dt + Math.cos(state.elapsed * 1.1 + e.wobble) * 12 * dt;
        if (e.x < -60 || e.x > FIELD.width + 60 || e.y < -60 || e.y > FIELD.height + 60) e.active = false;
      }
      return events;
    }

    if (state.waveState === 'idle' || state.waveState === 'over' || state.waveState === 'win' || state.waveState === 'upgrade') {
      return events;
    }

    // --- wave spawning ---
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const kind = state.spawnQueue.shift();
        const pt = edgePoint();
        const e = spawnEnemy(kind, pt.x, pt.y, 1);
        if (e && kind === 'boss') {
          events |= EVENT_BOSS;
          state.shake = Math.max(state.shake, SHAKE.bossKill * 0.6);
        }
        state.spawnTimer = Math.max(WAVES.spawnIntervalMin, WAVES.spawnInterval - WAVES.spawnIntervalPerWave * (state.wave - 1));
      }
    }

    // --- player ---
    const speed = playerSpeed();
    const mx = input.mx || 0;
    const my = input.my || 0;
    const moving = mx !== 0 || my !== 0;
    player.moving = moving;
    if (moving) {
      const len = Math.hypot(mx, my) || 1;
      player.x = clamp(player.x + (mx / len) * speed * dt, PLAYER.radius, FIELD.width - PLAYER.radius);
      player.y = clamp(player.y + (my / len) * speed * dt, PLAYER.radius, FIELD.height - PLAYER.radius);
    }
    if (input.aimX !== undefined && input.aimY !== undefined) {
      player.aim = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    }
    if (player.invulnerable > 0) player.invulnerable -= dt;
    if (player.spreadTimer > 0) player.spreadTimer -= dt;
    if (player.rapidTimer > 0) player.rapidTimer -= dt;
    if (player.shieldTimer > 0) player.shieldTimer -= dt;

    // Firing: hold to shoot; with no mouse aim, shoot at the nearest enemy.
    player.fireTimer -= dt;
    if (input.firing && player.fireTimer <= 0) {
      let angle = player.aim;
      if (!input.hasAim) {
        let nearest = null;
        let nd = Infinity;
        for (const e of enemies) {
          if (!e.active) continue;
          const d = dist2(e.x, e.y, player.x, player.y);
          if (d < nd) { nd = d; nearest = e; }
        }
        if (nearest) angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
        else angle = player.aim;
      }
      const n = projectiles();
      const spreadStep = 0.14;
      for (let i = 0; i < n; i += 1) {
        fireBullet(angle + (i - (n - 1) / 2) * spreadStep);
      }
      player.aim = angle;
      player.fireTimer = playerFireInterval();
      burst(player.x + Math.cos(angle) * (PLAYER.radius + 8), player.y + Math.sin(angle) * (PLAYER.radius + 8), '#ffd166', 2, 90, 2, true);
    }

    // --- bullets ---
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) { b.active = false; continue; }
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = b.radius + e.radius;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          b.active = false;
          e.hp -= b.damage;
          e.flash = 0.09;
          state.shotsHit += 1;
          burst(b.x, b.y, '#ffe9a8', 3, 120, 2, true);
          if (e.hp <= 0) events |= killEnemy(e, 0);
          break;
        }
      }
    }

    // --- enemies ---
    let alive = 0;
    for (const e of enemies) {
      if (!e.active) continue;
      alive += 1;
      if (e.flash > 0) e.flash -= dt;
      e.wobble += dt;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (e.kind === 'cinder' || e.kind === 'brute' || e.kind === 'boss') {
        e.vx = (dx / d) * e.speed;
        e.vy = (dy / d) * e.speed;
      } else if (e.kind === 'wisp') {
        const wob = Math.sin(e.wobble * 3.2) * 0.7;
        const px = -dy / d;
        const py = dx / d;
        e.vx = (dx / d) * e.speed + px * wob * e.speed;
        e.vy = (dy / d) * e.speed + py * wob * e.speed;
      } else if (e.kind === 'mite') {
        e.vx = (dx / d) * e.speed;
        e.vy = (dy / d) * e.speed;
      } else if (e.kind === 'spitter') {
        if (d > SPITTER.range) {
          e.vx = (dx / d) * e.speed;
          e.vy = (dy / d) * e.speed;
        } else if (d < SPITTER.range * 0.6) {
          e.vx = (-dx / d) * e.speed * 0.7;
          e.vy = (-dy / d) * e.speed * 0.7;
        } else {
          e.vx = 0;
          e.vy = 0;
        }
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && d < SPITTER.range + 60) {
          e.shootTimer = SPITTER.shotInterval * (0.9 + random() * 0.2);
          fireEnemyBolt(e.x, e.y, Math.atan2(dy, dx), SPITTER.boltSpeed, SPITTER.boltDamage);
        }
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = clamp(e.x, -40, FIELD.width + 40);
      e.y = clamp(e.y, -40, FIELD.height + 40);

      if (e.boss) {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = BOSS.shotInterval;
          const base = random() * TAU;
          for (let i = 0; i < BOSS.burstCount; i += 1) {
            fireEnemyBolt(e.x, e.y, base + (i / BOSS.burstCount) * TAU, BOSS.boltSpeed, SPITTER.boltDamage);
          }
        }
        state.summonTimer -= dt;
        if (state.summonTimer <= 0) {
          state.summonTimer = BOSS.summonInterval;
          for (let i = 0; i < BOSS.summonCount; i += 1) {
            const pt = edgePoint();
            spawnEnemy('mite', pt.x, pt.y, 1);
          }
        }
      }

      // Touch damage.
      const rr = e.radius + PLAYER.radius;
      if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
        events |= hurtPlayer(e.touch);
        if (state.waveState === 'over') break;
        // A touch shoves the enemy back so it cannot drain the player in one frame.
        e.x -= (dx / d) * 26;
        e.y -= (dy / d) * 26;
      }
    }

    // --- enemy bolts ---
    for (const b of ebullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) { b.active = false; continue; }
      const rr = b.radius + PLAYER.radius;
      if (dist2(b.x, b.y, player.x, player.y) < rr * rr) {
        b.active = false;
        events |= hurtPlayer(b.damage);
        if (state.waveState === 'over') break;
      }
    }

    // --- pickups: drift, magnet, collect ---
    const pr = playerPickupRadius();
    for (const p of pickups) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      const d = Math.hypot(player.x - p.x, player.y - p.y) || 1;
      if (d < pr) {
        p.vx += ((player.x - p.x) / d) * PICKUP.magnetSpeed * dt * 6;
        p.vy += ((player.y - p.y) / d) * PICKUP.magnetSpeed * dt * 6;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
      const rr = PICKUP.radius + PLAYER.radius;
      if (dist2(p.x, p.y, player.x, player.y) < rr * rr) {
        p.active = false;
        if (p.kind === 'heart') {
          player.hp = Math.min(player.maxHp, player.hp + PICKUP.heartHeal);
          floatText(player.x, player.y - 24, `+${PICKUP.heartHeal} HP`, '#7fe0a8', 15);
        } else if (p.kind === 'spread') {
          player.spreadTimer = PICKUP.spreadSeconds;
          floatText(player.x, player.y - 24, 'TRIPLE FLAME!', '#ffd166', 16);
        } else if (p.kind === 'rapid') {
          player.rapidTimer = PICKUP.rapidSeconds;
          floatText(player.x, player.y - 24, 'RAPID IGNITION!', '#ffd166', 16);
        } else if (p.kind === 'shield') {
          player.shieldTimer = PICKUP.shieldSeconds;
          floatText(player.x, player.y - 24, 'EMBER SHIELD!', '#8ecbff', 16);
        } else if (p.kind === 'nova') {
          floatText(player.x, player.y - 24, 'NOVA!', '#ff9d5c', 18);
          burst(player.x, player.y, '#ff9d5c', 40, 320, 4, true);
          for (const e of enemies) {
            if (!e.active) continue;
            e.hp -= PICKUP.novaDamage;
            e.flash = 0.12;
            if (e.hp <= 0) events |= killEnemy(e, 0);
          }
        }
        events |= EVENT_PICKUP;
      }
    }

    // --- embers: drift, magnet, collect for score ---
    for (const em of embers) {
      if (!em.active) continue;
      em.life -= dt;
      if (em.life <= 0) { em.active = false; continue; }
      const d = Math.hypot(player.x - em.x, player.y - em.y) || 1;
      if (d < pr) {
        em.vx += ((player.x - em.x) / d) * EMBER.magnetSpeed * dt * 6;
        em.vy += ((player.y - em.y) / d) * EMBER.magnetSpeed * dt * 6;
      }
      em.x += em.vx * dt;
      em.y += em.vy * dt;
      em.vx *= 1 - 2 * dt;
      em.vy *= 1 - 2 * dt;
      const rr = EMBER.radius + PLAYER.radius;
      if (dist2(em.x, em.y, player.x, player.y) < rr * rr) {
        em.active = false;
        state.score += em.value;
        state.embersGot += 1;
        events |= EVENT_EMBER;
      }
    }

    // --- wave clear ---
    if (state.waveState === 'fight' && state.spawnQueue.length === 0 && alive === 0) {
      if (state.wave >= WAVES.total && !state.endless) {
        state.waveState = 'win';
        if (state.score > state.best) state.best = state.score;
        events |= EVENT_WIN;
      } else {
        state.waveState = 'upgrade';
        offerUpgrades();
        events |= EVENT_WAVE_CLEAR;
      }
    }
    return events;
  }

  function nextWave() {
    if (state.waveState !== 'upgrade') return;
    if (state.wave >= WAVES.total && !state.endless) return;
    startWave(state.wave + 1);
  }

  function continueEndless() {
    state.endless = true;
    state.waveState = 'upgrade';
    offerUpgrades();
  }

  reset();
  return { state, reset, step, startWave, nextWave, continueEndless, applyUpgrade, offerUpgrades, playerDamage, playerFireInterval, projectiles };
}
