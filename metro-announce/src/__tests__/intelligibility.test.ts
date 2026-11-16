import { describe, expect, it } from 'vitest';
import { computeAi } from '../audio/intelligibility';
import { generateCarriageNoise } from '../audio/noise';
import { synthesizeClip } from '../audio/synth';
import { SAMPLE_RATE } from '../audio/constants';

describe('车厢噪声模型与清晰度指数', () => {
  it('噪声电平校准到目标 dBA（误差 < 1.5dB）', () => {
    const noise = generateCarriageNoise(2, 68, 100);
    let sum = 0;
    for (const v of noise) sum += v * v;
    const rms = Math.sqrt(sum / noise.length);
    const dbSpl = 100 + 20 * Math.log10(rms);
    expect(dbSpl).toBeGreaterThan(66.5);
    expect(dbSpl).toBeLessThan(69.5);
  });

  it('安静噪声下 AI 高于嘈杂噪声', () => {
    const speech = synthesizeClip({ text: '前方到站海淀黄庄请做好准备', lang: 'zh', position: 'mid' });
    const quietNoise = generateCarriageNoise(speech.length / SAMPLE_RATE + 0.2, 55, 100);
    const loudNoise = generateCarriageNoise(speech.length / SAMPLE_RATE + 0.2, 85, 100);
    const aiQuiet = computeAi(speech, quietNoise, SAMPLE_RATE, 100, 55);
    const aiLoud = computeAi(speech, loudNoise, SAMPLE_RATE, 100, 85);
    expect(aiQuiet.ai).toBeGreaterThan(aiLoud.ai);
    expect(aiQuiet.ai).toBeGreaterThan(0.4);
    expect(aiLoud.ai).toBeLessThan(0.45);
    expect(aiQuiet.bands).toHaveLength(5);
    const weightSum = aiQuiet.bands.reduce((s, b) => s + b.weight, 0);
    expect(weightSum).toBeCloseTo(1, 5);
  });
});
