import { useState } from 'react';
import { ClipLibraryPage } from './pages/ClipLibraryPage';
import { LineConfigPage } from './pages/LineConfigPage';
import { TemplatePage } from './pages/TemplatePage';
import { AuditPage } from './pages/AuditPage';
import { SchedulePage } from './pages/SchedulePage';
import { PackagePage } from './pages/PackagePage';
import { SettingsModal } from './components/SettingsModal';
import { ToastHost } from './components/Toast';

type PageKey = 'clips' | 'line' | 'templates' | 'audit' | 'schedule' | 'package';

const NAV: { key: PageKey; label: string; icon: string; desc: string }[] = [
  { key: 'clips', label: '词条库', icon: '🎙', desc: '三语调录音词条' },
  { key: 'line', label: '线路配置', icon: '🚇', desc: '站点与停站时间' },
  { key: 'templates', label: '模板编排', icon: '🧩', desc: '变量拼句中英文' },
  { key: 'audit', label: '试听审核', icon: '🎧', desc: '噪声模型与清晰度' },
  { key: 'schedule', label: '临时运营图', icon: '⚡', desc: '甩站改线生效时段' },
  { key: 'package', label: '批量出包', icon: '📦', desc: 'WAV 与元数据清单' },
];

export default function App() {
  const [page, setPage] = useState<PageKey>('clips');
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <span className="dot" />
          报站音频编排系统
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`nav-item ${page === n.key ? 'active' : ''}`}
              onClick={() => setPage(n.key)}
              title={n.desc}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-item" onClick={() => setSettingsOpen(true)}>
            <span className="nav-icon">⚙</span>
            工程设置
          </button>
        </div>
      </aside>

      <main>
        {page === 'clips' && <ClipLibraryPage />}
        {page === 'line' && <LineConfigPage />}
        {page === 'templates' && <TemplatePage />}
        {page === 'audit' && <AuditPage />}
        {page === 'schedule' && <SchedulePage />}
        {page === 'package' && <PackagePage />}
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ToastHost />
    </div>
  );
}
