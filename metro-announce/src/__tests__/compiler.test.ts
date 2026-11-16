import { describe, expect, it } from 'vitest';
import { compileAnnouncement, compileLine, lineNameZh, tokenize } from '../engine/compiler';
import { DEFAULT_SETTINGS, SEED_LINE, SEED_STATIONS, SEED_TEMPLATES } from '../data/seed';
import type { AnnounceTemplate, ScheduledPlan } from '../types';

const settings = DEFAULT_SETTINGS;
const stations = SEED_STATIONS;
const line = SEED_LINE;

const tplById = (id: string) => SEED_TEMPLATES.find((t) => t.id === id)!;

describe('模板分词与变量语调', () => {
  it('模板被切成短语/标点/变量 token', () => {
    const tokens = tokenize('前方到站，{{station}}，请下车的乘客提前做好准备。');
    expect(tokens[0]).toEqual({ kind: 'phrase', text: '前方到站' });
    expect(tokens[1]).toEqual({ kind: 'punct', text: '，' });
    expect(tokens[2]).toEqual({ kind: 'var', name: 'station' });
    expect(tokens.at(-1)).toEqual({ kind: 'punct', text: '。' });
  });

  it('句首变量取 head 语调，句尾变量取 tail 语调', () => {
    const headTpl: AnnounceTemplate = {
      id: 'x1', name: 'x', trigger: 'arrival', lang: 'zh', enabled: true,
      text: '{{station}}，到了。',
    };
    const tailTpl: AnnounceTemplate = {
      id: 'x2', name: 'x', trigger: 'arrival', lang: 'zh', enabled: true,
      text: '前方到站，{{station}}。',
    };
    const station = stations[0];
    const a = compileAnnouncement({ template: headTpl, line, station, settings, vars: { station } });
    const b = compileAnnouncement({ template: tailTpl, line, station, settings, vars: { station } });
    expect(a.duration).toBeGreaterThan(0);
    expect(b.duration).toBeGreaterThan(0);
    // 两条渲染文本都应包含站名
    expect(a.text).toContain(station.nameZh);
    expect(b.text).toContain(station.nameZh);
  });

  it('线路号中文读法', () => {
    expect(lineNameZh(4)).toBe('四号线');
    expect(lineNameZh(10)).toBe('十号线');
    expect(lineNameZh(13)).toBe('十三号线');
  });
});

describe('标点停顿规则', () => {
  it('句号停顿 0.45s、逗号 0.25s 写入 gapsMs', () => {
    const station = stations[0];
    const tpl = tplById('tpl-arr-zh'); // 含两个逗号一个句号
    const result = compileAnnouncement({ template: tpl, line, station, settings, vars: { station } });
    // 模板：前方到站，X，请下车的乘客提前做好准备。 -> 逗号×2 + 句号×1
    expect(result.gapsMs).toHaveLength(3);
    expect(result.gapsMs[0]).toBeCloseTo(250, 0);
    expect(result.gapsMs[1]).toBeCloseTo(250, 0);
    expect(result.gapsMs[2]).toBeCloseTo(450, 0);
  });
});

describe('停站时间超限标红', () => {
  it('广播短于停站时间时 overDwell=false', () => {
    const station = stations[0];
    const result = compileAnnouncement({
      template: tplById('tpl-arr-zh'),
      line,
      station,
      settings,
      vars: { station },
    });
    expect(result.dwellSeconds).toBe(35);
    expect(result.duration).toBeLessThan(35);
    expect(result.overDwell).toBe(false);
  });

  it('人为压缩停站时间到 1 秒后 overDwell=true', () => {
    const shortLine = { ...line, dwellSeconds: line.dwellSeconds.map(() => 1) };
    const station = stations[0];
    const result = compileAnnouncement({
      template: tplById('tpl-arr-zh'),
      line: shortLine,
      station,
      settings,
      vars: { station },
    });
    expect(result.overDwell).toBe(true);
  });
});

describe('全线编译与临时广播', () => {
  it('全线中英文广播全部拼接合格且时长合格', () => {
    const { announcements, failures } = compileLine(line, stations, SEED_TEMPLATES, settings);
    expect(failures).toHaveLength(0);
    expect(announcements.length).toBeGreaterThan(20);
    for (const a of announcements) {
      expect(a.allSplicesPassed).toBe(true);
      expect(a.overDwell).toBe(false);
      expect(a.audio.length / a.sampleRate).toBeCloseTo(a.duration, 5);
    }
    // 中英文两套都存在
    expect(announcements.some((a) => a.lang === 'zh')).toBe(true);
    expect(announcements.some((a) => a.lang === 'en')).toBe(true);
  });

  it('甩站运营图生成带生效时段的临时广播', () => {
    const plan: ScheduledPlan = {
      id: 'plan-1',
      name: '夜间施工甩站',
      trigger: 'skip',
      lineId: line.id,
      stationIds: [stations[3].id, stations[4].id],
      startAt: new Date(Date.now() - 3600_000).toISOString(),
      endAt: new Date(Date.now() + 3600_000).toISOString(),
      templateId: 'tpl-skip-zh',
      active: true,
    };
    const base = compileLine(line, stations, SEED_TEMPLATES, settings).announcements.length;
    const withPlan = compileLine(line, stations, SEED_TEMPLATES, settings, [plan]);
    expect(withPlan.announcements.length).toBe(base + 2);
    const temp = withPlan.announcements.filter((a) => a.temporary);
    expect(temp).toHaveLength(2);
    expect(temp[0].temporary?.planName).toBe('夜间施工甩站');
    expect(temp[0].temporary?.activeWindow).toContain('～');
    expect(temp[0].text).toContain(stations[3].nameZh);
  });

  it('过期或停用的运营图不产生临时广播', () => {
    const plan: ScheduledPlan = {
      id: 'plan-2', name: '过期', trigger: 'skip', lineId: line.id,
      stationIds: [stations[0].id],
      startAt: new Date(Date.now() - 7200_000).toISOString(),
      endAt: new Date(Date.now() - 3600_000).toISOString(),
      templateId: 'tpl-skip-zh', active: true,
    };
    const r1 = compileLine(line, stations, SEED_TEMPLATES, settings, [plan]);
    expect(r1.announcements.some((a) => a.temporary)).toBe(false);

    const r2 = compileLine(line, stations, SEED_TEMPLATES, settings, [{ ...plan, active: false, endAt: new Date(Date.now() + 3600_000).toISOString() }]);
    expect(r2.announcements.some((a) => a.temporary)).toBe(false);
  });
});
