// RBJ Cookbook 双二阶级联滤波器（纯函数，可在 node 测试环境运行）

import type { Pcm } from '../types';

export interface BiquadState {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/** 倍频程带通（constant 0 dB peak gain） */
export function bandpass(centerHz: number, sampleRate: number, q = 1.414): BiquadState {
  const w0 = (2 * Math.PI * centerHz) / sampleRate;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
  };
}

/** 峰值均衡，用于给噪声整形 */
export function peaking(centerHz: number, sampleRate: number, gainDb: number, q = 1.0): BiquadState {
  const a = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * centerHz) / sampleRate;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha / a;
  return {
    b0: (1 + alpha * a) / a0,
    b1: (-2 * cosw) / a0,
    b2: (1 - alpha * a) / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha / a) / a0,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
  };
}

export function processFilter(f: BiquadState, input: Pcm): Pcm {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
    f.x2 = f.x1;
    f.x1 = x;
    f.y2 = f.y1;
    f.y1 = y;
    out[i] = y;
  }
  return out;
}

export function rms(samples: Pcm, start = 0, end = samples.length): number {
  let sum = 0;
  const lo = Math.max(0, start);
  const hi = Math.min(samples.length, end);
  for (let i = lo; i < hi; i++) sum += samples[i] * samples[i];
  const n = Math.max(1, hi - lo);
  return Math.sqrt(sum / n);
}

export function peakDb(samples: Pcm): number {
  let peak = 1e-9;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return 20 * Math.log10(peak);
}
