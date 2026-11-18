import { describe, it, expect } from 'vitest';
import { validateQuery } from '../../src/servicenow/client.js';

describe('validateQuery javascript: allowlist', () => {
  it.each([
    'sys_created_on>=javascript:gs.beginningOfThisWeek()',
    'start_date>=javascript:gs.beginningOfLastWeek()^start_date<=javascript:gs.endOfLastWeek()',
    'opened_at>=javascript:gs.beginningOfNextQuarter()',
    'opened_at>=javascript:gs.beginningOfLast30Minutes()',
    'sys_created_onONToday@javascript:gs.beginningOfToday()@javascript:gs.endOfToday()',
    'opened_at>=javascript:gs.daysAgoStart(7)',
    "opened_at>=javascript:gs.dateGenerate('2026-01-01','00:00:00')",
    'assigned_to=javascript:gs.getUserID();',
  ])('allows %s', (q) => {
    expect(validateQuery(q)).toBe(q);
  });

  it.each([
    'active=true^sys_id=javascript:new GlideRecord("sys_user").deleteMultiple()',
    'x=javascript:gs.beginningOfToday();gs.eval("1")',
    'x=javascript:gs.beginningOfToday(foo)',
    'x=javascript:gs.getProperty("glide.secret")',
    'x=javascript:gs.endOfToday()+gs.getSession()',
  ])('rejects %s', (q) => {
    expect(() => validateQuery(q)).toThrow(/unsafe JavaScript/);
  });
});
