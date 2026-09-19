/** Pure math: no recording, network, DOM, randomness or provider dependency. */
export const clamp = (x, lo = 0, hi = 1) => Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo;
export function rms(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (const sample of samples) { const x = Number.isFinite(sample) ? sample : 0; sum += x * x; }
  return Math.sqrt(sum / samples.length);
}
export function normalizeLevel(value, floorDb = -56, ceilingDb = -12) {
  if (!(value > 0)) return 0;
  return Math.pow(clamp((20 * Math.log10(value) - floorDb) / (ceilingDb - floorDb)), 1.25);
}
export function smoothEnvelope(previous, target, seconds, attack = .045, release = .22) {
  const dt = clamp(seconds, 0, .25);
  return previous + (target - previous) * (1 - Math.exp(-dt / (target > previous ? attack : release)));
}
export function bandLevel(data, sampleRate, fftSize, fromHz, toHz) {
  if (!data?.length || !(sampleRate > 0) || !(fftSize > 0)) return 0;
  const a = Math.max(1, Math.floor(fromHz * fftSize / sampleRate));
  const b = Math.min(data.length, Math.ceil(toHz * fftSize / sampleRate));
  if (a >= b) return 0;
  let sum = 0; for (let i = a; i < b; i++) sum += data[i] / 255;
  return sum / (b - a);
}
/** Compact optical waveform. Zero audio always returns a circle, never a fake waveform. */
export function ringPoints(samples, radius, level, cx = 240, cy = 240, count = 96) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2;
    const sample = samples?.length ? clamp(samples[Math.floor(i / count * samples.length)], -1, 1) : 0;
    const r = radius + clamp(level) * 5 + sample * 34;
    points.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return points.join(' ');
}
export function presentationState(s) {
  if (s.connection === 'error') return { key:'error', label:'语音连接异常' };
  if (s.connection === 'connecting') return { key:'connecting', label:'正在连接语音' };
  if (s.connection !== 'connected') return { key:'idle', label:'待机 · 未接通语音' };
  if (s.userSpeaking && s.agentSpeaking && !s.micMuted) return { key:'duplex', label:'双向音频活动' };
  if (s.agentSpeaking) return { key:'speaking', label:s.micMuted ? '正在播报 · 麦克风静音' : '正在播报 · 可打断' };
  if (s.userSpeaking && !s.micMuted) return { key:'listening', label:'正在聆听' };
  if (s.working) return { key:'working', label:s.micMuted ? '正在处理 · 麦克风静音' : '正在处理 · 仍可说话' };
  if (s.micMuted) return { key:'muted', label:'麦克风已静音' };
  return { key:'listening', label:'已接通 · 正在聆听' };
}
