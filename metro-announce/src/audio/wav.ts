import { SAMPLE_RATE } from './constants';
import type { Pcm } from '../types';

/** 16-bit PCM WAV 编解码（浏览器与 node 测试环境通用） */

export function encodeWav(samples: Pcm, sampleRate = SAMPLE_RATE): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** 解码上传的音频文件，重采样为单声道目标采样率 */
export async function decodeAudioFile(
  file: File,
  ctx: BaseAudioContext,
  targetRate = SAMPLE_RATE,
): Promise<Pcm> {
  const arrayBuf = await file.arrayBuffer();
  const audioBuf = await ctx.decodeAudioData(arrayBuf);
  const mono =
    audioBuf.numberOfChannels === 1
      ? audioBuf.getChannelData(0).slice()
      : mixToMono(audioBuf);
  if (audioBuf.sampleRate === targetRate) return mono;
  return resampleLinear(mono, audioBuf.sampleRate, targetRate);
}

function mixToMono(buf: AudioBuffer): Pcm {
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.getChannelData(1);
  const out = new Float32Array(ch0.length);
  for (let i = 0; i < ch0.length; i++) out[i] = (ch0[i] + ch1[i]) * 0.5;
  return out;
}

export function resampleLinear(input: Pcm, fromRate: number, toRate: number): Pcm {
  if (fromRate === toRate) return input.slice();
  const ratio = fromRate / toRate;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    out[i] = (input[i0] ?? 0) * (1 - frac) + (input[i0 + 1] ?? input[i0] ?? 0) * frac;
  }
  return out;
}
