import { SAMPLE_RATE } from './constants';
import type { Lang, Position, Pcm } from '../types';

/**
 * 假词条生成器：用语调包络 + 谐波元音 + 类辅音噪声合成"伪语音"。
 * 句首升调、句中平调、句尾降调，三种语调可被听辨区分；
 * 首尾做 fade 并对齐到过零点，保证后续拼接搜索有零点可用。
 */

export interface SynthOptions {
  text: string;
  lang: Lang;
  position: Position;
  sampleRate?: number;
}

interface Unit {
  syllable: string;
  isPunct: boolean;
  duration: number;
}

const ZH_PUNCT = /[，。、？！；,.?!;：:（）()]/;
const EN_PUNCT = /[,.?!;:"()]/;

function splitUnits(text: string, lang: Lang): Unit[] {
  const units: Unit[] = [];
  if (lang === 'zh') {
    const chars = Array.from(text.replace(/\s+/g, ''));
    for (const ch of chars) {
      if (ZH_PUNCT.test(ch)) {
        units.push({ syllable: ch, isPunct: true, duration: 0 });
      } else {
        units.push({ syllable: ch, isPunct: false, duration: 0.19 + hash01(ch) * 0.07 });
      }
    }
  } else {
    const words = text.replace(/([,.?!;:"()])/g, ' $1 ').trim().split(/\s+/).filter(Boolean);
    for (const w of words) {
      if (EN_PUNCT.test(w)) {
        units.push({ syllable: w, isPunct: true, duration: 0 });
      } else {
        // 按音节数粗估时长
        const syllables = Math.max(1, (w.replace(/e$/, '').match(/[aeiouy]+/gi) || []).length);
        units.push({ syllable: w, isPunct: false, duration: 0.09 * syllables + 0.11 + hash01(w) * 0.04 });
      }
    }
  }
  return units;
}

export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const POSITION_PROSODY: Record<Position, { f0: number; contour: number; rate: number }> = {
  // 句首：基频略高、升调、节奏正常
  head: { f0: 168, contour: 26, rate: 1.0 },
  // 句中：基频居中、平调、稍快
  mid: { f0: 148, contour: 0, rate: 0.96 },
  // 句尾：基频低、降调、略慢并拉长
  tail: { f0: 132, contour: -30, rate: 1.08 },
};

const VOWEL_HARMONICS = [1, 2, 3, 4, 5, 6];
const HARMONIC_GAIN = [1, 0.55, 0.34, 0.2, 0.11, 0.06];

/** 合成一条假词条，返回单声道 PCM，首尾自然过零 */
export function synthesizeClip(opts: SynthOptions): Pcm {
  const sr = opts.sampleRate ?? SAMPLE_RATE;
  const units = splitUnits(opts.text, opts.lang);
  const prosody = POSITION_PROSODY[opts.position];
  const interUnit = (opts.lang === 'zh' ? 0.045 : 0.07) / prosody.rate;
  const headPad = Math.round(0.03 * sr);
  const tailPad = Math.round((opts.position === 'tail' ? 0.085 : 0.05) * sr);

  const voiced: { start: number; end: number; f0At: (t: number) => number; seed: number }[] = [];
  const noiseBursts: { start: number; end: number; seed: number }[] = [];

  let cursor = headPad;
  units.filter((u) => !u.isPunct).forEach((u, idx) => {
    const dur = u.duration / prosody.rate;
    const n = Math.round(dur * sr);
    const start = cursor;
    const end = cursor + n;
    // 全局语调轮廓作用在整条上（相对位置）
    const totalVoiced = units.filter((x) => !x.isPunct).length;
    const localPos = totalVoiced <= 1 ? 0.5 : idx / (totalVoiced - 1);
    const globalF0 = prosody.f0 + prosody.contour * localPos;
    const seed = hash01(u.syllable);
    voiced.push({
      start,
      end,
      seed,
      f0At: (t: number) => {
        const local = (t - start) / Math.max(1, end - start);
        // 词内轻微拱形 + 微颤音
        const arch = Math.sin(local * Math.PI) * 7;
        const vibrato = 2.2 * Math.sin(2 * Math.PI * 5.2 * (t / sr));
        return globalF0 + arch + vibrato;
      },
    });
    // 类辅音：词首一小段气流噪声
    const cn = Math.round(n * 0.18);
    noiseBursts.push({ start, end: start + cn, seed });
    cursor = end + Math.round(interUnit * sr);
  });

  const total = cursor + tailPad;
  const out = new Float32Array(total);
  const phaseStep: Record<number, number> = {};

  for (const v of voiced) {
    const attack = Math.round(0.025 * sr);
    const release = Math.round(0.04 * sr);
    for (let i = v.start; i < v.end; i++) {
      const t = i - v.start;
      const f0 = v.f0At(i);
      let s = 0;
      for (let h = 0; h < VOWEL_HARMONICS.length; h++) {
        const k = VOWEL_HARMONICS[h];
        const key = k;
        phaseStep[key] = (phaseStep[key] ?? 0) + (2 * Math.PI * f0 * k) / sr;
        // 每个词条固定的共振峰偏移，让不同词听起来不一样
        const formant = 0.75 + 0.5 * Math.sin(v.seed * 17 + k * 1.7);
        s += HARMONIC_GAIN[h] * formant * Math.sin(phaseStep[key] + v.seed * 9.7 * k);
      }
      const env =
        Math.min(1, t / attack) * Math.min(1, (v.end - i) / release);
      out[i] += 0.22 * env * s;
    }
  }

  for (const nb of noiseBursts) {
    let lcg = Math.floor(nb.seed * 1e9) + 1;
    for (let i = nb.start; i < nb.end; i++) {
      lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
      const white = (lcg / 0xffffffff) * 2 - 1;
      const local = (i - nb.start) / Math.max(1, nb.end - nb.start);
      out[i] += 0.05 * white * Math.sin(local * Math.PI);
    }
  }

  // 整体淡入淡出，避免边界爆音
  const fade = Math.round(0.012 * sr);
  for (let i = 0; i < fade && i < total; i++) {
    out[i] *= i / fade;
    out[total - 1 - i] *= i / fade;
  }
  snapToZero(out, 0, fade);
  snapToZero(out, total - fade, total, true);
  return out;
}

/** 把边界附近的样本微调（线性推到零点），保证端点精确为 0 */
function snapToZero(buf: Pcm, from: number, to: number, reverse = false): void {
  const range = Math.abs(to - from);
  for (let i = 0; i < range; i++) {
    const idx = reverse ? to - 1 - i : from + i;
    const k = reverse ? i / range : 1 - i / range;
    buf[idx] *= k;
  }
}
