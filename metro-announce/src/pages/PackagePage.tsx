import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { compileLine } from '../engine/compiler';
import { buildPackage } from '../engine/packager';
import { Card, Badge, Stat, Empty } from '../components/ui';
import { useToast } from '../components/Toast';
import { TRIGGER_LABELS } from '../audio/constants';

export function PackagePage() {
  const { stations, lines, templates, settings, plans } = useStore();
  const toast = useToast((s) => s.push);
  const [langFilter, setLangFilter] = useState<'all' | 'zh' | 'en'>('all');
  const [includeProblems, setIncludeProblems] = useState(false);
  const [packaging, setPackaging] = useState(false);

  const { announcements, failures } = useMemo(
    () => compileLine(lines[0], stations, templates, settings, plans),
    [lines, stations, templates, settings, plans],
  );

  const selected = announcements.filter(
    (a) =>
      (langFilter === 'all' || a.lang === langFilter) &&
      (includeProblems || (!a.overDwell && a.allSplicesPassed)),
  );

  const overCount = selected.filter((a) => a.overDwell).length;
  const spliceFailCount = selected.filter((a) => !a.allSplicesPassed).length;
  const tempCount = selected.filter((a) => a.temporary).length;

  const doPackage = async () => {
    if (!selected.length) {
      toast('没有可出包的广播', 'bad');
      return;
    }
    setPackaging(true);
    try {
      const blob = await buildPackage(selected, lines, stations, settings, {
        includeNoisePreview: false,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lines[0].nameZh}-报站音频包-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`出包完成：${selected.length} 条 WAV + manifest.json + 质检报告`, 'ok');
    } catch (e) {
      toast(`出包失败：${(e as Error).message}`, 'bad');
    } finally {
      setPackaging(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>批量出包</h2>
        <p>每条广播导出为 WAV，按线路 / 站点归目录；manifest.json 带所属站点、触发条件、拼接质检与生效时段，另附 qa-report.md。</p>
      </div>

      <div className="grid-4">
        <Stat label="本次出包条数" value={selected.length} />
        <Stat label="超时条目" value={overCount} tone={overCount ? 'bad' : 'ok'} />
        <Stat label="拼接不合格" value={spliceFailCount} tone={spliceFailCount ? 'bad' : 'ok'} />
        <Stat label="临时广播" value={tempCount} tone={tempCount ? 'warn' : undefined} />
      </div>

      <Card
        title="出包选项"
        extra={
          <button className="primary" disabled={packaging} onClick={doPackage}>
            {packaging ? '打包中…' : `⬇ 导出 ZIP（${selected.length} 条）`}
          </button>
        }
      >
        <div className="toolbar">
          <div className="pill-group">
            {(['all', 'zh', 'en'] as const).map((l) => (
              <button key={l} className={langFilter === l ? 'on' : ''} onClick={() => setLangFilter(l)}>
                {l === 'all' ? '中英文全套' : l === 'zh' ? '仅中文' : '仅英文'}
              </button>
            ))}
          </div>
          <label className="checkline">
            <input
              type="checkbox"
              checked={includeProblems}
              onChange={(e) => setIncludeProblems(e.target.checked)}
            />
            同时包含超时 / 拼接不合格条目（默认排除）
          </label>
        </div>
        {failures.length > 0 && (
          <p className="text-bad">注意：{failures.length} 条广播编译失败，不会进入出包。</p>
        )}
      </Card>

      <Card title="出包清单预览">
        {selected.length === 0 ? (
          <Empty text="当前筛选下没有可出包的广播" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>目录 / 文件</th>
                  <th>站点</th>
                  <th>触发条件</th>
                  <th>语言</th>
                  <th>时长</th>
                  <th>质检</th>
                </tr>
              </thead>
              <tbody>
                {selected.map((a) => {
                  const st = stations.find((s) => s.id === a.stationId);
                  return (
                    <tr key={a.id}>
                      <td className="mono text-dim" style={{ fontSize: 12 }}>
                        {lines[0].nameZh}/{st?.nameZh}/…{a.lang}.wav
                      </td>
                      <td>{st?.nameZh}</td>
                      <td>
                        <Badge tone="info">{TRIGGER_LABELS[a.trigger]}</Badge>
                        {a.temporary && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="warn">{a.temporary.activeWindow}</Badge>
                          </div>
                        )}
                      </td>
                      <td>{a.lang === 'zh' ? '中' : 'EN'}</td>
                      <td className={a.overDwell ? 'text-bad' : 'mono'}>
                        {a.duration.toFixed(2)}s
                      </td>
                      <td>
                        {a.overDwell && <Badge tone="bad">超时</Badge>}
                        {!a.allSplicesPassed && <Badge tone="bad">拼接超标</Badge>}
                        {!a.overDwell && a.allSplicesPassed && <Badge tone="ok">合格</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
