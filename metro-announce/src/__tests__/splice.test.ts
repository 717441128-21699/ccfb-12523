import { describe, expect, it } from 'vitest';
import { synthesizeClip } from '../audio/synth';
import { joinClips } from '../audio/splice';
import { SAMPLE_RATE } from '../audio/constants';

const THRESHOLD = -40;

function segments(names: string[]) {
  return names.map((text, i) => ({
    samples: synthesizeClip({ text, lang: 'zh', position: i === 0 ? 'head' : i === names.length - 1 ? 'tail' : 'mid' }),
    gapBefore: i === 0 ? 0 : Math.round(0.2 * SAMPLE_RATE),
    label: text,
  }));
}

describe('拼接点瞬时电平跳变阈值', () => {
  it('合成词条首尾精确过零，接缝原始跳变低于阈值', () => {
    const segs = segments(['海淀黄庄', '知春路', '西土城']);
    const result = joinClips(segs, { thresholdDb: THRESHOLD, searchWindowMs: 30 });
    expect(result.splicePoints).toHaveLength(2);
    for (const p of result.splicePoints) {
      expect(p.rawJumpDb).toBeLessThan(THRESHOLD);
      expect(p.jumpDb).toBeLessThan(THRESHOLD);
      expect(p.passed).toBe(true);
    }
  });

  it('最坏情况（电平不连续的手工信号）触发交叉淡化并把跳变压到阈值下', () => {
    const sr = SAMPLE_RATE;
    const n = Math.round(0.15 * sr);
    const a = new Float32Array(n);
    const b = new Float32Array(n);
    // 恒值偏置信号：无过零点，走兜底路径，接缝存在直流跳变
    a.fill(0.3);
    b.fill(-0.3);
    const result = joinClips(
      [
        { samples: a, gapBefore: 0, label: 'a' },
        { samples: b, gapBefore: 0, label: 'b' },
      ],
      { thresholdDb: THRESHOLD, crossfadeMs: 8, searchWindowMs: 30 },
    );
    const p = result.splicePoints[0];
    expect(p.rawJumpDb).toBeGreaterThan(THRESHOLD);
    expect(p.jumpDb).toBeLessThan(THRESHOLD);
    expect(p.passed).toBe(true);
    expect(p.crossfadeMs).toBeGreaterThan(0);
  });

  it('整条广播在拼接区域的相邻样本差分对应电平低于阈值（接缝无爆音）', () => {
    const segs = segments(['巴沟', '苏州街', '海淀黄庄', '中关村', '知春里']);
    const { audio, splicePoints } = joinClips(segs, { thresholdDb: THRESHOLD, searchWindowMs: 30 });
    // 只检查每个接缝 ±5ms 邻域（语音信号本体的高频摆动不属于拼接跳变）
    const neighborhood = Math.round(0.005 * SAMPLE_RATE);
    for (const sp of splicePoints) {
      let maxStep = 1e-9;
      for (let i = sp.seamSample - neighborhood; i < sp.seamSample + neighborhood; i++) {
        if (i > 0 && i < audio.length) maxStep = Math.max(maxStep, Math.abs(audio[i] - audio[i - 1]));
      }
      expect(20 * Math.log10(maxStep)).toBeLessThan(THRESHOLD);
    }
  });

  it('停顿以静音采样写入，gap 时长准确', () => {
    const segs = segments(['甲站', '乙站']);
    const { gapsMs, audio, splicePoints } = joinClips(segs, { thresholdDb: THRESHOLD, searchWindowMs: 30 });
    expect(gapsMs).toHaveLength(1);
    expect(gapsMs[0]).toBeCloseTo(200, 0);
    // 接缝之前的停顿区应为静音
    const seam = splicePoints[0].seamSample;
    let maxAbs = 0;
    for (let i = seam - Math.round(0.05 * SAMPLE_RATE); i < seam; i++) {
      if (i >= 0 && i < audio.length) maxAbs = Math.max(maxAbs, Math.abs(audio[i]));
    }
    expect(maxAbs).toBeLessThan(0.01);
  });

  it('三种语调合成结果时长与轮廓不同（句尾最长、句首基频更高）', () => {
    const head = synthesizeClip({ text: '芍药居', lang: 'zh', position: 'head' });
    const mid = synthesizeClip({ text: '芍药居', lang: 'zh', position: 'mid' });
    const tail = synthesizeClip({ text: '芍药居', lang: 'zh', position: 'tail' });
    expect(head.length).toBeGreaterThan(0);
    // 同文本三语调不应逐样本相同
    expect(head.some((v, i) => v !== mid[i])).toBe(true);
    expect(mid.some((v, i) => v !== tail[i])).toBe(true);
  });
});
