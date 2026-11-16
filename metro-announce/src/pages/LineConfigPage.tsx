import { useState } from 'react';
import { useStore, newId } from '../store/useStore';
import { Card, Badge } from '../components/ui';
import { useToast } from '../components/Toast';
import type { Station } from '../types';

export function LineConfigPage() {
  const { stations, lines, addStation, updateStation, removeStation, moveStation, setDwell, updateLine } =
    useStore();
  const toast = useToast((s) => s.push);
  const line = lines[0];
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const [editing, setEditing] = useState<Station | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nameZh: '', nameEn: '', transferLines: '' });

  const totalDwell = line.dwellSeconds.reduce((a, b) => a + b, 0);

  const saveStation = () => {
    if (!form.nameZh.trim()) {
      toast('中文名必填', 'bad');
      return;
    }
    const transferLines = form.transferLines
      .split(/[,，\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    if (editing) {
      updateStation(editing.id, {
        nameZh: form.nameZh.trim(),
        nameEn: form.nameEn.trim().toUpperCase(),
        transferLines,
      });
      toast('站点已更新', 'ok');
    } else {
      const id = newId('st');
      addStation({ id, nameZh: form.nameZh.trim(), nameEn: form.nameEn.trim().toUpperCase() || form.nameZh, transferLines });
      updateLine(line.id, {
        stationIds: [...line.stationIds, id],
        dwellSeconds: [...line.dwellSeconds, 35],
      });
      toast('站点已添加到线路末端', 'ok');
    }
    setEditing(null);
    setShowAdd(false);
    setForm({ nameZh: '', nameEn: '', transferLines: '' });
  };

  return (
    <div>
      <div className="page-head">
        <h2>线路配置</h2>
        <p>
          {line.nameZh}（{line.nameEn}）共 {line.stationIds.length} 站，停站时间按站配置，广播时长超过停站时间将在审核页标红。
        </p>
      </div>

      <div className="grid-4">
        <Card>
          <div className="stat-value">{line.stationIds.length}</div>
          <div className="stat-label">车站数</div>
        </Card>
        <Card>
          <div className="stat-value">{stations.filter((s) => s.transferLines.length).length}</div>
          <div className="stat-label">换乘站</div>
        </Card>
        <Card>
          <div className="stat-value">{Math.min(...line.dwellSeconds)}–{Math.max(...line.dwellSeconds)}s</div>
          <div className="stat-label">停站时间区间</div>
        </Card>
        <Card>
          <div className="stat-value">{(totalDwell / 60).toFixed(1)} min</div>
          <div className="stat-label">停站时间累计</div>
        </Card>
      </div>

      <Card
        title="车站序列（运营里程顺序）"
        extra={
          <button
            className="primary"
            onClick={() => {
              setEditing(null);
              setForm({ nameZh: '', nameEn: '', transferLines: '' });
              setShowAdd(true);
            }}
          >
            + 新增车站
          </button>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 56 }}>#</th>
                <th>中文名</th>
                <th>英文名</th>
                <th>换乘线路</th>
                <th style={{ width: 150 }}>停站时间 (秒)</th>
                <th style={{ width: 150 }}>排序</th>
                <th style={{ width: 140 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {line.stationIds.map((sid, idx) => {
                const st = stationById.get(sid);
                if (!st) return null;
                return (
                  <tr key={sid}>
                    <td className="mono text-dim">{idx + 1}</td>
                    <td className="clip-text">{st.nameZh}</td>
                    <td className="mono text-dim">{st.nameEn}</td>
                    <td>
                      {st.transferLines.length ? (
                        <div className="pill-group">
                          {st.transferLines.map((n) => (
                            <Badge key={n} tone="info">
                              {n} 号线
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td>
                      <input
                        className="inline-num"
                        type="number"
                        min={5}
                        value={line.dwellSeconds[idx]}
                        onChange={(e) => setDwell(line.id, idx, Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <button
                        className="mini-btn ghost"
                        disabled={idx === 0}
                        onClick={() => moveStation(line.id, sid, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="mini-btn ghost"
                        style={{ marginLeft: 6 }}
                        disabled={idx === line.stationIds.length - 1}
                        onClick={() => moveStation(line.id, sid, 1)}
                      >
                        ↓
                      </button>
                    </td>
                    <td>
                      <button
                        className="mini-btn"
                        onClick={() => {
                          setEditing(st);
                          setForm({
                            nameZh: st.nameZh,
                            nameEn: st.nameEn,
                            transferLines: st.transferLines.join(', '),
                          });
                          setShowAdd(true);
                        }}
                      >
                        编辑
                      </button>
                      <button
                        className="mini-btn danger"
                        style={{ marginLeft: 6 }}
                        onClick={() => {
                          if (confirm(`确认删除车站「${st.nameZh}」？相关词条保留在词条库。`)) {
                            removeStation(st.id);
                            toast('已删除', 'info');
                          }
                        }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showAdd && (
        <div className="modal-mask" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editing ? '编辑车站' : '新增车站'}</h3>
              <button className="ghost" onClick={() => setShowAdd(false)}>
                取消
              </button>
            </div>
            <label className="field">
              <span>中文名（站名三语调词条的 key）</span>
              <input value={form.nameZh} onChange={(e) => setForm({ ...form, nameZh: e.target.value })} />
            </label>
            <label className="field">
              <span>英文名（大写，报站英文用）</span>
              <input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
            </label>
            <label className="field">
              <span>换乘线路号，逗号分隔，如 4, 13；无换乘留空</span>
              <input
                value={form.transferLines}
                onChange={(e) => setForm({ ...form, transferLines: e.target.value })}
              />
            </label>
            <div className="modal-foot">
              <button onClick={() => setShowAdd(false)}>取消</button>
              <button className="primary" onClick={saveStation}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
