/*
 * Keyboard / gamepad / touch input mapped to the arcade controls.
 *   ENTER          -> start (the port runs in free play; no coins needed)
 *   arrows / A D   -> joystick left / right
 *   SPACE Z X UP   -> jump button
 *   2              -> start 2 players
 */
(function (root) {
  'use strict';
  const CC = root.CC;

  const KEYS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    button: ['Space', 'KeyZ', 'KeyX', 'ArrowUp', 'KeyW', 'ControlLeft', 'ControlRight'],
    start1: ['Enter', 'NumpadEnter'],
    start2: ['Digit2'],
  };

  class Input {
    constructor() {
      this.keys = new Set();
      this.touch = { left: false, right: false, button: false, start1: false };
      this.pulses = { start1: 0, start2: 0 };
      this.enabled = true;
      this.onKey = null; // (code, event) for menu shortcuts
      root.addEventListener('keydown', (e) => {
        if (this.onKey && this.onKey(e.code, e) === false) return;
        if (!this.enabled) return;
        const mapped = this.mapped(e.code);
        if (mapped) {
          e.preventDefault();
          if (!e.repeat) {
            if (mapped === 'start1' || mapped === 'start2') this.pulses[mapped] = 8;
          }
        }
        this.keys.add(e.code);
      });
      root.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
      root.addEventListener('blur', () => this.keys.clear());
    }

    mapped(code) {
      for (const k in KEYS) if (KEYS[k].includes(code)) return k;
      return null;
    }

    pressStart() { this.pulses.start1 = 8; }

    held(name) {
      for (const c of KEYS[name]) if (this.keys.has(c)) return true;
      return false;
    }

    pollGamepads() {
      const st = { left: false, right: false, button: false, start: false };
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p) continue;
        const ax = p.axes[0] || 0;
        const b = (i) => p.buttons[i] && p.buttons[i].pressed;
        if (ax < -0.4 || b(14)) st.left = true;
        if (ax > 0.4 || b(15)) st.right = true;
        if (b(0) || b(1) || b(2) || b(3) || b(12)) st.button = true;
        if (b(9) || b(8)) st.start = true;
      }
      if (st.start && !this.padStart) this.pulses.start1 = 8;
      this.padStart = st.start;
      return st;
    }

    /** Returns the arcade input state for the next frame. */
    frame() {
      const gp = this.pollGamepads();
      const inp = {
        left: this.held('left') || gp.left || this.touch.left,
        right: this.held('right') || gp.right || this.touch.right,
        button: this.held('button') || gp.button || this.touch.button,
        start1: this.pulses.start1 > 0,
        start2: this.pulses.start2 > 0,
      };
      if (inp.left && inp.right) { inp.left = false; inp.right = false; }
      if (this.pulses.start1 > 0) this.pulses.start1--;
      if (this.pulses.start2 > 0) this.pulses.start2--;
      return inp;
    }
  }

  CC.Input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
