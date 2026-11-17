// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between six screens:
// title, play, paused, upgrade, game over and victory.
//
// ?seed=N fixes the random pattern. ?shot=start|play|upgrade|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_BOSS, EVENT_EMBER, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_PICKUP, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import {
  ACTION_CARD_1,
  ACTION_CARD_2,
  ACTION_CARD_3,
  ACTION_CLICK,
  ACTION_CONFIRM,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const audio = createAudio();
const renderer = createRenderer(canvas);
const input = createInput(canvas, renderer.toField);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

// The upgrade cards' rectangles, in field coordinates — the same layout render.js draws.
function cardRects(count) {
  const cw = 250;
  const ch = 190;
  const gap = 28;
  const total = count * cw + (count - 1) * gap;
  const x0 = (FIELD.width - total) / 2;
  const y = 220;
  const out = [];
  for (let i = 0; i < count; i += 1) out.push({ x: x0 + i * (cw + gap), y, w: cw, h: ch });
  return out;
}

function runShot(name) {
  const scene = stageShot(name, world);
  world.state.best = scene.best;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  world.state.best = best;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    world.state.best = best;
    world.startWave(1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.play('wave');
    announce('Playing. Wave 1. Hold the Hearth.');
  }

  function endGame(win) {
    if (world.state.score > best) {
      best = world.state.score;
      world.state.best = best;
      saveBest(best);
    }
    screen = win ? SCREEN_WIN : SCREEN_OVER;
    if (win) {
      audio.play('win');
      announce(`Victory. The Hearth endures. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.play('over');
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function pickCard(index) {
    const choices = world.state.upgradeChoices;
    if (index < 0 || index >= choices.length) return;
    audio.unlock();
    audio.play('upgrade');
    world.applyUpgrade(choices[index].id);
    world.nextWave();
    screen = SCREEN_PLAY;
    audio.play('wave');
    announce(`Wave ${world.state.wave}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & (ACTION_CONFIRM | ACTION_CLICK)) startGame();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM | ACTION_CLICK)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_CARD_1) pickCard(0);
      else if (actions & ACTION_CARD_2) pickCard(1);
      else if (actions & ACTION_CARD_3) pickCard(2);
      else if (actions & ACTION_CLICK) {
        const pos = input.takeClickPos();
        if (pos) {
          const rects = cardRects(world.state.upgradeChoices.length);
          for (let i = 0; i < rects.length; i += 1) {
            const r = rects[i];
            if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) {
              pickCard(i);
              break;
            }
          }
        }
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_CLICK | ACTION_RESTART)) startGame();
      return;
    }
    if (screen === SCREEN_WIN) {
      if (actions & (ACTION_CLICK | ACTION_RESTART)) {
        audio.unlock();
        world.continueEndless();
        screen = SCREEN_UPGRADE;
        announce('Endless mode. Choose an upgrade.');
      } else if (actions & ACTION_CONFIRM) {
        startGame();
      }
    }
  }

  function playEvents(events) {
    if (events & EVENT_HIT) audio.play('hurt');
    if (events & EVENT_KILL) audio.play('kill');
    if (events & EVENT_PICKUP) audio.play('pickup');
    if (events & EVENT_EMBER) audio.play('ember');
    if (events & EVENT_BOSS) {
      audio.play('boss');
      announce('The boss has come.');
    }
    if (events & EVENT_WAVE_CLEAR) {
      audio.play('upgrade');
      screen = SCREEN_UPGRADE;
      announce(`Wave ${world.state.wave} cleared. Choose an upgrade.`);
    }
    if (events & EVENT_OVER) endGame(false);
    if (events & EVENT_WIN) endGame(true);
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, firing: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const dir = input.direction();
    const aim = input.aim();
    const events = world.step(STEP, {
      mx: dir.mx,
      my: dir.my,
      aimX: aim.x,
      aimY: aim.y,
      hasAim: aim.hasAim,
      firing: input.firing(),
    }, false);
    playEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting the horde close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberfall. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
