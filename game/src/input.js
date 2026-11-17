// Keyboard and mouse, read once a frame. Movement is WASD or the arrow keys; the mouse
// aims and holding the button (or Space) shoots; P or Escape pauses, M mutes, 1/2/3 pick
// an upgrade card, R restarts from the end screens, and Space or a click confirms.
// Nothing here knows about the world — it only reports what the player did.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;
export const ACTION_CARD_1 = 16;
export const ACTION_CARD_2 = 32;
export const ACTION_CARD_3 = 64;
export const ACTION_CLICK = 128;

export function createInput(canvas, toField) {
  const keys = new Set();
  let actions = 0;
  let mouseX = null;
  let mouseY = null;
  let mouseDown = false;
  let mouseSeen = false;
  let lastClick = null;

  function keyOf(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = keyOf(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (k === ' ' || k === 'Enter') actions |= ACTION_CONFIRM;
    if (k === 'p' || k === 'Escape') actions |= ACTION_PAUSE;
    if (k === 'm') actions |= ACTION_MUTE;
    if (k === 'r') actions |= ACTION_RESTART;
    if (k === '1') actions |= ACTION_CARD_1;
    if (k === '2') actions |= ACTION_CARD_2;
    if (k === '3') actions |= ACTION_CARD_3;
  });
  window.addEventListener('keyup', (e) => keys.delete(keyOf(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseSeen = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseSeen = true;
    mouseDown = true;
    lastClick = { x: e.clientX, y: e.clientY };
    actions |= ACTION_CLICK;
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function direction() {
    let mx = 0;
    let my = 0;
    if (keys.has('a') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('d') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('w') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('s') || keys.has('ArrowDown')) my += 1;
    return { mx, my };
  }

  function aim() {
    if (!mouseSeen || mouseX === null) return { x: undefined, y: undefined, hasAim: false };
    const f = toField(mouseX, mouseY);
    return { x: f.x, y: f.y, hasAim: true };
  }

  function firing() {
    return mouseDown || keys.has(' ');
  }

  function takeActions() {
    const a = actions;
    actions = 0;
    return a;
  }

  /** The field coordinates of the last mouse click, once; null when there was none. */
  function takeClickPos() {
    if (!lastClick) return null;
    const f = toField(lastClick.x, lastClick.y);
    lastClick = null;
    return f;
  }

  return { direction, aim, firing, takeActions, takeClickPos };
}
