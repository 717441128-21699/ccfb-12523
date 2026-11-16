import { useEffect, useRef } from 'react';
import type { SplicePoint, Pcm } from '../types';

interface WaveformProps {
  samples: Pcm;
  splicePoints?: SplicePoint[];
  thresholdDb?: number;
  height?: number;
  progress?: number;
  color?: string;
}

/** 波形绘制：峰值降采样 + 接缝标记（绿色合格/红色超标） */
export function Waveform({
  samples,
  splicePoints = [],
  thresholdDb,
  height = 96,
  progress,
  color = '#5ab0ff',
}: WaveformProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const mid = height / 2;
    const bins = Math.max(64, width);
    const binSize = Math.max(1, Math.floor(samples.length / bins));

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < bins; x++) {
      const start = x * binSize;
      let min = 0;
      let max = 0;
      for (let i = start; i < Math.min(start + binSize, samples.length); i++) {
        if (samples[i] < min) min = samples[i];
        if (samples[i] > max) max = samples[i];
      }
      const y1 = mid - max * (mid - 4);
      const y2 = mid - min * (mid - 4);
      ctx.moveTo(x + 0.5, y1);
      ctx.lineTo(x + 0.5, y2);
    }
    ctx.stroke();

    // 中线
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    // 接缝
    for (const p of splicePoints) {
      const x = (p.seamSample / samples.length) * width;
      const bad = !p.passed || (thresholdDb !== undefined && p.jumpDb > thresholdDb);
      ctx.strokeStyle = bad ? '#e05252' : '#2fbf71';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x, height - 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (progress !== undefined) {
      ctx.fillStyle = 'rgba(90,176,255,0.18)';
      ctx.fillRect(0, 0, width * progress, height);
    }
  }, [samples, splicePoints, thresholdDb, height, progress, color]);

  return <canvas ref={ref} style={{ width: '100%', height, display: 'block' }} />;
}
