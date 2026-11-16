import { DEFAULT_CROSSFADE_MS, SAMPLE_RATE } from './constants';
import { rms } from './filters';
import type { SplicePoint, Pcm } from '../types';

/**
 * 拼接引擎：在两段词条相邻边界的搜索窗内，
 * 找"两边局部能量都低"的过零点作为接缝；
 * 若接缝瞬时电平跳变超过阈值，用等功率交叉淡化压下去。
 */

export interface ClipSegment {
  samples: Pcm;
  /** 与上一段之间的停顿（采样数） */
  gapBefore: number;
  label: string;
}

export interface JoinResult {
  audio: Pcm;
  splicePoints: SplicePoint[];
  gapsMs: number[];
}

const ampToDb = (a: number): number => 20 * Math.log10(Math.max(1e-7, Math.abs(a)));

interface ZeroCandidate {
  leftTrim: number;
  rightTrim: number;
  jumpDb: number;
  energy: number;
}

/** 在搜索窗内枚举过零点候选，返回能量最低且跳变最小的一个 */
function findBestZero(a: Pcm, b: Pcm, searchSamples: number): ZeroCandidate {
  const aStart = Math.max(0, a.length - searchSamples);
  const bEnd = Math.min(b.length, searchSamples);
  const win = Math.max(8, Math.round(0.004 * SAMPLE_RATE));
  const candidates: ZeroCandidate[] = [];

  for (let i = aStart; i < a.length - 1; i++) {
    if (!(a[i] <= 0 && a[i + 1] > 0)) continue; // 上升沿过零
    const frac = a[i] === a[i + 1] ? 0 : -a[i] / (a[i + 1] - a[i]);
    const leftAmp = a[i] + frac * (a[i + 1] - a[i]);
    for (let j = 0; j < bEnd - 1; j++) {
      if (!(b[j] <= 0 && b[j + 1] > 0)) continue;
      const fracR = b[j] === b[j + 1] ? 0 : -b[j] / (b[j + 1] - b[j]);
      const rightAmp = b[j] + fracR * (b[j + 1] - b[j]);
      const jumpDb = ampToDb(Math.abs(rightAmp - leftAmp));
      const energy = rms(a, i - win, i + 1) + rms(b, j, j + win);
      candidates.push({ leftTrim: i, rightTrim: j, jumpDb, energy });
    }
  }

  if (candidates.length === 0) {
    return {
      leftTrim: a.length,
      rightTrim: 0,
      jumpDb: ampToDb(Math.abs((b[0] ?? 0) - (a[a.length - 1] ?? 0))),
      energy: rms(a, aStart) + rms(b, 0, bEnd),
    };
  }
  // 主排序能量最低，同能量级下取跳变小的
  candidates.sort((x, y) => x.energy - y.energy || x.jumpDb - y.jumpDb);
  return candidates[0];
}

interface ResolvedJoin {
  candidate: ZeroCandidate;
  useFade: boolean;
  finalJumpDb: number;
}

export function joinClips(
  segments: ClipSegment[],
  options: { thresholdDb: number; crossfadeMs?: number; searchWindowMs: number },
): JoinResult {
  const crossfadeMs = options.crossfadeMs ?? DEFAULT_CROSSFADE_MS;
  const searchSamples = Math.round((options.searchWindowMs / 1000) * SAMPLE_RATE);
  const fadeSamples = Math.max(2, Math.round((crossfadeMs / 1000) * SAMPLE_RATE));

  // 第一遍：确定每个接缝的过零点与是否需要淡化
  const joins: ResolvedJoin[] = [];
  for (let idx = 1; idx < segments.length; idx++) {
    const candidate = findBestZero(
      segments[idx - 1].samples,
      segments[idx].samples,
      searchSamples,
    );
    const remaining = segments[idx].samples.length - candidate.rightTrim;
    const useFade = candidate.jumpDb > options.thresholdDb && remaining > fadeSamples;
    joins.push({ candidate, useFade, finalJumpDb: candidate.jumpDb });
  }

  // 交叉淡化只在接缝区域内混合左右样本，不改变总布局长度；
  // 取上限（含全部原始样本与停顿），最后按实际写入量切片
  const totalLen = segments.reduce((sum, s) => sum + s.samples.length + s.gapBefore, 0);
  const out = new Float32Array(totalLen);
  const splicePoints: SplicePoint[] = [];
  const gapsMs: number[] = [];

  let write = 0;
  segments.forEach((seg, idx) => {
    if (seg.gapBefore > 0) {
      write += seg.gapBefore;
      gapsMs.push((seg.gapBefore / SAMPLE_RATE) * 1000);
    }

    if (idx === 0) {
      out.set(seg.samples, write);
      write += seg.samples.length;
      return;
    }

    const join = joins[idx - 1];
    const { leftTrim, rightTrim } = join.candidate;

    // 回退左段尾部到过零点
    write -= segments[idx - 1].samples.length - leftTrim;

    const rightPart = seg.samples.subarray(rightTrim);
    const seam = write;

    if (join.useFade) {
      // 等功率交叉淡化：左段尾 fadeSamples 与右段头重叠
      for (let k = 0; k < fadeSamples; k++) {
        const t = k / fadeSamples;
        const gA = Math.cos((t * Math.PI) / 2);
        const gB = Math.sin((t * Math.PI) / 2);
        const aVal = leftTrim - fadeSamples + k >= 0
          ? segments[idx - 1].samples[leftTrim - fadeSamples + k]
          : 0;
        out[seam + k] = aVal * gA + (rightPart[k] ?? 0) * gB;
      }
      out.set(rightPart.subarray(fadeSamples), seam + fadeSamples);
      write = seam + rightPart.length; // 重叠区只占一份长度

      let maxJump = 1e-7;
      for (let k = 1; k <= fadeSamples; k++) {
        maxJump = Math.max(maxJump, Math.abs(out[seam + k] - out[seam + k - 1]));
      }
      join.finalJumpDb = ampToDb(maxJump);
    } else {
      out.set(rightPart, seam);
      write = seam + rightPart.length;
    }

    splicePoints.push({
      index: idx,
      seamSample: seam,
      rawJumpDb: join.candidate.jumpDb,
      jumpDb: join.finalJumpDb,
      localRms: join.candidate.energy,
      crossfadeMs: join.useFade ? crossfadeMs : 0,
      passed: join.finalJumpDb <= options.thresholdDb,
    });
  });

  return { audio: out.subarray(0, write).slice(), splicePoints, gapsMs };
}
