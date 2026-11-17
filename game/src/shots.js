// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the real
// rules forward from a fresh world for a fixed time, steered by an autopilot, so the
// frame is what a real game looks like and the same seed always gives the same frame.
// The play pilot dodges, chases embers and shoots the nearest Ashen; the end pilot walks
// into the horde and never fires, so it is caught out as a hurried player is.
import { FIELD, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 6;
const UPGRADE_LIMIT_SECONDS = 120;
const END_LIMIT_SECONDS = 600;

function nearestEnemy(state) {
  let best = null;
  let bd = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = (e.x - state.player.x) ** 2 + (e.y - state.player.y) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function nearestPickup(state) {
  let best = null;
  let bd = Infinity;
  for (const p of state.pickups) {
    if (!p.active) continue;
    const d = (p.x - state.player.x) ** 2 + (p.y - state.player.y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  for (const em of state.embers) {
    if (!em.active) continue;
    const d = (em.x - state.player.x) ** 2 + (em.y - state.player.y) ** 2;
    if (d < bd * 0.6) { bd = d; best = em; }
  }
  return best;
}

/** The steering input for one step: dodge what is near, chase embers when it is safe. */
function autopilot(state) {
  const p = state.player;
  let mx = 0;
  let my = 0;
  // Flee anything close, harder the closer it is.
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const R = e.radius + 150;
    if (d < R) {
      const w = (R - d) / R;
      mx += (dx / d) * w * 2.2;
      my += (dy / d) * w * 2.2;
    }
  }
  // Flee enemy bolts too.
  for (const b of state.ebullets) {
    if (!b.active) continue;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 90) {
      mx += (dx / d) * 1.6;
      my += (dy / d) * 1.6;
    }
  }
  // Chase the nearest pickup or ember when nothing is on top of us.
  const threat = state.enemies.some((e) => e.active && Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 70);
  if (!threat) {
    const target = nearestPickup(state);
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      mx += (dx / d) * 0.8;
      my += (dy / d) * 0.8;
    }
  }
  // Drift back toward the middle so the pilot never camps a corner.
  mx += (FIELD.width / 2 - p.x) / FIELD.width * 0.5;
  my += (FIELD.height / 2 - p.y) / FIELD.height * 0.5;
  const len = Math.hypot(mx, my) || 1;
  const enemy = nearestEnemy(state);
  return {
    mx: mx / len,
    my: my / len,
    aimX: enemy ? enemy.x : p.x,
    aimY: enemy ? enemy.y : p.y - 100,
    hasAim: true,
    firing: true,
  };
}

/** The end pilot: fire, but walk at the nearest enemy and never dodge, so it scores a
 * few kills and is then overwhelmed, as a hurried player is. */
function doomedPilot(state) {
  const p = state.player;
  const enemy = nearestEnemy(state);
  if (!enemy) return { mx: 0, my: 0, aimX: p.x, aimY: p.y - 100, hasAim: true, firing: true };
  const dx = enemy.x - p.x;
  const dy = enemy.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  return { mx: dx / d, my: dy / d, aimX: enemy.x, aimY: enemy.y, hasAim: true, firing: true };
}

/**
 * Set `world` to the named scene (start, play, upgrade or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { mx: 0, my: 0, firing: false }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.startWave(1);
  if (name === 'upgrade') {
    for (let i = 0; i < UPGRADE_LIMIT_SECONDS / STEP; i += 1) {
      world.step(STEP, autopilot(world.state), false);
      if (world.state.waveState === 'upgrade') return { screen: SCREEN_UPGRADE, best: world.state.score };
      if (world.state.waveState === 'over') break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'play') {
    // Play on until the wave-5 boss is on screen, then let the fight run a little
    // longer — or stop the moment the boss falls, when the frame is full of it.
    let sawBoss = false;
    let bossTime = 0;
    for (let i = 0; i < 180 / STEP; i += 1) {
      world.step(STEP, autopilot(world.state), false);
      if (world.state.waveState === 'upgrade') {
        const choices = world.state.upgradeChoices;
        if (choices.length > 0) world.applyUpgrade(choices[0].id);
        world.nextWave();
        continue;
      }
      if (world.state.waveState === 'over') break;
      const boss = world.state.enemies.find((e) => e.active && e.boss);
      if (world.state.wave === 5 && boss) {
        sawBoss = true;
        bossTime += 1;
        if (bossTime > 4 * 60) break;
      } else if (sawBoss) {
        break;
      }
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // The end scene: the doomed pilot keeps playing (taking upgrades) until it falls.
  for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
    world.step(STEP, doomedPilot(world.state), false);
    if (world.state.waveState === 'upgrade') {
      const choices = world.state.upgradeChoices;
      if (choices.length > 0) world.applyUpgrade(choices[0].id);
      world.nextWave();
    }
    if (world.state.waveState === 'over') break;
  }
  const over = world.state.waveState === 'over';
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
