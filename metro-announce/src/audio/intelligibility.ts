import { AI_BANDS, AI_RATINGS } from './constants';
import { bandpass, processFilter, rms } from './filters';
import type { AiBand, AiResult, Pcm } from '../types';

/**
 * 语音清晰度指数（AI，简化 ANSI S3.5-1969 倍频程法）：
 * 对 250Hz–4kHz 五个倍频程分别测语音/噪声电平，
 * SNR 截断到 +30..-12 dB 后线性映射为 0..1 带内贡献，
 * 按标准权重加权求和。
 */

const SNR_MAX = 30;
const SNR_MIN = -12;

function bandLevelDbSpl(samples: Pcm, center: number, sampleRate: number, fullScaleDbSpl: number): number {
  const f = bandpass(center, sampleRate, 1.414);
  const filtered = processFilter(f, samples);
  const r = rms(filtered);
  return fullScaleDbSpl + 20 * Math.log10(Math.max(1e-7, r));
}

export function computeAi(
  speech: Pcm,
  noise: Pcm,
  sampleRate: number,
  fullScaleDbSpl: number,
  noiseLevelDb: number,
): AiResult {
  const evalLen = Math.min(speech.length, noise.length);
  const s = speech.subarray(0, evalLen);
  const n = noise.subarray(0, evalLen);

  const bands: AiBand[] = AI_BANDS.map(({ center, weight }) => {
    const speechDb = bandLevelDbSpl(s, center, sampleRate, fullScaleDbSpl);
    const noiseDb = bandLevelDbSpl(n, center, sampleRate, fullScaleDbSpl);
    const snr = Math.max(SNR_MIN, Math.min(SNR_MAX, speechDb - noiseDb));
    const norm = (snr - SNR_MIN) / (SNR_MAX - SNR_MIN);
    return {
      band: center,
      speechDb,
      noiseDb,
      snrDb: snr,
      weight,
      contribution: weight * norm,
    };
  });

  const ai = bands.reduce((sum, b) => sum + b.contribution, 0);
  const rating = (Object.entries(AI_RATINGS)
    .sort((a, b) => b[1].min - a[1].min)
    .find(([, v]) => ai >= v.min)?.[0] ?? 'poor') as AiResult['rating'];

  return { ai, rating, bands, noiseLevelDb };
}
