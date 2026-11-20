import { describe, it, expect, afterEach } from 'vitest';
import { generatePdf } from '../../src/reports/pdf-generator.js';
import { parseMarkdown } from '../../src/reports/parser.js';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const SAMPLE_MARKDOWN = `# Instance Health Scan

## Executive Summary

Overall health: Degraded

## 1. Plugin Status

[CRITICAL] Plugin Health — Legacy plugin active
  Evidence: Deprecated since Orlando
  Impact: Security risk
  Recommendation: Deactivate immediately

[HIGH] Plugin Conflict — Overlapping rules
  Impact: Data inconsistency

| Plugin | Status |
|--------|--------|
| ITSM   | Active |

## 2. Scheduled Jobs

[MEDIUM] Job Overlap — Heavy jobs at same time
[LOW] Missing Run-As — Jobs run as admin
`;

const OPTIONS = {
  title: 'Test Health Scan',
  capability: 'scan-health',
  instanceName: 'test-instance',
  instanceUrl: 'https://test.service-now.com',
};

describe('generatePdf', () => {
  const outputPath = join(tmpdir(), `nowaikit-test-${Date.now()}.pdf`);

  afterEach(() => {
    try { if (existsSync(outputPath)) unlinkSync(outputPath); } catch { /* ignore */ }
  });

  it('generates a valid PDF file', async () => {
    const reportData = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    const result = await generatePdf(reportData, outputPath);

    expect(result.filePath).toBe(outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('PDF starts with %PDF magic bytes', async () => {
    const reportData = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    await generatePdf(reportData, outputPath);

    const buffer = readFileSync(outputPath);
    const header = buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('generates reasonable file size', async () => {
    const reportData = parseMarkdown(SAMPLE_MARKDOWN, OPTIONS);
    const result = await generatePdf(reportData, outputPath);

    // A branded PDF with charts should be at least a few KB
    expect(result.sizeBytes).toBeGreaterThan(1000);
    // But shouldn't be unreasonably large for this small content
    expect(result.sizeBytes).toBeLessThan(500000);
  });
});

describe('section prose in PDFs', () => {
  it('turns paragraphs and lists into blocks with clickable links', async () => {
    const { proseBlocks } = await import('../../src/reports/pdf-generator.js');
    const md = ['The **deadline** passed.', '', '- one [INC1](https://x.service-now.com/incident.do?sys_id=' + 'a'.repeat(32) + ')', '- two', '', '1. first', '2. second', '', '```', 'skip me', '```'].join('\n');
    const blocks = proseBlocks(md, 'https://x.service-now.com');
    expect(blocks).toHaveLength(3);
    expect(JSON.stringify(blocks[0])).toContain('The deadline passed.');
    expect(blocks[1].ul).toHaveLength(2);
    expect(JSON.stringify(blocks[1])).toContain('"link":"https://x.service-now.com/incident.do');
    expect(blocks[2].ol).toHaveLength(2);
    expect(JSON.stringify(blocks)).not.toContain('skip me');
  });
});
