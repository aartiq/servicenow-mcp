import { describe, it, expect, afterEach } from 'vitest';
import { generatePptx } from '../../src/reports/pptx-generator.js';
import { parseMarkdown } from '../../src/reports/parser.js';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const SAMPLE_MARKDOWN = `# Security Audit Report

## Executive Summary

Overall health: Critical

## 1. ACL Coverage

[CRITICAL] Missing ACLs — 12 tables have no ACL protection
  Evidence: Tables: x_custom_*, sys_user_session
  Impact: Unauthorized data access possible
  Recommendation: Create record-level ACLs for each table

[HIGH] Overly Permissive — admin role has wildcard access
  Impact: Potential privilege escalation

## 2. Script Security

[HIGH] Injection Risk — 3 business rules use eval()
  Evidence: BR: calculate_fields, dynamic_query, script_runner
  Recommendation: Replace eval() with GlideRecord or GlideScopedEvaluator

[MEDIUM] Hardcoded sys_ids — 7 scripts contain hardcoded sys_ids
`;

const OPTIONS = {
  title: 'Security Audit Report',
  capability: 'scan-security',
  instanceName: 'prod',
  instanceUrl: 'https://prod.service-now.com',
};

describe('generatePptx', () => {
  const outputPath = join(tmpdir(), `nowaikit-test-${Date.now()}.pptx`);

  afterEach(() => {
    try { if (existsSync(outputPath)) unlinkSync(outputPath); } catch { /* ignore */ }
  });

  it('generates a valid PPTX file', async () => {
    const reportData = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    const result = await generatePptx(reportData, outputPath);

    expect(result.filePath).toBe(outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('PPTX starts with PK zip magic bytes', async () => {
    const reportData = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    await generatePptx(reportData, outputPath);

    const buffer = readFileSync(outputPath);
    const header = buffer.subarray(0, 2).toString('ascii');
    expect(header).toBe('PK');
  });

  it('generates reasonable file size', async () => {
    const reportData = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    const result = await generatePptx(reportData, outputPath);

    // A PPTX with charts and tables should be at least a few KB
    expect(result.sizeBytes).toBeGreaterThan(5000);
    // But shouldn't be unreasonably large
    expect(result.sizeBytes).toBeLessThan(2000000);
  });
});
