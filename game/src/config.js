// EMBERFALL — tuning. Every number the game plays by lives here, so the feel can be
// retuned without touching the rules (world.js) or the drawing (render.js).
// Units: pixels, seconds, hit points. The field is a fixed logical 960 x 640; the
// renderer scales it to the window.

export const STEP = 1 / 60;
export const BEST_KEY = 'emberfall.best';
export const FIELD = { width: 960, height: 640 };

export const PLAYER = {
  radius: 14,
  speed: 270,
  maxHp: 100,
  fireInterval: 0.16,
  bulletSpeed: 620,
  bulletDamage: 10,
  bulletRadius: 5,
  invulnerable: 1.0,
  pickupRadius: 64,
};

export const BULLET = { life: 0.9 };

// Enemy kinds. speed is px/s, touch is the damage a touch deals, score the base points.
export const ENEMY = {
  cinder: { radius: 15, hp: 20, speed: 78, touch: 10, score: 50, color: '#e8b04b' },
  wisp: { radius: 11, hp: 12, speed: 168, touch: 8, score: 80, color: '#c9a7ff' },
  spitter: { radius: 16, hp: 30, speed: 52, touch: 8, score: 120, color: '#7fe0a8' },
  brute: { radius: 26, hp: 120, speed: 42, touch: 20, score: 200, color: '#ff7a59' },
  mite: { radius: 9, hp: 16, speed: 120, touch: 6, score: 60, color: '#9db3c8' },
  boss: { radius: 54, hp: 900, speed: 34, touch: 25, score: 1000, color: '#ff4d6d' },
};

// A wave is a budget of points spent on enemies; kinds unlock as the waves climb.
// spawnInterval shrinks with the wave, so later waves arrive faster.
export const WAVES = {
  total: 10,
  bossWaves: [5, 10],
  baseBudget: 8,
  budgetPerWave: 7,
  spawnInterval: 1.0,
  spawnIntervalMin: 0.35,
  spawnIntervalPerWave: 0.06,
};

// What each wave may spend its budget on: [kind, cost, first wave it appears].
export const WAVE_TABLE = [
  ['cinder', 1, 1],
  ['wisp', 2, 2],
  ['spitter', 3, 3],
  ['mite', 2, 4],
  ['brute', 5, 5],
];

export const SPITTER = { range: 340, shotInterval: 2.2, boltSpeed: 210, boltRadius: 6, boltDamage: 8 };
export const BOSS = {
  shotInterval: 2.6,
  burstCount: 10,
  boltSpeed: 170,
  summonInterval: 7,
  summonCount: 3,
  hpPerWave: 450,
};

export const COMBO = { window: 2.5, max: 5 };

export const PICKUP = {
  radius: 12,
  life: 9,
  dropChance: 0.14,
  magnetSpeed: 320,
  // weights of the kinds a drop can be
  kinds: [
    ['heart', 3],
    ['spread', 2],
    ['rapid', 2],
    ['shield', 2],
    ['nova', 1],
  ],
  heartHeal: 25,
  spreadSeconds: 12,
  rapidSeconds: 10,
  shieldSeconds: 5,
  novaDamage: 60,
};

export const EMBER = { radius: 5, value: 10, life: 8, magnetSpeed: 380 };

// Between-wave upgrades: the player picks one of three. Each has a max stack.
export const UPGRADES = [
  { id: 'damage', name: 'Ember Rounds', desc: '+25% bullet damage', max: 5 },
  { id: 'rate', name: 'Rapid Ignition', desc: '+20% fire rate', max: 5 },
  { id: 'speed', name: 'Swift Step', desc: '+12% move speed', max: 4 },
  { id: 'twin', name: 'Twin Flames', desc: '+1 projectile per shot', max: 3 },
  { id: 'hide', name: 'Thick Hide', desc: '+25 max health, heal 25', max: 4 },
  { id: 'magnet', name: 'Magnet Heart', desc: '+45% pickup radius', max: 3 },
  { id: 'fuse', name: 'Long Fuse', desc: '+15% bullet speed and range', max: 3 },
  { id: 'phoenix', name: 'Phoenix Charm', desc: 'Revive once at half health', max: 1 },
];

export const PARTICLES = { max: 420 };
export const SHAKE = { hit: 7, kill: 3, bossKill: 14, decay: 26 };
export const HITSTOP = { brute: 0.045, boss: 0.09 };
