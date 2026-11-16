import type { ReactNode } from 'react';

export function Card({ title, extra, children }: { title?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || extra) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
