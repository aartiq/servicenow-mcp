import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../src/reports/parser.js';

const SAMPLE_MARKDOWN = `# Instance Health Scan

## Executive Summary

This report provides a comprehensive health assessment of the development instance.

- Critical issues: 2
- Warnings: 3
- Informational: 1
- Overall health: Degraded

## 1. System Properties

System properties are configured correctly.

[INFO] System Properties — All core system properties are within expected ranges
  Evidence: 15 properties checked, all within bounds
  Impact: None
  Recommendation: Continue monitoring

## 2. Plugin Status

| Plugin | Status | Version |
|--------|--------|---------|
| ITSM   | Active | 3.2.1   |
| CMDB   | Active | 2.8.0   |

[CRITICAL] Plugin Health — Deprecated plugin "legacy_integration" is still active
  Evidence: Plugin has been deprecated since Orlando release
  Impact: Security vulnerabilities and performance degradation
  Recommendation: Deactivate and migrate to Flow Designer integrations

[HIGH] Plugin Conflicts — ITSM and custom app have conflapping business rules
  Evidence: 3 business rules fire on same table/event
  Impact: Potential data inconsistency
  Recommendation: Review and consolidate overlapping rules

## 3. Scheduled Jobs

[CRITICAL] Job Failures — 5 scheduled jobs have failed in the last 24 hours
  Evidence: Jobs: cleanup_audit, sync_cmdb, email_notify, report_gen, cache_clear
  Impact: Stale data and missed notifications
  Recommendation: Review job logs and fix root causes immediately

[MEDIUM] Job Overlap — 3 heavy jobs scheduled at same time (02:00)
  Evidence: cleanup_audit, sync_cmdb, report_gen all at 02:00
  Impact: Resource contention and slower execution
  Recommendation: Stagger heavy jobs by 30-minute intervals

[LOW] Missing Run-As — 2 custom jobs run as admin user
  Evidence: custom_sync and custom_export have no dedicated service account
  Impact: Audit trail shows admin instead of service account
  Recommendation: Create service accounts for automated jobs
`;

const OPTIONS = {
  title: 'Instance Health Scan',
  capability: 'scan-health',
  instanceName: 'dev',
  instanceUrl: 'https://dev12345.service-now.com',
};

describe('parseMarkdown', () => {
  it('extracts sections from markdown', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    expect(result.sections.length).toBeGreaterThanOrEqual(3);
    expect(result.sections.map(s => s.title)).toContain('System Properties');
    expect(result.sections.map(s => s.title)).toContain('Plugin Status');
    expect(result.sections.map(s => s.title)).toContain('Scheduled Jobs');
  });

  it('extracts findings with correct severities', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    expect(result.findings.length).toBe(6);

    const critical = result.findings.filter(f => f.severity === 'critical');
    expect(critical.length).toBe(2);

    const high = result.findings.filter(f => f.severity === 'high');
    expect(high.length).toBe(1);

    const medium = result.findings.filter(f => f.severity === 'medium');
    expect(medium.length).toBe(1);

    const low = result.findings.filter(f => f.severity === 'low');
    expect(low.length).toBe(1);

    const info = result.findings.filter(f => f.severity === 'info');
    expect(info.length).toBe(1);
  });

  it('computes severity counts correctly', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    expect(result.metrics.severityCounts.critical).toBe(2);
    expect(result.metrics.severityCounts.high).toBe(1);
    expect(result.metrics.severityCounts.medium).toBe(1);
    expect(result.metrics.severityCounts.low).toBe(1);
    expect(result.metrics.severityCounts.info).toBe(1);
    expect(result.metrics.totalFindings).toBe(6);
  });

  it('detects overall health status', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    expect(result.metrics.overallHealth).toBe('degraded');
  });

  it('extracts executive summary', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    expect(result.executiveSummary).toContain('comprehensive health assessment');
  });

  it('extracts tables from markdown', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    const pluginSection = result.sections.find(s => s.title === 'Plugin Status');
    expect(pluginSection).toBeDefined();
    expect(pluginSection!.tables.length).toBe(1);
    expect(pluginSection!.tables[0].headers).toEqual(['Plugin', 'Status', 'Version']);
    expect(pluginSection!.tables[0].rows.length).toBe(2);
  });

  it('enriches findings with evidence, impact, recommendation', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    const criticalFinding = result.findings.find(f => f.title.includes('Plugin Health'));
    expect(criticalFinding).toBeDefined();
    expect(criticalFinding!.evidence).toContain('deprecated since Orlando');
    expect(criticalFinding!.impact).toContain('Security vulnerabilities');
    expect(criticalFinding!.recommendation).toContain('Deactivate');
  });

  it('computes category breakdown', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    expect(Object.keys(result.metrics.categoryBreakdown).length).toBeGreaterThanOrEqual(2);
  });

  it('sets metadata correctly', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    expect(result.title).toBe('Instance Health Scan');
    expect(result.capability).toBe('scan-health');
    expect(result.instanceName).toBe('dev');
    expect(result.instanceUrl).toBe('https://dev12345.service-now.com');
    expect(result.scanDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('preserves raw markdown', () => {
    const result = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    expect(result.rawMarkdown).toBe(SAMPLE_MARKDOWN);
  });

  it('handles empty markdown gracefully', () => {
    const result = parseMarkdown('', OPTIONS);
    expect(result.sections).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.metrics.totalFindings).toBe(0);
  });
});
