import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { compileLine } from '../engine/compiler';
import { generateCarriageNoise, mixWithNoise } from '../audio/noise';
import { computeAi } from '../audio/intelligibility';
import { NOISE_PRESETS, TRIGGER_LABELS } from '../audio/constants';
import { Card, Badge, Stat, Empty } from '../components/ui';
import { Waveform } from '../components/Waveform';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import type { CompiledAnnouncement } from '../types';

export function AuditPage() {
  const { stations, lines, templates, settings, plans } = useStore();
  const line = lines[0];
  const player = useAudioPlayer();

  const [langFilter, setLangFilter] = useState<'all' | 'zh' | 'en'>('all');
  const [noisePreset, setNoisePreset] = useState<(typeof NOISE_PRESETS)[number]['id']>('normal');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { announcements, failures } = useMemo(
    () => compileLine(line, stations, templates, settings, plans),
    [line, stations, templates, settings, plans],
  );

  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const preset = NOISE_PRESETS.find((p) => p.id === noisePreset)!;

  const filtered = announcements.filter(
    (a) => (langFilter === 'all' || a.lang === langFilter) && (!onlyProblems || a.overDwell || !a.allSplicesPassed),
  );

  const selected = announcements.find((a) => a.id === selectedId) ?? filtered[0] ?? null;

  const noise = useMemo(
    () =>
      selected
        ? generateCarriageNoise(selected.duration + 0.5, preset.levelDb, settings.fullScaleDbSpl)
        : new Float32Array(0),
    [selected?.id, preset.levelDb, settings.fullScaleDbSpl], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const mixed = useMemo(
    () => (selected ? mixWithNoise(selected.audio, noise) : new Float32Array(0)),
    [selected?.id, noise], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const ai = useMemo(
    () =>
      selected
        ? computeAi(selected.audio, noise, selected.sampleRate, settings.fullScaleDbSpl, preset.levelDb)
        : null,
    [selected?.id, noise, settings.fullScaleDbSpl], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const overCount = announcements.filter((a) => a.overDwell).length;
  const spliceFailCount = announcements.filter((a) => !a.allSplicesPassed).length;

  const playTarget = (a: CompiledAnnouncement, withNoise: boolean) => {
    const buf = withNoise ? mixWithNoise(a.audio, generateCarriageNoise(a.duration + 0.5, preset.levelDb, settings.fullScaleDbSpl)) : a.audio;
    if (player.isPlaying(a.id + (withNoise ? ':noise' : ''))) player.stop();
    else player.play(a.id + (withNoise ? ':noise' : ''), buf);
  };

  return (
    <div>
      <div className="page-head">
        <h2>试听审核</h2>
        <p>
          全线编译后逐条审核：超过两站间停站时间的广播整行标红；拼接点瞬时电平跳变与阈值比对；可叠加车厢噪声模型试听并计算语音清晰度指数（AI）。
        </p>
      </div>

      <div className="grid-4">
        <Stat label="广播总数" value={announcements.length} />
        <Stat label="超停站时间" value={overCount} tone={overCount ? 'bad' : 'ok'} />
        <Stat label="拼接不合格" value={spliceFailCount} tone={spliceFailCount ? 'bad' : 'ok'} />
        <Stat
          label="临时广播"
          value={announcements.filter((a) => a.temporary).length}
          tone={announcements.some((a) => a.temporary) ? 'warn' : undefined}
        />
      </div>

      <Card
        title="审核列表"
        extra={
          <div className="toolbar" style={{ margin: 0 }}>
            <div className="pill-group">
              {(['all', 'zh', 'en'] as const).map((l) => (
                <button key={l} className={langFilter === l ? 'on' : ''} onClick={() => setLangFilter(l)}>
                  {l === 'all' ? '全部' : l === 'zh' ? '中文' : 'EN'}
                </button>
              ))}
            </div>
            <label className="checkline" style={{ margin: 0 }}>
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
              只看问题项
            </label>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <Empty text="没有符合条件的广播" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>站点</th>
                  <th>场景</th>
                  <th>语言</th>
                  <th>广播文本</th>
                  <th>时长 / 停站</th>
                  <th>拼接最大跳变</th>
                  <th>试听</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const st = stationById.get(a.stationId);
                  const maxJump = a.splicePoints.length
                    ? Math.max(...a.splicePoints.map((p) => p.jumpDb))
                    : null;
                  return (
                    <tr
                      key={a.id}
                      className={a.overDwell ? 'row-over' : ''}
                      onClick={() => setSelectedId(a.id)}
                      style={{ cursor: 'pointer', background: selected?.id === a.id ? 'rgba(76,154,255,0.08)' : undefined }}
                    >
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {st?.nameZh}
                        {a.temporary && (
                          <div>
                            <Badge tone="warn">临时</Badge>
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge tone="info">{TRIGGER_LABELS[a.trigger]}</Badge>
                      </td>
                      <td>{a.lang === 'zh' ? '中' : 'EN'}</td>
                      <td style={{ maxWidth: 320 }}>
                        <span className={a.overDwell ? 'text-bad' : ''}>{a.text}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={a.overDwell ? 'text-bad' : 'mono'}>
                          {a.duration.toFixed(2)}s / {a.dwellSeconds}s
                        </span>
                        {a.overDwell && <div className="text-bad" style={{ fontSize: 12 }}>超 {(a.duration - a.dwellSeconds).toFixed(1)}s</div>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {maxJump === null ? (
                          <span className="text-dim">单词条</span>
                        ) : (
                          <Badge tone={a.allSplicesPassed ? 'ok' : 'bad'}>
                            {maxJump.toFixed(1)} dB
                          </Badge>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className="mini-btn" onClick={() => playTarget(a, false)}>
                          原声
                        </button>
                        <button className="mini-btn" style={{ marginLeft: 6 }} onClick={() => playTarget(a, true)}>
                          叠噪
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {failures.length > 0 && (
          <p className="text-bad" style={{ marginTop: 10 }}>
            编译失败 {failures.length} 条：{failures.map((f) => `${f.stationId}/${f.templateId}`).join('，')}
          </p>
        )}
      </Card>

      {selected && ai && (
        <div className="grid-2">
          <Card title={`波形与拼接点 · ${stationById.get(selected.stationId)?.nameZh} · ${TRIGGER_LABELS[selected.trigger]}`}>
            <Waveform
              samples={selected.audio}
              splicePoints={selected.splicePoints}
              thresholdDb={settings.spliceJumpThresholdDb}
              progress={player.isPlaying(selected.id) ? player.progress : undefined}
              height={110}
            />
            <div className="toolbar">
              <button className="primary" onClick={() => playTarget(selected, false)}>
                ▶ 原声试听
              </button>
              <button onClick={() => playTarget(selected, true)}>▶ 叠加{preset.label}试听</button>
              {player.playingId && <button className="ghost" onClick={player.stop}>■ 停止</button>}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>原始跳变 dB</th>
                    <th>处理后跳变 dB</th>
                    <th>淡化 ms</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.splicePoints.map((p) => (
                    <tr key={p.index}>
                      <td className="mono">{p.index}</td>
                      <td className="mono">{p.rawJumpDb.toFixed(2)}</td>
                      <td className="mono">{p.jumpDb.toFixed(2)}</td>
                      <td className="mono">{p.crossfadeMs || '—'}</td>
                      <td>
                        <Badge tone={p.passed ? 'ok' : 'bad'}>{p.passed ? '合格' : '超阈值'}</Badge>
                      </td>
                    </tr>
                  ))}
                  {selected.splicePoints.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-dim">
                        单词条广播，无拼接点
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-dim" style={{ fontSize: 12 }}>
              峰值 {selected.peakDbfs.toFixed(1)} dBFS；句间停顿 {selected.gapsMs.map((g) => `${Math.round(g)}ms`).join('、') || '无'}
              {selected.temporary && `；生效时段 ${selected.temporary.activeWindow}`}
            </p>
          </Card>

          <Card
            title="车厢噪声模型与语音清晰度指数"
            extra={
              <select
                style={{ width: 200 }}
                value={noisePreset}
                onChange={(e) => setNoisePreset(e.target.value as typeof noisePreset)}
              >
                {NOISE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}（{p.levelDb} dBA）
                  </option>
                ))}
              </select>
            }
          >
            <div className="grid-2">
              <div className="ai-gauge">
                <svg width="132" height="132" viewBox="0 0 132 132">
                  <circle cx="66" cy="66" r="56" fill="none" stroke="var(--bg)" strokeWidth="12" />
                  <circle
                    cx="66"
                    cy="66"
                    r="56"
                    fill="none"
                    stroke={
                      ai.rating === 'excellent'
                        ? 'var(--ok)'
                        : ai.rating === 'good'
                          ? '#7bc043'
                          : ai.rating === 'fair'
                            ? 'var(--warn)'
                            : 'var(--bad)'
                    }
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 56 * ai.ai} ${2 * Math.PI * 56}`}
                  />
                </svg>
                <div className="center">
                  <div className="ai-num">{ai.ai.toFixed(2)}</div>
                  <div className="stat-label">
                    AI · {ai.rating === 'excellent' ? '优' : ai.rating === 'good' ? '良' : ai.rating === 'fair' ? '一般' : '差'}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-dim" style={{ fontSize: 12, marginTop: 0 }}>
                  简化 ANSI S3.5 倍频程法，250Hz–4kHz 五带加权；噪声 {preset.levelDb} dBA，满刻度 {settings.fullScaleDbSpl} dB SPL。
                </p>
                {ai.bands.map((b) => {
                  const norm = Math.max(0, Math.min(1, (b.snrDb + 12) / 42));
                  return (
                    <div key={b.band} className="band-bar">
                      <span className="band-label mono">{b.band}Hz</span>
                      <span className="band-track">
                        <span
                          className="band-fill"
                          style={{
                            width: `${norm * 100}%`,
                            background: norm > 0.6 ? 'var(--ok)' : norm > 0.35 ? 'var(--warn)' : 'var(--bad)',
                          }}
                        />
                      </span>
                      <span className="mono text-dim" style={{ width: 74 }}>
                        SNR {b.snrDb.toFixed(0)}dB
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <Waveform samples={mixed} height={80} color="#f5a623" />
            <p className="text-dim" style={{ fontSize: 12, marginBottom: 0 }}>
              上图为语音与车厢噪声混合后的波形，仅用于试听评估，不写入出包音频。
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
