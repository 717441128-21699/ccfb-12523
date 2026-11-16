// 全局领域类型定义

/** 单声道 PCM 采样数据（统一别名，兼容 TS7 的 ArrayBuffer 泛型约束） */
export type Pcm = Float32Array<ArrayBuffer>;

export type Lang = 'zh' | 'en';
export type Position = 'head' | 'mid' | 'tail';

/** 录音词条：同一段文本按句首/句中/句尾三种语调各录一条 */
export interface Clip {
  id: string;
  text: string;
  lang: Lang;
  position: Position;
  sampleRate: number;
  duration: number;
  samples: Pcm;
  source: 'synthetic' | 'upload';
  createdAt: number;
}

export interface Station {
  id: string;
  nameZh: string;
  nameEn: string;
  /** 可换乘的线路号 */
  transferLines: number[];
}

export interface LineConfig {
  id: string;
  lineNo: number;
  nameZh: string;
  nameEn: string;
  /** 有序站点 id */
  stationIds: string[];
  /** 与 stationIds 对齐的站间停站时间（秒），广播必须短于该值 */
  dwellSeconds: number[];
}

export type TriggerType =
  | 'arrival'
  | 'transfer'
  | 'departure'
  | 'terminal'
  | 'skip'
  | 'reroute';

export interface AnnounceTemplate {
  id: string;
  name: string;
  trigger: TriggerType;
  lang: Lang;
  /** 含 {{var}} 占位符的模板文本，变量：station / nextStation / line / transfer */
  text: string;
  enabled: boolean;
}

export interface PauseRule {
  punctuation: string;
  seconds: number;
}

export interface Settings {
  /** 拼接点瞬时电平跳变阈值 (dBFS)，实测值必须低于它 */
  spliceJumpThresholdDb: number;
  /** 超阈值时启用的等功率交叉淡化时长 ms */
  crossfadeMs: number;
  /** 拼接搜索窗（向两段音频各取多少 ms 找过零点） */
  searchWindowMs: number;
  pauseRules: PauseRule[];
  /** 无标点词条间默认停顿 ms */
  defaultGapMs: number;
  /** 满刻度对应的声压级，用于清晰度指数校准 */
  fullScaleDbSpl: number;
}

/** 单个拼接点的质检结果 */
export interface SplicePoint {
  index: number;
  /** 在成品音频中的接缝采样位置 */
  seamSample: number;
  /** 未处理的原始跳变 */
  rawJumpDb: number;
  /** 交叉淡化后的瞬时电平跳变 */
  jumpDb: number;
  /** 接缝局部能量 (RMS) */
  localRms: number;
  crossfadeMs: number;
  passed: boolean;
}

export type PlanTrigger = 'skip' | 'reroute';

/** 临时运营图（甩站 / 改线） */
export interface ScheduledPlan {
  id: string;
  name: string;
  trigger: PlanTrigger;
  lineId: string;
  stationIds: string[];
  /** ISO 时间字符串，生效时段 */
  startAt: string;
  endAt: string;
  templateId: string;
  note?: string;
  active: boolean;
}

export interface CompiledAnnouncement {
  id: string;
  lineId: string;
  stationId: string;
  templateId: string;
  trigger: TriggerType;
  lang: Lang;
  /** 变量渲染后的完整文本 */
  text: string;
  audio: Pcm;
  sampleRate: number;
  duration: number;
  splicePoints: SplicePoint[];
  gapsMs: number[];
  peakDbfs: number;
  /** 该站停站时间（秒） */
  dwellSeconds: number;
  overDwell: boolean;
  allSplicesPassed: boolean;
  temporary?: { planId: string; planName: string; activeWindow: string };
}

export interface AiBand {
  band: number;
  speechDb: number;
  noiseDb: number;
  snrDb: number;
  weight: number;
  contribution: number;
}

export interface AiResult {
  ai: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  bands: AiBand[];
  noiseLevelDb: number;
}
