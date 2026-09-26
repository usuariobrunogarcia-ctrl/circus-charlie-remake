/*
 * Audio output: the emulator produces samples every video frame; they are
 * streamed to an AudioWorklet (or a ScriptProcessor as fallback) through a
 * small queue. If the queue grows (browser running faster than audio) old
 * samples are dropped to keep latency low.
 */
(function (root) {
  'use strict';
  const CC = root.CC;

  const WORKLET = `
class CCOut extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = []; this.cur = null; this.pos = 0; this.size = 0;
    this.vol = 1; this.last = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.samples) { this.q.push(d.samples); this.size += d.samples.length; }
      if (d.vol !== undefined) this.vol = d.vol;
      if (d.flush) { this.q = []; this.cur = null; this.size = 0; }
      const max = sampleRate * 0.25;
      while (this.size > max && this.q.length > 1) { this.size -= this.q.shift().length; }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (!this.cur || this.pos >= this.cur.length) {
        if (this.cur) this.size -= this.cur.length;
        this.cur = null; this.pos = 0;
        if (this.primed || this.size >= sampleRate * 0.045) { this.cur = this.q.shift() || null; }
        this.primed = !!this.cur;
        if (!this.cur) { this.last *= 0.995; out[i] = this.last; continue; }
      }
      this.last = this.cur[this.pos++] * this.vol;
      out[i] = this.last;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('cc-out', CCOut);
`;

  class AudioOut {
    constructor() {
      this.ctx = null;
      this.node = null;
      this.volume = 0.8;
      this.muted = false;
      this.ready = false;
      this.fallbackQueue = [];
    }

    get sampleRate() { return this.ctx ? this.ctx.sampleRate : 48000; }

    async init() {
      if (this.ctx) return;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ctx = new AC(); }
      try {
        if (!this.ctx.audioWorklet) throw new Error('no worklet');
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        await this.ctx.audioWorklet.addModule(url);
        this.node = new AudioWorkletNode(this.ctx, 'cc-out', { outputChannelCount: [2] });
        this.node.connect(this.ctx.destination);
        this.mode = 'worklet';
      } catch (e) {
        // ScriptProcessor fallback
        const sp = this.ctx.createScriptProcessor(2048, 0, 2);
        let cur = null, pos = 0;
        sp.onaudioprocess = (ev) => {
          const l = ev.outputBuffer.getChannelData(0), r = ev.outputBuffer.getChannelData(1);
          for (let i = 0; i < l.length; i++) {
            if (!cur || pos >= cur.length) { cur = this.fallbackQueue.shift() || null; pos = 0; }
            const v = cur ? cur[pos++] * this.effectiveVolume() : 0;
            l[i] = v; r[i] = v;
          }
          while (this.fallbackQueue.length > 12) this.fallbackQueue.shift();
        };
        sp.connect(this.ctx.destination);
        this.node = sp;
        this.mode = 'script';
      }
      this.ready = true;
      this.applyVolume();
    }

    effectiveVolume() { return this.muted ? 0 : this.volume; }

    applyVolume() {
      if (this.mode === 'worklet' && this.node) this.node.port.postMessage({ vol: this.effectiveVolume() });
    }

    setVolume(v) { this.volume = v; this.applyVolume(); }
    setMuted(m) { this.muted = m; this.applyVolume(); }

    resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

    push(buf, n) {
      if (!this.ready) return;
      const copy = buf.slice(0, n);
      if (this.mode === 'worklet') this.node.port.postMessage({ samples: copy }, [copy.buffer]);
      else this.fallbackQueue.push(copy);
    }

    flush() {
      if (this.mode === 'worklet' && this.node) this.node.port.postMessage({ flush: true });
      this.fallbackQueue.length = 0;
    }
  }

  CC.AudioOut = AudioOut;
})(typeof window !== 'undefined' ? window : globalThis);
