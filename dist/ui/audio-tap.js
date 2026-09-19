import { rms, normalizeLevel, bandLevel } from './audio-math.js';
/**
 * Read-only branch tap in an EXISTING AudioContext.
 * This class never requests a mic, records audio, connects to speakers or closes the context.
 * Call dispose() before closing the session context. Source nodes remain owned by the caller.
 */
export class AudioTap {
  constructor(context, { fftSize = 1024 } = {}) {
    if (!context?.createAnalyser || context.state === 'closed') throw new TypeError('A live AudioContext is required');
    this.context = context;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = .65;
    this.wave = new Float32Array(this.analyser.fftSize);
    this.frequency = new Uint8Array(this.analyser.frequencyBinCount);
    this.nodes = new Set(); this.disposed = false;
    this.result = { rms:0, level:0, wave:this.wave, bass:0, mid:0, high:0 };
  }
  addSource(node) {
    if (this.disposed) throw new Error('AudioTap is disposed');
    if (node?.context !== this.context || typeof node.connect !== 'function') throw new TypeError('Source must share the AudioContext');
    if (!this.nodes.has(node)) { node.connect(this.analyser); this.nodes.add(node); }
    return this;
  }
  removeSource(node) {
    if (this.nodes.delete(node)) { try { node.disconnect(this.analyser); } catch {} }
  }
  read() {
    const r = this.result;
    if (this.disposed || this.context.state !== 'running' || !this.nodes.size) {
      this.wave.fill(0); this.frequency.fill(0); r.rms=r.level=r.bass=r.mid=r.high=0; return r;
    }
    this.analyser.getFloatTimeDomainData(this.wave);
    this.analyser.getByteFrequencyData(this.frequency);
    r.rms = rms(this.wave); r.level = normalizeLevel(r.rms);
    r.bass = bandLevel(this.frequency,this.context.sampleRate,this.analyser.fftSize,80,320);
    r.mid = bandLevel(this.frequency,this.context.sampleRate,this.analyser.fftSize,320,1500);
    r.high = bandLevel(this.frequency,this.context.sampleRate,this.analyser.fftSize,1500,5000);
    return r;
  }
  dispose() {
    if (this.disposed) return;
    for (const node of [...this.nodes]) this.removeSource(node);
    this.analyser.disconnect(); this.disposed = true; this.read();
  }
}
