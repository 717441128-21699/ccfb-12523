import type { PauseRule } from '../types';

export const SAMPLE_RATE = 24000;

/** 拼接点瞬时电平跳变默认阈值 (dBFS)：实测跳变必须低于此值 */
export const DEFAULT_SPLICE_JUMP_THRESHOLD_DB = -40;
export const DEFAULT_CROSSFADE_MS = 6;
export const DEFAULT_SEARCH_WINDOW_MS = 30;
export const DEFAULT_GAP_MS = 120;

/** 句间停顿时长按标点规则走 */
export const DEFAULT_PAUSE_RULES: PauseRule[] = [
  { punctuation: '。', seconds: 0.45 },
  { punctuation: '，', seconds: 0.25 },
  { punctuation: '、', seconds: 0.18 },
  { punctuation: '？', seconds: 0.35 },
  { punctuation: '！', seconds: 0.35 },
  { punctuation: '；', seconds: 0.3 },
  { punctuation: '.', seconds: 0.4 },
  { punctuation: ',', seconds: 0.22 },
  { punctuation: '?', seconds: 0.35 },
  { punctuation: '!', seconds: 0.35 },
  { punctuation: ';', seconds: 0.28 },
];

/** 车厢噪声模型预设（dBA），频谱偏低频隆隆声 */
export const NOISE_PRESETS = [
  { id: 'quiet', label: '低峰 · 安静车厢', levelDb: 62 },
  { id: 'normal', label: '平峰 · 正常运行', levelDb: 68 },
  { id: 'rush', label: '高峰 · 拥挤嘈杂', levelDb: 75 },
] as const;

/** 各倍频程中心频率相对增益 (dB)，模拟轮轨/空调低频能量集中 */
export const CARRIAGE_BAND_GAINS_DB: Record<number, number> = {
  125: 8,
  250: 6,
  500: 2,
  1000: -2,
  2000: -8,
  4000: -14,
  8000: -20,
};

/** 清晰度指数（简化 ANSI S3.5）倍频程权重，250Hz–4kHz 权重和为 1 */
export const AI_BANDS: { center: number; weight: number }[] = [
  { center: 250, weight: 0.1 },
  { center: 500, weight: 0.26 },
  { center: 1000, weight: 0.32 },
  { center: 2000, weight: 0.2 },
  { center: 4000, weight: 0.12 },
];

export const AI_RATINGS = {
  excellent: { min: 0.6, label: '优', color: '#2fbf71' },
  good: { min: 0.45, label: '良', color: '#7bc043' },
  fair: { min: 0.3, label: '一般', color: '#f5a623' },
  poor: { min: 0, label: '差', color: '#e05252' },
} as const;

export const TRIGGER_LABELS: Record<string, string> = {
  arrival: '到站',
  transfer: '换乘',
  departure: '起步出站',
  terminal: '终点站',
  skip: '甩站通过',
  reroute: '临时改线',
};

export const POSITION_LABELS = {
  head: '句首',
  mid: '句中',
  tail: '句尾',
} as const;
