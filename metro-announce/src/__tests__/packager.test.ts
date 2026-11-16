import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { compileLine } from '../engine/compiler';
import { buildPackage } from '../engine/packager';
import { DEFAULT_SETTINGS, SEED_LINE, SEED_STATIONS, SEED_TEMPLATES } from '../data/seed';
import { SAMPLE_RATE } from '../audio/constants';

describe('批量出包', () => {
  it('ZIP 内含每条广播 WAV、manifest 与质检报告，且每条带站点与触发条件', async () => {
    const { announcements } = compileLine(SEED_LINE, SEED_STATIONS, SEED_TEMPLATES, DEFAULT_SETTINGS);
    expect(announcements.length).toBeGreaterThan(0);

    const blob = await buildPackage(announcements, [SEED_LINE], SEED_STATIONS, DEFAULT_SETTINGS, {
      includeNoisePreview: false,
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

    const wavNames = names.filter((n) => n.endsWith('.wav'));
    expect(wavNames).toHaveLength(announcements.length);
    expect(names).toContain('manifest.json');
    expect(names).toContain('qa-report.md');

    // WAV 头校验：RIFF / WAVE / 采样率
    const firstWav = await zip.file(wavNames[0])!.async('uint8array');
    const head = new TextDecoder().decode(firstWav.subarray(0, 4));
    expect(head).toBe('RIFF');
    const view = new DataView(firstWav.buffer, firstWav.byteOffset);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);

    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.count).toBe(announcements.length);
    expect(manifest.sampleRate).toBe(SAMPLE_RATE);
    const entry = manifest.announcements[0];
    expect(entry.stationId).toBeTruthy();
    expect(entry.stationNameZh).toBeTruthy();
    expect(entry.triggerCondition).toBeTruthy();
    expect(entry.splice.thresholdDb).toBe(DEFAULT_SETTINGS.spliceJumpThresholdDb);
    expect(entry.splice.allPassed).toBe(true);
    expect(entry).toHaveProperty('temporary');
  });
});
