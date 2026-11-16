import JSZip from 'jszip';
import { encodeWav } from '../audio/wav';
import type { CompiledAnnouncement, LineConfig, Settings, Station } from '../types';
import { TRIGGER_LABELS } from '../audio/constants';

export interface PackageOptions {
  includeNoisePreview: boolean;
  noiseLabel?: string;
}

/** 批量出包：每条广播一个 WAV，按线路/站点归目录，附 manifest.json 与质检报告 */
export async function buildPackage(
  announcements: CompiledAnnouncement[],
  lines: LineConfig[],
  stations: Station[],
  settings: Settings,
  options: PackageOptions,
): Promise<Blob> {
  const zip = new JSZip();
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const stationById = new Map(stations.map((s) => [s.id, s]));

  const usedNames = new Set<string>();

  const manifest = announcements.map((a) => {
    const line = lineById.get(a.lineId);
    const station = stationById.get(a.stationId);
    const linePart = sanitize(line?.nameZh ?? a.lineId);
    const stationPart = sanitize(station?.nameZh ?? a.stationId);
    // 模板 id 入名，防止同站同触发多模板互相覆盖
    const base = sanitize(
      `${line?.nameZh ?? a.lineId}_${station?.nameZh ?? a.stationId}_${TRIGGER_LABELS[a.trigger]}_${a.lang}_${a.templateId}`,
    );
    let safeName = base;
    let dup = 1;
    while (usedNames.has(`${linePart}/${stationPart}/${safeName}.wav`)) {
      safeName = `${base}-${dup++}`;
    }
    const dir = `${linePart}/${stationPart}`;
    const fileName = `${dir}/${safeName}.wav`;
    usedNames.add(fileName);
    return {
      fileName,
      entry: {
        lineId: a.lineId,
        lineName: line?.nameZh,
        stationId: a.stationId,
        stationNameZh: station?.nameZh,
        stationNameEn: station?.nameEn,
        templateId: a.templateId,
        trigger: a.trigger,
        triggerLabel: TRIGGER_LABELS[a.trigger],
        lang: a.lang,
        text: a.text,
        durationSec: Number(a.duration.toFixed(3)),
        dwellSec: a.dwellSeconds,
        overDwell: a.overDwell,
        splice: {
          thresholdDb: settings.spliceJumpThresholdDb,
          allPassed: a.allSplicesPassed,
          points: a.splicePoints.map((p) => ({
            index: p.index,
            seamSample: p.seamSample,
            rawJumpDb: Number(p.rawJumpDb.toFixed(2)),
            jumpDb: Number(p.jumpDb.toFixed(2)),
            crossfadeMs: p.crossfadeMs,
            passed: p.passed,
          })),
        },
        // 每条广播带上触发条件
        triggerCondition: buildTriggerCondition(a),
        temporary: a.temporary ?? null,
        peakDbfs: Number(a.peakDbfs.toFixed(2)),
        gapsMs: a.gapsMs.map((g) => Math.round(g)),
      },
    };
  });

  for (let i = 0; i < announcements.length; i++) {
    const a = announcements[i];
    zip.file(manifest[i].fileName, encodeWav(a.audio, a.sampleRate));
  }

  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sampleRate: announcements[0]?.sampleRate ?? 24000,
        count: announcements.length,
        settings: {
          spliceJumpThresholdDb: settings.spliceJumpThresholdDb,
          crossfadeMs: settings.crossfadeMs,
          searchWindowMs: settings.searchWindowMs,
        },
        announcements: manifest.map((m) => m.entry),
      },
      null,
      2,
    ),
  );

  const overDwell = announcements.filter((a) => a.overDwell);
  const failedSplice = announcements.filter((a) => !a.allSplicesPassed);
  const report = [
    '# 报站音频出包质检报告',
    '',
    `- 生成时间：${new Date().toLocaleString()}`,
    `- 广播总数：${announcements.length}`,
    `- 拼接阈值：${settings.spliceJumpThresholdDb} dBFS`,
    `- 拼接不合格：${failedSplice.length} 条`,
    `- 超停站时间：${overDwell.length} 条`,
    '',
    '## 超标明细',
    ...(overDwell.length === 0 && failedSplice.length === 0
      ? ['无']
      : [
          ...overDwell.map(
            (a) =>
              `- [超时] ${stationById.get(a.stationId)?.nameZh} ${TRIGGER_LABELS[a.trigger]}(${a.lang})：${a.duration.toFixed(2)}s > ${a.dwellSeconds}s`,
          ),
          ...failedSplice.map((a) =>
            a.splicePoints.length
              ? `- [拼接] ${stationById.get(a.stationId)?.nameZh} ${TRIGGER_LABELS[a.trigger]}(${a.lang})：最大跳变 ${Math.max(...a.splicePoints.map((p) => p.jumpDb)).toFixed(1)} dB`
              : `- [拼接] ${stationById.get(a.stationId)?.nameZh} ${TRIGGER_LABELS[a.trigger]}(${a.lang})：无可用拼接点`,
          ),
        ]),
  ].join('\n');
  zip.file('qa-report.md', report);

  if (options.includeNoisePreview) {
    const folder = zip.folder('noise-preview');
    announcements.slice(0, 5).forEach((a, i) => {
      folder?.file(`preview-${i + 1}-${a.lang}.wav`, encodeWav(a.audio, a.sampleRate));
    });
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function buildTriggerCondition(a: CompiledAnnouncement): string {
  if (a.temporary) {
    return `临时广播｜${a.temporary.planName}｜生效 ${a.temporary.activeWindow}`;
  }
  const base: Record<string, string> = {
    arrival: '列车进站前自动触发',
    transfer: '到站播报后触发（换乘站）',
    departure: '关门起步后触发',
    terminal: '到达终点站触发',
    skip: '甩站运行时触发',
    reroute: '改线运行时触发',
  };
  return base[a.trigger] ?? a.trigger;
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_');
}
