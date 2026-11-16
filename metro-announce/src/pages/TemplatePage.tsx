import { useMemo, useState } from 'react';
import { useStore, newId } from '../store/useStore';
import { Card, Badge } from '../components/ui';
import { useToast } from '../components/Toast';
import { tokenize, renderTemplateText, compileAnnouncement } from '../engine/compiler';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { Waveform } from '../components/Waveform';
import { TRIGGER_LABELS, POSITION_LABELS } from '../audio/constants';
import type { AnnounceTemplate, Lang, TriggerType } from '../types';

const TRIGGERS: TriggerType[] = ['arrival', 'transfer', 'departure', 'terminal', 'skip', 'reroute'];
const VARS = ['station', 'nextStation', 'line', 'transfer'];

export function TemplatePage() {
  const { templates, stations, lines, settings, addTemplate, updateTemplate, removeTemplate } = useStore();
  const toast = useToast((s) => s.push);
  const player = useAudioPlayer();
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '');
  const [draftText, setDraftText] = useState('');
  const [editing, setEditing] = useState<AnnounceTemplate | null>(null);

  const line = lines[0];
  const station = stations[2] ?? stations[0];
  const nextStation = stations[3];
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const tokens = useMemo(() => (selected ? tokenize(selected.text) : []), [selected]);
  const rendered = selected
    ? renderTemplateText(selected, { station, nextStation, line, transferLineNo: station?.transferLines[0] })
    : '';

  const preview = useMemo(() => {
    if (!selected || !station) return null;
    try {
      return compileAnnouncement({
        template: selected,
        line,
        station,
        settings,
        vars: { station, nextStation, line, transferLineNo: station.transferLines[0] },
      });
    } catch (e) {
      toast((e as Error).message, 'bad');
      return null;
    }
  }, [selected, station, settings, line, nextStation]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEditor = (t: AnnounceTemplate | null) => {
    setEditing(t);
    if (t) setDraftText(t.text);
    else setDraftText('');
  };

  const saveTemplate = (patch: Partial<AnnounceTemplate>) => {
    if (!editing) return;
    updateTemplate(editing.id, patch);
    toast('模板已保存', 'ok');
  };

  return (
    <div>
      <div className="page-head">
        <h2>模板编排</h2>
        <p>
          用 {'{{变量}}'} 拼出整句，支持 station / nextStation / line / transfer 四个变量，中英文各一套；变量按在句中的位置自动挑选句首/句中/句尾语调词条。
        </p>
      </div>

      <div className="grid-2">
        <Card title="模板列表">
          <div className="table-wrap">
            <table>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    style={{ cursor: 'pointer', background: t.id === selectedId ? 'rgba(76,154,255,0.08)' : undefined }}
                  >
                    <td>
                      <div className="clip-text">{t.name}</div>
                      <div className="clip-meta mono">{t.text}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Badge tone="info">{TRIGGER_LABELS[t.trigger]}</Badge>
                      <div style={{ marginTop: 4 }}>
                        <Badge tone="neutral">{t.lang === 'zh' ? '中' : 'EN'}</Badge>{' '}
                        {t.enabled ? <Badge tone="ok">启用</Badge> : <Badge tone="warn">停用</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="primary"
            style={{ marginTop: 12 }}
            onClick={() => {
              const t: AnnounceTemplate = {
                id: newId('tpl'),
                name: '新模板',
                trigger: 'arrival',
                lang: 'zh',
                text: '前方到站，{{station}}。',
                enabled: true,
              };
              addTemplate(t);
              setSelectedId(t.id);
              openEditor(t);
            }}
          >
            + 新建模板
          </button>
        </Card>

        <div>
          {selected && (
            <>
              <Card
                title={selected.name}
                extra={
                  <div className="toolbar" style={{ margin: 0 }}>
                    <button className="mini-btn" onClick={() => openEditor(selected)}>
                      编辑
                    </button>
                    <button
                      className="mini-btn"
                      onClick={() => updateTemplate(selected.id, { enabled: !selected.enabled })}
                    >
                      {selected.enabled ? '停用' : '启用'}
                    </button>
                    <button
                      className="mini-btn danger"
                      onClick={() => {
                        if (confirm('删除该模板？')) {
                          removeTemplate(selected.id);
                          setSelectedId(templates.find((t) => t.id !== selected.id)?.id ?? '');
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                }
              >
                <div className="template-text">
                  {tokens.map((tok, i) =>
                    tok.kind === 'var' ? (
                      <span key={i} className="token-chip">
                        {`{{${tok.name}}}`}
                      </span>
                    ) : tok.kind === 'punct' ? (
                      <span key={i} className="token-punct">
                        {tok.text}
                      </span>
                    ) : (
                      <span key={i}>{tok.text}</span>
                    ),
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <span className="text-dim" style={{ fontSize: 12 }}>
                    渲染预览（示例站：{station?.nameZh}）：
                  </span>
                  <div>{rendered}</div>
                </div>
              </Card>

              <Card title="分词与语调选择">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>类型</th>
                        <th>词条文本</th>
                        <th>选取语调</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokens
                        .filter((t) => t.kind !== 'punct')
                        .map((tok, i) => {
                          const text =
                            tok.kind === 'var'
                              ? (() => {
                                  const v = renderTemplateText(
                                    { ...selected, text: `{{${tok.name}}}` },
                                    { station, nextStation, line, transferLineNo: station?.transferLines[0] },
                                  );
                                  return v;
                                })()
                              : tok.kind === 'phrase'
                                ? tok.text
                                : '';
                          const isLineVar = tok.kind === 'var' && (tok.name === 'line' || tok.name === 'transfer');
                          const pos = isLineVar
                            ? 'mid'
                            : (() => {
                                const idx = tokens.indexOf(tok);
                                let before = false;
                                let after = false;
                                tokens.forEach((x, j) => {
                                  if (x.kind === 'punct') return;
                                  if (j < idx) before = true;
                                  if (j > idx) after = true;
                                });
                                return !before ? 'head' : !after ? 'tail' : 'mid';
                              })();
                          return (
                            <tr key={i}>
                              <td className="mono text-dim">{i + 1}</td>
                              <td>
                                <Badge tone={tok.kind === 'var' ? 'info' : 'neutral'}>
                                  {tok.kind === 'var' ? '变量' : '短语'}
                                </Badge>
                              </td>
                              <td>{text}</td>
                              <td>
                                <Badge tone={pos === 'head' ? 'info' : pos === 'tail' ? 'warn' : 'neutral'}>
                                  {POSITION_LABELS[pos]}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {preview && (
                <Card
                  title={`试拼结果 · ${preview.duration.toFixed(2)}s（停站 ${preview.dwellSeconds}s）`}
                  extra={
                    preview.overDwell ? <Badge tone="bad">超时标红</Badge> : <Badge tone="ok">时长合格</Badge>
                  }
                >
                  <Waveform
                    samples={preview.audio}
                    splicePoints={preview.splicePoints}
                    thresholdDb={settings.spliceJumpThresholdDb}
                    progress={player.isPlaying(preview.id) ? player.progress : undefined}
                  />
                  <div className="toolbar" style={{ marginTop: 10 }}>
                    <button
                      className="primary"
                      onClick={() =>
                        player.isPlaying(preview.id)
                          ? player.stop()
                          : player.play(preview.id, preview.audio)
                      }
                    >
                      {player.isPlaying(preview.id) ? '■ 停止' : '▶ 试听拼接'}
                    </button>
                    <span className="text-dim" style={{ fontSize: 12 }}>
                      {preview.splicePoints.length} 个拼接点，最大跳变{' '}
                      <b className={preview.allSplicesPassed ? '' : 'text-bad'}>
                        {preview.splicePoints.length
                          ? Math.max(...preview.splicePoints.map((p) => p.jumpDb)).toFixed(1)
                          : '—'}{' '}
                        dB
                      </b>
                      ，阈值 {settings.spliceJumpThresholdDb} dB
                    </span>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>编辑模板</h3>
              <button className="ghost" onClick={() => setEditing(null)}>
                关闭
              </button>
            </div>
            <label className="field">
              <span>模板名称</span>
              <input value={editing.name} onChange={(e) => saveTemplate({ name: e.target.value })} />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>触发场景</span>
                <select value={editing.trigger} onChange={(e) => saveTemplate({ trigger: e.target.value as TriggerType })}>
                  {TRIGGERS.map((t) => (
                    <option key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>语言</span>
                <select value={editing.lang} onChange={(e) => saveTemplate({ lang: e.target.value as Lang })}>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>模板正文（点击插入变量）</span>
              <textarea rows={4} value={draftText} onChange={(e) => setDraftText(e.target.value)} />
            </label>
            <div className="pill-group">
              {VARS.map((v) => (
                <button key={v} className="mini-btn" onClick={() => setDraftText((d) => `${d}{{${v}}}`)}>
                  {`{{${v}}}`}
                </button>
              ))}
              <span className="text-dim" style={{ fontSize: 12, alignSelf: 'center' }}>
                句间停顿按标点规则自动生成，见工程设置
              </span>
            </div>
            <div className="modal-foot">
              <button onClick={() => setEditing(null)}>取消</button>
              <button
                className="primary"
                onClick={() => {
                  saveTemplate({ text: draftText });
                  setEditing(null);
                  toast('正文已更新，可在右侧试拼', 'ok');
                }}
              >
                保存正文
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
