import { describe, it, expect } from 'vitest';
import { QUERY_SYNTAX_REFERENCE } from '../../src/resources/query-syntax.js';

describe('QUERY_SYNTAX_REFERENCE', () => {
  it('is a non-empty string', () => {
    expect(typeof QUERY_SYNTAX_REFERENCE).toBe('string');
    expect(QUERY_SYNTAX_REFERENCE.length).toBeGreaterThan(0);
  });

  describe('contains comparison operators', () => {
    it.each([
      ['equals', '='],
      ['not equals', '!='],
      ['LIKE', 'LIKE'],
      ['STARTSWITH', 'STARTSWITH'],
      ['ENDSWITH', 'ENDSWITH'],
      ['IN', 'IN'],
      ['NOT IN', 'NOT IN'],
      ['ISEMPTY', 'ISEMPTY'],
      ['ISNOTEMPTY', 'ISNOTEMPTY'],
      ['BETWEEN', 'BETWEEN'],
      ['INSTANCEOF', 'INSTANCEOF'],
    ])('contains %s operator (%s)', (_label, op) => {
      expect(QUERY_SYNTAX_REFERENCE).toContain(op);
    });
  });

  describe('contains logical operators', () => {
    it('contains AND (^)', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('^');
    });

    it('contains OR (^OR)', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('^OR');
    });

    it('contains NQ (^NQ)', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('^NQ');
    });
  });

  describe('contains date functions', () => {
    it.each([
      'gs.daysAgo',
      'gs.beginningOfToday',
      'gs.endOfToday',
      'gs.beginningOfThisMonth',
      'gs.beginningOfThisYear',
      'gs.hoursAgo',
      'gs.minutesAgo',
      'gs.now',
      'gs.getUserID',
    ])('contains %s', (fn) => {
      expect(QUERY_SYNTAX_REFERENCE).toContain(fn);
    });
  });

  describe('contains ordering syntax', () => {
    it('contains ORDERBY', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('ORDERBY');
    });

    it('contains ORDERBYDESC', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('ORDERBYDESC');
    });
  });

  describe('contains anti-patterns section', () => {
    it('has an anti-patterns heading', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('Anti-Patterns');
    });

    it('warns against fabricating sys_ids', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('fabricate sys_id');
    });

    it('warns against using LIKE on sys_id', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('LIKE');
      expect(QUERY_SYNTAX_REFERENCE).toContain('sys_id');
    });

    it('warns against eval', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('eval()');
    });
  });

  describe('contains reference/dot-walking section', () => {
    it('contains dot-walking examples', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('caller_id.name');
      expect(QUERY_SYNTAX_REFERENCE).toContain('assigned_to.email');
    });
  });

  describe('contains state values reference', () => {
    it('contains incident states', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('1=New');
      expect(QUERY_SYNTAX_REFERENCE).toContain('7=Closed');
    });

    it('contains change_request states', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('change_request');
    });
  });

  describe('contains common query patterns', () => {
    it('includes P1/P2 incident pattern', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('priority<=2');
    });

    it('includes unassigned pattern', () => {
      expect(QUERY_SYNTAX_REFERENCE).toContain('assigned_toISEMPTY');
    });
  });
});
