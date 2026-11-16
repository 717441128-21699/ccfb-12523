import { useStore } from '../store/useStore';
import { useToast } from './Toast';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 全局设置：拼接阈值、交叉淡化、搜索窗、标点停顿、满刻度声压级 */
export function SettingsModal({ open, onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const resetAll = useStore((s) => s.resetAll);
  const toast = useToast((s) => s.push);

  if (!open) return null;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>工程设置</h3>
          <button className="ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>拼接点瞬时电平跳变阈值 (dBFS)，实测须低于此值</span>
            <input
              type="number"
              value={settings.spliceJumpThresholdDb}
              step={1}
              onChange={(e) => updateSettings({ spliceJumpThresholdDb: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>超阈值交叉淡化时长 (ms)</span>
            <input
              type="number"
              value={settings.crossfadeMs}
              min={2}
              max={40}
              onChange={(e) => updateSettings({ crossfadeMs: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>过零点搜索窗 (ms)</span>
            <input
              type="number"
              value={settings.searchWindowMs}
              min={5}
              max={100}
              onChange={(e) => updateSettings({ searchWindowMs: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>无标点词条默认停顿 (ms)</span>
            <input
              type="number"
              value={settings.defaultGapMs}
              min={0}
              onChange={(e) => updateSettings({ defaultGapMs: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>满刻度对应声压级 (dB SPL)，清晰度指数校准用</span>
            <input
              type="number"
              value={settings.fullScaleDbSpl}
              onChange={(e) => updateSettings({ fullScaleDbSpl: Number(e.target.value) })}
            />
          </label>
        </div>

        <h4 style={{ margin: '8px 0' }}>句间停顿时长（按标点规则）</h4>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 90 }}>标点</th>
                <th>停顿 (秒)</th>
              </tr>
            </thead>
            <tbody>
              {settings.pauseRules.map((rule, i) => (
                <tr key={rule.punctuation}>
                  <td className="mono">{rule.punctuation}</td>
                  <td>
                    <input
                      className="inline-num"
                      type="number"
                      step={0.05}
                      min={0}
                      value={rule.seconds}
                      onChange={(e) => {
                        const rules = settings.pauseRules.slice();
                        rules[i] = { ...rule, seconds: Number(e.target.value) };
                        updateSettings({ pauseRules: rules });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-foot">
          <button
            className="danger"
            onClick={() => {
              if (confirm('确认恢复全部种子数据并清空本地修改？')) {
                resetAll();
                toast('已恢复出厂数据', 'ok');
                onClose();
              }
            }}
          >
            恢复出厂数据
          </button>
          <button className="primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
