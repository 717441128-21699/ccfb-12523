import { SAMPLE_RATE } from '../audio/constants';
import { clipRegistry } from '../audio/registry';
import { joinClips, type ClipSegment } from '../audio/splice';
import { peakDb } from '../audio/filters';
import type {
  AnnounceTemplate,
  CompiledAnnouncement,
  Lang,
  LineConfig,
  Position,
  ScheduledPlan,
  Settings,
  Station,
  TriggerType,
} from '../types';

/* ---------------- 模板分词 ---------------- */

type Token =
  | { kind: 'phrase'; text: string }
  | { kind: 'punct'; text: string }
  | { kind: 'var'; name: string };

const TEMPLATE_VAR_RE = /\{\{\s*(station|nextStation|line|transfer)\s*\}\}/g;
const PUNCT_RE = /[，。、？！；,.?!;：:（）()]/;

/** 模板 -> 短语 / 标点 / 变量 token 序列 */
export function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of template.matchAll(TEMPLATE_VAR_RE)) {
    if (m.index! > last) pushLiteral(tokens, template.slice(last, m.index));
    tokens.push({ kind: 'var', name: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < template.length) pushLiteral(tokens, template.slice(last));
  return tokens;
}

function pushLiteral(tokens: Token[], literal: string): void {
  let buf = '';
  for (const ch of Array.from(literal)) {
    if (PUNCT_RE.test(ch)) {
      if (buf.trim()) {
        tokens.push({ kind: 'phrase', text: buf.trim() });
        buf = '';
      }
      tokens.push({ kind: 'punct', text: ch });
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) tokens.push({ kind: 'phrase', text: buf.trim() });
}

/* ---------------- 变量渲染 ---------------- */

export interface RenderVars {
  station?: Station;
  nextStation?: Station;
  line?: LineConfig;
  transferLineNo?: number;
}

function varText(name: string, vars: RenderVars, lang: Lang): string {
  switch (name) {
    case 'station':
      return lang === 'zh' ? vars.station!.nameZh : vars.station!.nameEn;
    case 'nextStation':
      return lang === 'zh' ? vars.nextStation!.nameZh : vars.nextStation!.nameEn;
    case 'line':
      return lang === 'zh' ? lineNameZh(vars.transferLineNo ?? vars.line!.lineNo) : `Line ${vars.transferLineNo ?? vars.line!.lineNo}`;
    case 'transfer':
      return String(vars.transferLineNo ?? '');
    default:
      return '';
  }
}

export function lineNameZh(lineNo: number): string {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (lineNo < 10) return `${digits[lineNo]}号线`;
  if (lineNo === 10) return '十号线';
  if (lineNo < 20) return `十${digits[lineNo - 10]}号线`;
  const tens = Math.floor(lineNo / 10);
  const ones = lineNo % 10;
  return `${digits[tens]}十${ones ? digits[ones] : ''}号线`;
}

/** 变量在句中的位置决定取哪条语调词条 */
function positionForVar(tokens: Token[], index: number): Position {
  let hasBefore = false;
  for (let i = 0; i < index; i++) {
    if (tokens[i].kind !== 'punct') {
      hasBefore = true;
      break;
    }
  }
  let hasAfter = false;
  for (let i = index + 1; i < tokens.length; i++) {
    if (tokens[i].kind !== 'punct') {
      hasAfter = true;
      break;
    }
  }
  if (!hasBefore) return 'head';
  if (!hasAfter) return 'tail';
  return 'mid';
}

/* ---------------- 单条编译 ---------------- */

export interface CompileArgs {
  template: AnnounceTemplate;
  line: LineConfig;
  station: Station;
  settings: Settings;
  vars: RenderVars;
  temporary?: CompiledAnnouncement['temporary'];
}

export function renderTemplateText(template: AnnounceTemplate, vars: RenderVars): string {
  return template.text.replace(TEMPLATE_VAR_RE, (_, name: string) =>
    varText(name, vars, template.lang),
  );
}

export function compileAnnouncement(args: CompileArgs): CompiledAnnouncement {
  const { template, line, station, settings, vars } = args;
  const lang: Lang = template.lang;
  const tokens = tokenize(template.text);
  const segments: ClipSegment[] = [];
  const gapByPunct = new Map(settings.pauseRules.map((r) => [r.punctuation, r.seconds]));

  let pendingGap = 0;
  let trailingGap = 0;
  let rendered = '';

  tokens.forEach((tok, idx) => {
    if (tok.kind === 'punct') {
      rendered += tok.text;
      pendingGap = (gapByPunct.get(tok.text) ?? settings.defaultGapMs / 1000) * SAMPLE_RATE;
      // 句末标点：后面没有词条时，停顿以整条尾部静音落地
      if (idx === tokens.length - 1) trailingGap = pendingGap;
      return;
    }

    let text: string;
    let position: Position;
    if (tok.kind === 'var') {
      text = varText(tok.name, vars, lang);
      position = positionForVar(tokens, idx);
      // 线路类变量只有一条 mid 词条
      if (tok.name === 'line' || tok.name === 'transfer') position = 'mid';
    } else {
      text = tok.text;
      position = positionForVar(tokens, idx);
    }
    rendered += text;

    const clip = clipRegistry.ensure(text, lang, position);
    segments.push({
      samples: clip.samples,
      gapBefore: Math.round(pendingGap),
      label: text,
    });
    pendingGap = (settings.defaultGapMs / 1000) * SAMPLE_RATE;
  });

  const joined = joinClips(segments, {
    thresholdDb: settings.spliceJumpThresholdDb,
    crossfadeMs: settings.crossfadeMs,
    searchWindowMs: settings.searchWindowMs,
  });

  // 句末标点停顿：尾部补静音
  let audio = joined.audio;
  if (trailingGap > 0) {
    const withTail = new Float32Array(audio.length + Math.round(trailingGap));
    withTail.set(audio, 0);
    audio = withTail;
    joined.gapsMs.push((trailingGap / SAMPLE_RATE) * 1000);
  }

  const duration = audio.length / SAMPLE_RATE;
  const stationIndex = line.stationIds.indexOf(station.id);
  const dwellSeconds = line.dwellSeconds[stationIndex] ?? line.dwellSeconds[line.dwellSeconds.length - 1] ?? 30;

  return {
    id: `${template.id}:${station.id}:${lang}`,
    lineId: line.id,
    stationId: station.id,
    templateId: template.id,
    trigger: template.trigger,
    lang,
    text: rendered,
    audio,
    sampleRate: SAMPLE_RATE,
    duration,
    splicePoints: joined.splicePoints,
    gapsMs: joined.gapsMs,
    peakDbfs: peakDb(joined.audio),
    dwellSeconds,
    overDwell: duration > dwellSeconds,
    allSplicesPassed: joined.splicePoints.every((p) => p.passed),
    temporary: args.temporary,
  };
}

/* ---------------- 全线批量编译 ---------------- */

export interface CompileLineResult {
  announcements: CompiledAnnouncement[];
  failures: { stationId: string; templateId: string; reason: string }[];
}

/** 为一条线路的每个站编译全部启用模板（中英文两套），含临时甩站/改线 */
export function compileLine(
  line: LineConfig,
  stations: Station[],
  templates: AnnounceTemplate[],
  settings: Settings,
  plans: ScheduledPlan[] = [],
): CompileLineResult {
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const announcements: CompiledAnnouncement[] = [];
  const failures: CompileLineResult['failures'] = [];

  const enabled = templates.filter((t) => t.enabled);

  line.stationIds.forEach((sid, idx) => {
    const station = stationById.get(sid);
    if (!station) return;
    const nextStation = line.stationIds[idx + 1]
      ? stationById.get(line.stationIds[idx + 1])
      : undefined;

    const triggers = new Set<TriggerType>(['arrival', 'departure', 'terminal']);
    if (station.transferLines.length) triggers.add('transfer');

    for (const tpl of enabled) {
      if (!triggers.has(tpl.trigger)) continue;
      if (tpl.trigger === 'terminal' && idx !== line.stationIds.length - 1) continue;
      if (tpl.trigger === 'departure' && !nextStation) continue;
      try {
        const transferLineNo = station.transferLines[0];
        announcements.push(
          compileAnnouncement({
            template: tpl,
            line,
            station,
            settings,
            vars: { station, nextStation, line, transferLineNo },
          }),
        );
      } catch (e) {
        failures.push({ stationId: sid, templateId: tpl.id, reason: (e as Error).message });
      }
    }
  });

  // 临时运营图：甩站 / 改线
  const nowIso = new Date().toISOString();
  for (const plan of plans) {
    if (!plan.active || plan.lineId !== line.id) continue;
    if (plan.endAt < nowIso) continue;
    const tpl = enabled.find((t) => t.id === plan.templateId);
    if (!tpl) continue;
    for (const sid of plan.stationIds) {
      const station = stationById.get(sid);
      if (!station) continue;
      const activeWindow = `${plan.startAt.replace('T', ' ').slice(0, 16)} ～ ${plan.endAt.replace('T', ' ').slice(0, 16)}`;
      try {
        announcements.push(
          compileAnnouncement({
            template: tpl,
            line,
            station,
            settings,
            vars: { station, line },
            temporary: { planId: plan.id, planName: plan.name, activeWindow },
          }),
        );
      } catch (e) {
        failures.push({ stationId: sid, templateId: tpl.id, reason: (e as Error).message });
      }
    }
  }

  return { announcements, failures };
}
