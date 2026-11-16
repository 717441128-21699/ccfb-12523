import { CARRIAGE_BAND_GAINS_DB, SAMPLE_RATE } from './constants';
import { bandpass, peaking, processFilter, rms } from './filters';
import type { Pcm } from '../types';

/**
 * 车厢噪声模型：白噪 -> 倍频程峰值整形（低频隆隆声）
 * -> 带通限带 -> 按 dBA 电平校准。
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCarriageNoise(
  durationSec: number,
  levelDbSpl: number,
  fullScaleDbSpl: number,
  sampleRate = SAMPLE_RATE,
  seed = 20261117,
): Pcm {
  const n = Math.ceil(durationSec * sampleRate);
  const rand = mulberry32(seed);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = rand() * 2 - 1;

  let shaped: Pcm = raw;
  for (const [freqStr, gainDb] of Object.entries(CARRIAGE_BAND_GAINS_DB)) {
    const f = peaking(Number(freqStr), sampleRate, gainDb);
    shaped = processFilter(f, shaped);
  }
  // 限带到 100Hz–8kHz
  const bpLow = bandpass(125, sampleRate, 0.7);
  shaped = processFilter(bpLow, shaped);

  // 电平校准：目标 dB SPL -> 线性 RMS
  const targetRms = Math.pow(10, (levelDbSpl - fullScaleDbSpl) / 20);
  const currentRms = rms(shaped) || 1e-9;
  const gain = targetRms / currentRms;
  for (let i = 0; i < shaped.length; i++) shaped[i] *= gain;
  return shaped;
}

/** 噪声与语音等长混合，可限制混合后峰值避免削波 */
export function mixWithNoise(speech: Pcm, noise: Pcm): Pcm {
  const n = Math.max(speech.length, noise.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (speech[i] ?? 0) + (noise[i % noise.length] ?? 0);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.99) {
    const g = 0.99 / peak;
    for (let i = 0; i < n; i++) out[i] *= g;
  }
  return out;
}
