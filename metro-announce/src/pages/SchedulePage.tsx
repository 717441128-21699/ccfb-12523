import { useMemo, useState } from 'react';
import { useStore, newId } from '../store/useStore';
import { Card, Badge, Empty } from '../components/ui';
import { useToast } from '../components/Toast';
import { TRIGGER_LABELS } from '../audio/constants';
import type { PlanTrigger, ScheduledPlan } from '../types';

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SchedulePage() {
  const { plans, stations, lines, templates, addPlan, updatePlan, removePlan } = useStore();
  const toast = useToast((s) => s.push);
  const line = lines[0];
  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const now = Date.now();

  const [trigger, setTrigger] = useState<PlanTrigger>('skip');
  const [stationIds, setStationIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState(toLocalInput(new Date(now + 3600_000)));
  const [endAt, setEndAt] = useState(toLocalInput(new Date(now + 3 * 3600_000)));
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const tplOptions = templates.filter((t) => t.trigger === trigger);

  const planStatus = (p: ScheduledPlan): 'live' | 'upcoming' | 'expired' | 'off' => {
    if (!p.active) return 'off';
    const start = new Date(p.startAt).getTime();
    const end = new Date(p.endAt).getTime();
    if (now >= start && now <= end) return 'live';
    if (now > end) return 'expired';
    return 'upcoming';
  };

  const submit = () => {
    if (!stationIds.length) {
      toast('请至少选择一个受影响车站', 'bad');
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      toast('结束时间必须晚于开始时间', 'bad');
      return;
    }
    const tpl = tplOptions[0];
    if (!tpl) {
      toast(`缺少 ${TRIGGER_LABELS[trigger]} 场景模板，请先在模板编排页创建`, 'bad');
      return;
    }
    const plan: ScheduledPlan = {
      id: newId('plan'),
      name: name.trim() || `${TRIGGER_LABELS[trigger]}计划-${plans.length + 1}`,
      trigger,
      lineId: line.id,
      stationIds,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      templateId: tpl.id,
      note: note.trim() || undefined,
      active: true,
    };
    addPlan(plan);
    toast('临时运营图已创建，审核页将生成对应临时广播并标出生效时段', 'ok');
    setStationIds([]);
    setName('');
    setNote('');
  };

  const toggleStation = (id: string) =>
    setStationIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <div>
      <div className="page-head">
        <h2>临时运营图</h2>
        <p>甩站或改线时按运营图生成临时广播，每条广播标出生效时段；过期计划自动停止出包。</p>
      </div>

      <Card title="新建临时计划">
        <div className="grid-3">
          <label className="field">
            <span>计划名称</span>
            <input placeholder="如：周四夜间施工甩站" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>类型</span>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value as PlanTrigger)}>
              <option value="skip">甩站通过</option>
              <option value="reroute">临时改线</option>
            </select>
          </label>
          <label className="field">
            <span>关联模板</span>
            <select value={tplOptions[0]?.id ?? ''} disabled>
              <option value="">{tplOptions[0]?.name ?? '无可用模板'}</option>
            </select>
          </label>
          <label className="field">
            <span>生效开始</span>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </label>
          <label className="field">
            <span>生效结束</span>
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </label>
          <label className="field">
            <span>备注</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="调度令编号等" />
          </label>
        </div>

        <div className="card-head">
          <h3>受影响车站（可多选，按线路顺序）</h3>
          <span className="text-dim" style={{ fontSize: 12 }}>
            已选 {stationIds.length} 站
          </span>
        </div>
        <div className="pill-group" style={{ marginBottom: 14 }}>
          {line.stationIds.map((sid) => {
            const st = stationById.get(sid)!;
            const on = stationIds.includes(sid);
            return (
              <button key={sid} className={on ? 'on' : ''} onClick={() => toggleStation(sid)}>
                {st.nameZh}
              </button>
            );
          })}
        </div>
        <button className="primary" onClick={submit}>
          生成临时计划
        </button>
      </Card>

      <Card title={`已建计划（${plans.length}）`}>
        {plans.length === 0 ? (
          <Empty text="暂无临时计划" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>计划</th>
                  <th>类型</th>
                  <th>影响车站</th>
                  <th>生效时段</th>
                  <th>状态</th>
                  <th>启用</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const status = planStatus(p);
                  return (
                    <tr key={p.id} className={status === 'live' ? 'plan-active' : ''}>
                      <td>
                        <div className="clip-text">{p.name}</div>
                        {p.note && <div className="clip-meta">{p.note}</div>}
                      </td>
                      <td>
                        <Badge tone={p.trigger === 'skip' ? 'warn' : 'info'}>{TRIGGER_LABELS[p.trigger]}</Badge>
                      </td>
                      <td>
                        {p.stationIds.map((sid) => stationById.get(sid)?.nameZh).filter(Boolean).join('、')}
                      </td>
                      <td className="plan-window mono text-dim">
                        {p.startAt.replace('T', ' ').slice(0, 16)}
                        <br />～ {p.endAt.replace('T', ' ').slice(0, 16)}
                      </td>
                      <td>
                        {status === 'live' && <Badge tone="ok">生效中</Badge>}
                        {status === 'upcoming' && <Badge tone="info">待生效</Badge>}
                        {status === 'expired' && <Badge tone="neutral">已过期</Badge>}
                        {status === 'off' && <Badge tone="warn">已停用</Badge>}
                      </td>
                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={p.active}
                            onChange={(e) => updatePlan(p.id, { active: e.target.checked })}
                          />
                          <span className="track" />
                        </label>
                      </td>
                      <td>
                        <button className="mini-btn danger" onClick={() => removePlan(p.id)}>
                          删除
                        </button>
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
