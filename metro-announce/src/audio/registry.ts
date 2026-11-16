import { synthesizeClip } from './synth';
import { SAMPLE_RATE } from './constants';
import type { Clip, Lang, Position, Pcm } from '../types';

/**
 * 词条注册表：内存态（音频 PCM 不进 localStorage）。
 * 站名按句首/句中/句尾三种语调各一条；通用短语注册为 mid。
 * 缺失词条按需合成补录。
 */

export const clipId = (text: string, lang: Lang, position: Position): string =>
  `${lang}:${position}:${text}`;

class ClipRegistry {
  private clips = new Map<string, Clip>();
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  get(id: string): Clip | undefined {
    return this.clips.get(id);
  }

  list(): Clip[] {
    return [...this.clips.values()].sort((a, b) =>
      a.lang === b.lang
        ? a.text.localeCompare(b.text, 'zh')
        : a.lang.localeCompare(b.lang),
    );
  }

  ensure(text: string, lang: Lang, position: Position): Clip {
    const id = clipId(text, lang, position);
    const existing = this.clips.get(id);
    if (existing) return existing;
    const samples = synthesizeClip({ text, lang, position });
    const clip: Clip = {
      id,
      text,
      lang,
      position,
      sampleRate: SAMPLE_RATE,
      duration: samples.length / SAMPLE_RATE,
      samples,
      source: 'synthetic',
      createdAt: Date.now(),
    };
    this.clips.set(id, clip);
    this.emit();
    return clip;
  }

  /** 上传真实录音替换合成词条 */
  replaceWithUpload(text: string, lang: Lang, position: Position, samples: Pcm): Clip {
    const id = clipId(text, lang, position);
    const clip: Clip = {
      id,
      text,
      lang,
      position,
      sampleRate: SAMPLE_RATE,
      duration: samples.length / SAMPLE_RATE,
      samples,
      source: 'upload',
      createdAt: Date.now(),
    };
    this.clips.set(id, clip);
    this.emit();
    return clip;
  }

  remove(id: string): void {
    if (this.clips.delete(id)) this.emit();
  }
}

export const clipRegistry = new ClipRegistry();
