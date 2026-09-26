/*
 * STAGE 1 - FIRE RINGS. A new implementation with the same rules, speeds and
 * timings as the arcade game (values taken from the reverse engineered code,
 * see js/engine/stage1.js), but built for a wide screen: the world is a long
 * strip and objects live in world coordinates.
 *
 * Units: pixels of the original game, 60.6 frames per second. Speeds use the
 * original 8.8 fixed point values (256 = 1 pixel per frame).
 *
 * Screen reference (original 224 pixel picture): Charlie + lion occupy
 * x 21..69; "hw" positions below are the original sprite coordinates
 * (screen x + 16) used by the collision tests of the arcade code.
 */
(function (root) {
  'use strict';
  const R = root.Remake = root.Remake || {};

  const SPEED_FWD = -0x0180;    // joystick right: the camera moves 1.5 px/frame
  const SPEED_BACK = 0x0130;    // joystick left: 1.19 px/frame back
  const JUMP_VY = -0x0380;      // jump: -3.5 px/frame, gravity 0x1C
  const GRAVITY = 0x001c;
  const RING_DRIFT = 0x0080;    // rings move 0.5 px/frame towards Charlie
  const GROUND_Y = 0xd0;        // top of Charlie when on the lion, on the ground
  const CHARLIE_X = 21;         // screen x of the Charlie + lion picture
  const PAGE = 256;             // a "page" = 10 metres

  // ROM tables (difficulty and progression)
  const RING_GAPS = [0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf8, 0xf2, 0xf2, 0xf2, 0x18, 0xf2, 0xf2, 0xe4, 0xec, 0xdc, 0xf4, 0xd4, 0xec, 0xdc, 0xe4, 0xde, 0x1b, 0xee, 0xf6, 0x1b, 0xde, 0xee, 0x1b, 0xd0, 0xc0, 0xe8, 0xb8, 0xe0, 0xe8, 0xb8, 0xd0, 0xe8, 0x1e, 0xde, 0x1e, 0xc6, 0x1e, 0xe0, 0x1e, 0xc6, 0x1e, 0xbc, 0xa4, 0xf4, 0xd4, 0xec, 0x84, 0x8c, 0xbc, 0xbc, 0x21, 0xc0, 0x21, 0xc4, 0x21, 0xee, 0x21, 0xc0, 0x21, 0xa8, 0x88, 0xc8, 0x78, 0x70, 0xd8, 0xe0, 0xa8, 0xe2, 0x24, 0xda, 0x7a, 0x24, 0xca, 0x8a, 0x24, 0x94, 0x64, 0xcc, 0xac, 0xc4, 0x5c, 0x94, 0x7c, 0x7e, 0xc6, 0xae, 0x27, 0xce, 0x66, 0x84, 0x9c, 0x6c, 0x9c, 0x84, 0x6c, 0x9c, 0x6c];
  const POT_GAPS = [0xf6, 0xfc, 0xf2, 0xfc, 0xee, 0xfc, 0xea, 0xfc, 0xe6, 0xfc, 0xe2, 0xfc, 0xde, 0xfc, 0xda, 0xfc, 0xd6, 0xfc, 0xd2, 0xfc, 0xce, 0xfc, 0xca, 0xfc, 0xc6, 0xfc, 0xc2, 0xfc, 0xbe, 0xfc, 0xba, 0xfc, 0xb6, 0xfc, 0xb2, 0xfc, 0xae, 0xfc, 0xaa, 0xfc, 0xa6, 0xfc, 0xa2, 0xfc, 0x9e, 0xfc, 0x9a, 0xfc, 0x96, 0xfc, 0x92, 0xfc];
  // stage clear: points for the BONUS left
  const CLEAR_BONUS = [[4500, 10000], [4000, 5000], [3500, 4000], [3000, 3000], [2500, 2000], [2000, 1000], [1500, 800], [1001, 600], [500, 400], [0, 200]];

  class Stage1 {
    /**
     * player: {score, lives, rings, pots, misses, round (1 = first loop)} kept between lives.
     * opts: {difficulty: 0 easy .. 3 hardest, demo}
     */
    constructor(player, opts) {
      this.player = player;
      this.opts = opts || {};
      this.events = [];                 // sounds / messages for the front end
      this.restart(player.checkpoint || 0);
    }

    // ---------------------------------------------------------------- setup
    restart(checkpoint) {
      const p = this.player;
      // camera: "page" (10 m) and "fine" position (8.8, counts down) as in the original
      this.page = Math.ceil(checkpoint / PAGE);
      this.fine = Math.round((this.page * PAGE - checkpoint) * 256) & 0xffff;
      this.frame = 0;
      this.rand = (p.seed = ((p.seed || 7) * 1103515245 + 12345) & 0x7fffffff) & 0xff;
      this.c = { y: GROUND_Y << 8, vy: 0, air: false, speed: 0, buffered: null, bufferJump: false,
        walkMark: this.fineHi(), walkFrame: 0, walkBack: false, pose: 'quieto', ringsAhead: [], potAhead: null };
      this.rings = [];                  // {x (world, 8.8 px), small, bag, flame}
      this.pots = [];                   // {x (world px), state: 'wait'|'on', flame}
      this.ringTimer = 0x1000;
      this.lastGap = 0x10;
      this.backTimer = 0;
      this.smallPassed = false;
      this.potWait = null;              // countdown (8.8 px) for the next pot
      this.popups = [];
      this.bonus = 5800;                // BONUS: counts down one per frame
      this.bonusOut = 0;
      this.state = 'play';              // play | dead | goal | clear
      this.timer = 0;
      if ((p.round ?? 1) > 1 || (this.page >= 2 && this.page <= 4)) this.potWait = 0x4000;
      this.events.push({ type: 'music', name: checkpoint ? 'restart' : 'start' });
    }

    fineHi() { return this.fine >> 8; }

    /** Distance travelled in pixels (camera position in the world). */
    get cam() { return this.page * PAGE - this.fine / 256; }

    diffRing() {
      if (this.opts.demo) return 0x10;
      const d = [0x00, 0x20, 0x40, 0x60][this.opts.difficulty ?? 1];   // easy .. hardest (inverted DIP switches)
      return (((((this.player.round ?? 1) - 1) << 4) & 0xff) + (d >> 1)) & 0xff;
    }

    diffPot() {
      if (this.opts.demo) return 8;
      const d = [0x00, 0x20, 0x40, 0x60][this.opts.difficulty ?? 1];   // easy .. hardest (inverted DIP switches)
      return ((d >> 2) + ((((this.player.round ?? 1) - 1) << 3) & 0xff)) & 0xff;
    }

    // ------------------------------------------------------------- per frame
    /**
     * input: {left, right, jump (pressed this frame, edge)}.
     * view: {left, right} visible world range relative to the camera in
     * screen pixels (the original picture is 0..224); objects are created at
     * the right edge of the visible area.
     */
    update(input, view) {
      this.frame++;
      this.view = view;
      if (this.state === 'dead') return this.updateDead();
      if (this.state === 'goal') return this.updateGoal();
      if (this.state !== 'play') return;

      if (this.bonus > 0) { this.bonus--; if (this.bonus === 499) this.events.push({ type: 'music', name: 'hurry' }); }
      else if (++this.bonusOut >= 64) { this.die(); return; }

      if (this.checkCollisions()) return;
      const c = this.c;
      let ground = !c.air;
      if (c.air) {
        c.vy += GRAVITY;
        const y = c.y + c.vy;
        if ((this.page > 7 || (this.page === 7 && this.fineHi() >= 0x28)) && (y >> 8) >= 0xc5) { this.goal(); return; }
        c.y = y;
        const h = (y >> 8) + 8;
        if (h >= 0xd4) {
          // near the ground: the joystick and the jump button are read in advance
          c.buffered = this.joySpeed(input);
          if (input.jump) c.bufferJump = true;
        }
        if (h === 0xd8) {
          c.air = false; c.pose = 'quieto';
          c.walkMark = this.fineHi(); c.walkFrame = 0;
          if (c.speed < 0) this.landingPoints();
          ground = true;
        }
      }
      if (ground) {
        c.speed = c.buffered !== null ? c.buffered : c.speed;
        let jump = c.bufferJump;
        if (!jump) {
          c.speed = this.joySpeed(input);
          jump = input.jump;
          if (!jump) this.walkAnim();
        }
        c.buffered = null; c.bufferJump = false;
        if (jump) this.jump();
      }
      const camBefore = this.cam;
      this.scroll();
      this.camDelta256 = Math.round((this.cam - camBefore) * 256);
      this.ringSpawner();
      this.ringsFromBehind();
      this.moveRings();
      this.movePots();
      this.popups = this.popups.filter((p) => --p.t > 0);
    }

    joySpeed(input) {
      if (input.right && !input.left) return SPEED_FWD;
      if (input.left && !input.right) return SPEED_BACK;
      return 0;
    }

    walkAnim() {
      const c = this.c;
      if (!c.speed) { c.walkFrame = 0; c.pose = 'quieto'; return; }
      let a = (c.walkMark - this.fineHi() + 7) & 0xff;
      if (a < 0x12) return;
      a = (a - 7) & 0xff;
      c.walkBack = (a & 0x80) !== 0;
      c.walkMark = (c.walkMark + (c.walkBack ? 7 : 0xf5)) & 0xff;
      c.walkFrame = (c.walkFrame + 1) % 3;
      c.pose = c.walkBack ? 'retrocede' : 'corre';
    }

    jump() {
      const c = this.c;
      c.air = true; c.vy = JUMP_VY; c.pose = 'salta';
      this.events.push({ type: 'sound', name: 'jump' });
      // what is in front of Charlie when he jumps (for the points on landing)
      // (8 bit test of the original: 0x40 <= x < 0xC0)
      c.ringsAhead = this.rings.filter((r) => this.hw(r.x) >= 0x40 && this.hw(r.x) < 0xc0);
      c.potAhead = this.pots.find((p) => p.state === 'on' && this.hwPx(p.x) >= 0x40 && this.hwPx(p.x) < 0xa0) || null;
    }

    landingPoints() {
      const c = this.c;
      // rings jumped through (the mark stays even if the ring already left the screen)
      const n = c.ringsAhead.filter((r) => !this.rings.includes(r) || this.hw(r.x) < 0x40).length;
      const pot = c.potAhead && this.pots.includes(c.potAhead) && this.hwPx(c.potAhead.x) < 0x40 ? 2 : 0;
      if (pot && this.page >= 7) this.player.lateRings = (this.player.lateRings || 0) + 1;
      if (n) this.points((n + pot) * 100, CHARLIE_X + 24);
      else if (pot) {
        this.points(500, this.hwPx(c.potAhead.x) - 16 - 8);
        this.events.push({ type: 'sound', name: 'points' });
      }
      c.ringsAhead = []; c.potAhead = null;
    }

    points(v, screenX) {
      this.player.score += v;
      this.events.push({ type: 'score', value: v });
      this.popups.push({ value: v, x: this.cam + screenX, y: 0x90, t: 0x30 });
    }

    // original sprite coordinate of a world position (rings keep 8.8 positions)
    hw(x256) { return Math.floor((x256 - this.cam * 256) / 256) + 16; }
    hwPx(x) { return Math.floor(x - this.cam) + 16; }

    // -------------------------------------------------------- collisions
    checkCollisions() {
      const c = this.c;
      for (const r of this.rings) {
        const dist = Math.abs(this.hw(r.x) - 0x40);
        if (dist >= 0x0e) continue;
        let a = c.y >> 8;
        if (r.small) a += 0x10;
        a -= 0xb6;
        if (a >= 0) {
          if (a + dist <= 0x1c) { this.die(); return true; }
          break;
        }
        // through the ring: the small ring gives its money bag
        if (r.small && r.bag) {
          r.bag = false;
          const k = this.player.bags || 0;
          this.points((k + 1) * 1000, this.hw(r.x) - 16 - 24);
          this.player.bags = Math.min(4, k + 1);
          this.events.push({ type: 'sound', name: 'bag' });
        }
        break;
      }
      for (const p of this.pots) {
        if (p.state !== 'on') continue;
        const x = this.hwPx(p.x);
        if (x - 0x29 >= 0 && x - 0x29 < 0x2e && (c.y >> 8) + 8 >= 0xce) { this.die(); return true; }
      }
      return false;
    }

    // -------------------------------------------------------------- camera
    scroll() {
      const d = this.c.speed;
      if (!d) return;
      if (d < 0) {
        if (this.cam >= CAM_MAX) return;          // the end of the track
        const r = this.fine + d;
        if (r >= 0) this.fine = r; else { this.fine = r & 0xffff; this.page++; }
      } else {
        if (!this.page) return;
        const r = this.fine + d;
        if (r <= 0xffff) this.fine = r; else { this.fine = r & 0xffff; this.page--; }
      }
    }

    // speed of the camera for the objects (it does not move on the first page)
    relSpeed() { return this.page ? this.c.speed : 0; }

    // --------------------------------------------------------------- rings
    ringSpawner() {
      const d = this.relSpeed() - RING_DRIFT;
      if (d >= 0 || (this.page >= 7 && (this.player.lateRings || 0) < 5)) { this.ringTimer += d; return; }
      const r = this.ringTimer + d;
      if (r >= 0) { this.ringTimer = r; return; }
      let b = (this.diffRing() + this.player.rings) & 0xff;
      if (b >= 0x68) b = (b & 7) + 0x60;
      const gap = RING_GAPS[b];
      b = (b + this.rand) & 0xff;
      if (!(b & 3)) {
        if (this.lastGap >= 0x60) { this.spawnSmallRing(); return; }
        this.rand++;
      }
      this.ringTimer = gap << 8;
      this.lastGap = gap;
      this.player.rings++;
      if (this.rings.filter((q) => !q.small).length >= 3) return;
      this.rings.push({ x: this.spawnX256(), small: false, flame: 0 });
    }

    spawnSmallRing() {
      let a = 0x60;
      if ((this.player.round ?? 1) <= 1) a = (this.frame | 0x80) & 0xff;
      this.ringTimer = a << 8;
      this.lastGap = a;
      this.player.rings++;
      if (this.rings.some((q) => q.small)) return;
      this.rings.push({ x: this.spawnX256(), small: true, bag: true, flame: 0 });
    }

    // rings are created just outside the right edge of the visible area
    spawnX256() {
      // original: sprite x 0xFF.80 (just outside the 240 pixel sprite area)
      // the camera movement of this frame also applies to the new ring (it is created before the rings move)
      return Math.floor(this.cam * 256) + this.relSpeed() + Math.max(0xef80, Math.ceil(this.view.right) * 256 + 0xf80);
    }

    // walking back: rings come from the left
    ringsFromBehind() {
      const d = RING_DRIFT - this.relSpeed();
      if (d >= 0) { this.backTimer += d; return; }
      const r = this.backTimer + d;
      if (r >= 0) { this.backTimer = r; return; }
      if (this.rings.some((q) => this.hw(q.x) - 1 >= 0 && this.hw(q.x) - 1 < 0x40)) return;
      const x = Math.floor((this.cam + Math.min(-15, this.view.left - 32)) * 256);
      if (this.smallPassed) {
        this.smallPassed = false;
        if (!this.rings.some((q) => q.small)) this.rings.push({ x, small: true, bag: false, flame: 0 });
        return;
      }
      if (this.rings.filter((q) => !q.small).length < 3) this.rings.push({ x, small: false, flame: 0 });
    }

    moveRings() {
      const d = this.relSpeed() - RING_DRIFT;       // relative to the camera
      // in the world: -0.5 px/frame (the original moves the rings on the screen by
      // the camera speed, except on the first page)
      const move = d + (this.camDelta256 || 0);
      for (const r of [...this.rings]) {
        r.x += move;
        r.flame++;
        const sx = this.hw(r.x) - 16;
        if (sx < Math.min(-16, this.view.left - 16)) {
          // passed on the left
          this.backTimer = 0;
          this.smallPassed = false;
          if (r.small) { this.smallPassed = true; if (r.bag) this.player.misses++; }
          this.rings.splice(this.rings.indexOf(r), 1);
        } else if (sx > Math.max(0xf0, this.view.right + 48) && d > 0) {
          // left behind on the right (walking back)
          this.ringTimer = 0;
          this.player.rings = Math.max(0, this.player.rings - 1);
          this.rings.splice(this.rings.indexOf(r), 1);
        }
      }
    }

    // ---------------------------------------------------------------- pots
    movePots() {
      const d = this.c.speed;
      // countdown to the next pot: it only advances when the camera moves.
      // The original keeps 3 pot records processed in order: when the next
      // pot uses a later record, its countdown already runs this frame.
      if (this.potWait !== null && this.page) {
        for (let again = true; again && this.potWait !== null;) {
          again = false;
          this.potWait += d;
          if (this.potWait > 0xffff) { this.potWait = null; break; }     // walked back too far
          if (this.potWait >= 0) break;
          // a new pot appears at the right edge of the original picture: its
          // world position is fixed, so in a wide window it is already visible
          this.pots.push({ x: this.cam + 240, state: 'on', flame: 0 });
          let a = (this.diffPot() + (this.player.pots || 0)) & 0xff;
          if (a >= 0x34) a = (a & 3) + 0x30;
          const b = POT_GAPS[a];
          this.player.pots = (this.player.pots || 0) + 1;
          const here = (this.page << 8) | ((~this.fineHi()) & 0xff);
          const slot = this.potSlot || 0;
          this.potSlot = (slot + 1) % 3;
          this.potWait = here + b < 0x05f8 ? b << 8 : null;
          again = this.potSlot > slot;
        }
      } else if (this.potWait === null && d < 0 && this.fineHi() < 2 &&
                 ((this.player.round ?? 1) > 1 || (this.page >= 2 && this.page <= 4)) && !this.pots.length) {
        this.potWait = 0x4000;
        this.potSlot = 0;
      }
      // last pages: two pots per page at fixed places (fine position 4 and 0x5E)
      if (this.page >= 6 && d < 0) {
        const f = this.fineHi(), prev = ((this.fine - d) >> 8) & 0xff;
        for (const at of [4, 0x5e]) {
          if (f < at + 2 && f >= at && !(prev < at + 2 && prev >= at)) this.pots.push({ x: this.cam + 240, state: 'on', flame: 0 });
        }
      }
      for (const p of [...this.pots]) {
        p.flame++;
        if (p.x - this.cam < Math.min(-14, this.view.left - 40)) this.pots.splice(this.pots.indexOf(p), 1);
      }
    }

    /** Pots that will appear (for the wide view): the next one's position is already known. */
    get upcomingPot() {
      return this.potWait !== null ? this.cam + 240 + this.potWait / 256 : null;
    }

    // --------------------------------------------------------- death & goal
    die() {
      const c = this.c;
      this.state = 'dead';
      this.timer = 0x40;
      c.pose = 'cae';
      this.player.misses++;
      this.events.push({ type: 'music', name: 'death' });
    }

    updateDead() {
      if (--this.timer > 0) return;
      // back to the previous checkpoint: one page (two on the last one)
      let page = this.page;
      if (page) { if (page >= 7) page--; page--; }
      const cam = Math.max(0, page * PAGE - this.fine / 256);
      this.player.lives--;
      this.player.checkpoint = cam;
      this.events.push({ type: 'dead', gameOver: this.player.lives <= 0 });
      this.state = this.player.lives <= 0 ? 'over' : 'restart';
    }

    goal() {
      this.state = 'goal';
      this.timer = 0;
      this.c.pose = 'celebra';
      this.c.y = 0xb3 << 8;
      this.goalCam = this.cam;
      this.rings = []; this.pots = [];
      this.perfect = this.player.misses === 0;
      this.fireworks = [];
      this.events.push({ type: 'music', name: 'goal' });
    }

    updateGoal() {
      this.timer++;
      if (this.perfect && this.timer % 40 === 0) {
        this.fireworks.push({ x: this.cam + 60 + ((this.timer * 37) % 140), y: 100 + ((this.timer * 53) % 40), t: 24 });
      }
      this.fireworks = (this.fireworks || []).filter((f) => --f.t > 0);
      if (this.timer >= 256) {
        this.state = 'clear';
        const b = this.bonus;
        this.clearPoints = CLEAR_BONUS.find(([min]) => b >= min)[1];
        this.player.score += this.clearPoints;
        this.events.push({ type: 'clear', bonus: b, points: this.clearPoints });
      }
    }

    // ------------------------------------------------------ for the renderer
    /** Distance markers: one every page ("100M", "90M", ...). */
    markers(fromX, toX) {
      const out = [];
      for (let p = Math.max(0, Math.floor(fromX / PAGE)); p * PAGE + 24 < toX + 48; p++) {
        if (p > 9) break;
        out.push({ x: p * PAGE + 24, value: 100 - p * 10 });
      }
      return out;
    }
  }

  const CAM_MAX = 8 * PAGE - 8;
  R.Stage1 = Stage1;
  // the podium enters the screen on the last page (world position of its left side)
  R.STAGE1 = { CHARLIE_X, GROUND_Y, PAGE, PODIUM_X: 7 * PAGE + 0x100 - 0x28 };
})(typeof window !== 'undefined' ? window : globalThis);
