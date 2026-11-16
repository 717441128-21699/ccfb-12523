import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SAMPLE_RATE } from '../audio/constants';
import { clipRegistry } from '../audio/registry';
import type { Pcm } from '../types';

/** 订阅内存词条注册表（注册表变化时重渲染） */
export function useClipRegistryVersion(): number {
  return useSyncExternalStore(
    (cb) => clipRegistry.subscribe(cb),
    () => clipRegistry.list().length,
  );
}

let sharedCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctor({ sampleRate: SAMPLE_RATE });
  }
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

export interface PlayerState {
  playingId: string | null;
  progress: number;
}

/** 通用 PCM 试听播放器，支持叠加噪声与循环 */
export function useAudioPlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [state, setState] = useState<PlayerState>({ playingId: null, progress: 0 });
  const rafRef = useRef<number>(0);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    try {
      sourceRef.current?.stop();
    } catch {
      /* 已停止 */
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    setState({ playingId: null, progress: 0 });
  };

  const play = (id: string, samples: Pcm, opts?: { loop?: boolean }) => {
    stop();
    const ctx = getAudioContext();
    ctxRef.current = ctx;
    const buf = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buf.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = opts?.loop ?? false;
    src.connect(ctx.destination);
    src.onended = () => {
      if (sourceRef.current === src) stop();
    };
    src.start();
    sourceRef.current = src;
    startedAtRef.current = ctx.currentTime;
    offsetRef.current = 0;
    setState({ playingId: id, progress: 0 });

    const tick = () => {
      const dur = samples.length / SAMPLE_RATE;
      const p = Math.min(1, (ctx.currentTime - startedAtRef.current) / dur);
      setState((s) => (s.playingId === id ? { ...s, progress: p } : s));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => stop(), []);

  return { ...state, play, stop, isPlaying: (id: string) => state.playingId === id };
}
