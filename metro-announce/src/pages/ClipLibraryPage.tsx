import { useMemo, useRef, useState } from 'react';
import { clipRegistry, clipId } from '../audio/registry';
import { useClipRegistryVersion, useAudioPlayer, getAudioContext } from '../hooks/useAudioPlayer';
import { decodeAudioFile } from '../audio/wav';
import { POSITION_LABELS } from '../audio/constants';
import { useStore } from '../store/useStore';
import { Card, Badge, Empty } from '../components/ui';
import { Waveform } from '../components/Waveform';
import { useToast } from '../components/Toast';
import type { Clip, Lang, Position } from '../types';

const POSITIONS: Position[] = ['head', 'mid', 'tail'];

export function ClipLibraryPage() {
  const registryVersion = useClipRegistryVersion();
  const { stations } = useStore();
  const player = useAudioPlayer();
  const toast = useToast((s) => s.push);
  const [langFilter, setLangFilter] = useState<Lang | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Clip | null>(null);
  const [newText, setNewText] = useState('');
  const [newLang, setNewLang] = useState<Lang>('zh');
  const uploadRef = useRef<HTMLInputElement>(null);

  const clips = useMemo(() => {
    return clipRegistry
      .list()
      .filter((c) => (langFilter === 'all' ? true : c.lang === langFilter))
      .filter((c) => (keyword ? c.text.toLowerCase().includes(keyword.toLowerCase()) : true));
  }, [langFilter, keyword, registryVersion]);

  // 站名三语调覆盖检查
  const coverage = useMemo(() => {
    const missing: { text: string; lang: Lang; position: Position }[] = [];
    for (const st of stations) {
      for (const [text, lang] of [
        [st.nameZh, 'zh'],
        [st.nameEn, 'en'],
      ] as [string, Lang][]) {
        for (const pos of POSITIONS) {
          if (!clipRegistry.get(clipId(text, lang, pos))) missing.push({ text, lang, position: pos });
        }
      }
    }
    return missing;
  }, [stations, registryVersion]);

  const synthesizeAll = () => {
    for (const st of stations) {
      for (const pos of POSITIONS) {
        clipRegistry.ensure(st.nameZh, 'zh', pos);
        clipRegistry.ensure(st.nameEn, 'en', pos);
      }
    }
    toast(`已按句首/句中/句尾补录全部站名词条`, 'ok');
  };

  const handleUpload = async (file: File) => {
    if (!selected) return;
    try {
      const ctx = getAudioContext();
      const samples = await decodeAudioFile(file, ctx);
      clipRegistry.replaceWithUpload(selected.text, selected.lang, selected.position, samples);
      setSelected(clipRegistry.get(selected.id) ?? null);
      toast(`已用录音替换「${selected.text}」(${POSITION_LABELS[selected.position]})`, 'ok');
    } catch (e) {
      toast(`音频解码失败：${(e as Error).message}`, 'bad');
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>词条库</h2>
        <p>
          同一站名按句首 / 句中 / 句尾三种语调各录一条，拼接时按变量在句中的位置挑选。当前为合成假词条，可上传真实录音逐条替换。
        </p>
      </div>

      <div className="grid-4">
        <Card>
          <div className="stat-value">{clipRegistry.list().length}</div>
          <div className="stat-label">词条总数</div>
        </Card>
        <Card>
          <div className="stat-value">
            {clipRegistry.list().filter((c) => c.source === 'upload').length}
          </div>
          <div className="stat-label">真实录音</div>
        </Card>
        <Card>
          <div className="stat-value">{coverage.length}</div>
          <div className="stat-label">待补录词条</div>
        </Card>
        <Card>
          <button className="primary" style={{ width: '100%' }} onClick={synthesizeAll}>
            一键补录站名三语调
          </button>
        </Card>
      </div>

      {coverage.length > 0 && (
        <Card title="三语调覆盖缺口">
          <div className="pill-group">
            {coverage.slice(0, 24).map((m) => (
              <Badge key={`${m.lang}-${m.position}-${m.text}`} tone="warn">
                {m.lang === 'zh' ? '中' : 'EN'} · {POSITION_LABELS[m.position]} · {m.text}
              </Badge>
            ))}
            {coverage.length > 24 && <Badge tone="neutral">…共 {coverage.length} 条</Badge>}
          </div>
        </Card>
      )}

      <Card
        title="词条列表"
        extra={
          <div className="toolbar" style={{ margin: 0 }}>
            <div className="pill-group">
              {(['all', 'zh', 'en'] as const).map((l) => (
                <button key={l} className={langFilter === l ? 'on' : ''} onClick={() => setLangFilter(l)}>
                  {l === 'all' ? '全部' : l === 'zh' ? '中文' : 'English'}
                </button>
              ))}
            </div>
            <input
              placeholder="搜索词条文本"
              style={{ width: 200 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
        }
      >
        {clips.length === 0 ? (
          <Empty text="暂无词条，点击右上角「一键补录」或手动新增" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>文本</th>
                  <th>语言</th>
                  <th>语调位置</th>
                  <th>来源</th>
                  <th>时长</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {clips.map((c) => (
                  <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                    <td className="clip-text">{c.text}</td>
                    <td>{c.lang === 'zh' ? '中文' : 'EN'}</td>
                    <td>
                      <Badge tone={c.position === 'head' ? 'info' : c.position === 'tail' ? 'warn' : 'neutral'}>
                        {POSITION_LABELS[c.position]}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={c.source === 'upload' ? 'ok' : 'neutral'}>
                        {c.source === 'upload' ? '录音' : '合成'}
                      </Badge>
                    </td>
                    <td className="mono">{c.duration.toFixed(2)}s</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="mini-btn"
                        onClick={() =>
                          player.isPlaying(c.id)
                            ? player.stop()
                            : player.play(c.id, c.samples)
                        }
                      >
                        {player.isPlaying(c.id) ? '■ 停止' : '▶ 试听'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="手动新增词条（缺失时也会在编译时自动合成）">
        <div className="toolbar">
          <input
            placeholder="词条文本，如：开往安贞门方向"
            style={{ width: 320 }}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <select style={{ width: 120 }} value={newLang} onChange={(e) => setNewLang(e.target.value as Lang)}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
          <button
            className="primary"
            onClick={() => {
              if (!newText.trim()) return;
              POSITIONS.forEach((p) => clipRegistry.ensure(newText.trim(), newLang, p));
              toast(`已生成「${newText.trim()}」三条语调词条`, 'ok');
              setNewText('');
            }}
          >
            生成三语调
          </button>
        </div>
      </Card>

      {selected && (
        <div className="modal-mask" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                {selected.text}
                <span className="text-dim" style={{ marginLeft: 10, fontSize: 13 }}>
                  {POSITION_LABELS[selected.position]} · {selected.lang === 'zh' ? '中文' : 'English'}
                </span>
              </h3>
              <button className="ghost" onClick={() => setSelected(null)}>
                关闭
              </button>
            </div>
            <Waveform
              samples={selected.samples}
              progress={player.isPlaying(selected.id) ? player.progress : undefined}
              height={120}
            />
            <div className="toolbar" style={{ marginTop: 14 }}>
              <button
                className="primary"
                onClick={() =>
                  player.isPlaying(selected.id)
                    ? player.stop()
                    : player.play(selected.id, selected.samples)
                }
              >
                {player.isPlaying(selected.id) ? '■ 停止' : '▶ 试听'}
              </button>
              <button onClick={() => uploadRef.current?.click()}>上传录音替换</button>
              <button
                className="danger"
                onClick={() => {
                  clipRegistry.remove(selected.id);
                  setSelected(null);
                  toast('已删除（编译时会重新合成）', 'info');
                }}
              >
                删除
              </button>
              <input
                ref={uploadRef}
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="text-dim" style={{ fontSize: 12 }}>
              支持 WAV / MP3 等浏览器可解码格式，导入后自动混音为单声道并重采样至 {selected.sampleRate} Hz。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
