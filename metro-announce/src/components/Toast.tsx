import { create } from 'zustand';

interface ToastItem {
  id: number;
  text: string;
  tone: 'ok' | 'bad' | 'info';
}

interface ToastState {
  items: ToastItem[];
  push: (text: string, tone?: ToastItem['tone']) => void;
  remove: (id: number) => void;
}

let seq = 1;

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (text, tone = 'info') => {
    const id = seq++;
    set((s) => ({ items: [...s.items, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 3600);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export function ToastHost() {
  const items = useToast((s) => s.items);
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
