/**
 * Report generation entry point.
 * Lazy-loads PDF/PPTX generators to avoid startup cost for MCP mode.
 *
 * @example
 * ```ts
 * import { generateReport } from './reports/index.js';
 *
 * const result = await generateReport(markdown, 'pdf', {
 *   title: 'Instance Health Scan',
 *   instanceUrl: 'https://dev12345.service-now.com',
 *   instanceName: 'dev',
 * });
 * console.log(result.filePath); // /tmp/scan-health_dev_20260403.pdf
 * ```
 */
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import type { ReportFormat, ReportOptions, ReportResult } from './types.js';
import { parseMarkdown } from './parser.js';

/**
 * Generate a branded report from capability markdown output.
 *
 * @param markdown - Raw markdown from LLM capability analysis
 * @param format - Output format: 'pdf', 'pptx', or 'md'
 * @param options - Report metadata (title, instance info, output directory)
 * @returns File path and size of generated report
 */
export async function generateReport(
  markdown: string,
  format: ReportFormat,
  options: ReportOptions
): Promise<ReportResult> {
  // Build output path
  const outputDir = options.outputDir || join(tmpdir(), 'nowaikit-reports');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const datestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const baseName = `${sanitize(options.capability || 'report')}_${sanitize(options.instanceName)}_${datestamp}`;
  const ext = format === 'md' ? 'md' : format;
  const outputPath = join(outputDir, `${baseName}.${ext}`);

  // For markdown, just write the raw content
  if (format === 'md') {
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, markdown);
    return { filePath: outputPath, sizeBytes: Buffer.byteLength(markdown) };
  }

  // Parse markdown into structured report data
  const reportData = parseMarkdown(markdown, {
    title: options.title,
    capability: options.capability || '',
    instanceName: options.instanceName,
    instanceUrl: options.instanceUrl,
  });

  // Resolve white-label branding (options > env > NowAIKit defaults) and attach to the data.
  const { resolveBrand } = await import('./brand.js');
  let envLogoB64: string | undefined;
  const envLogo = process.env.NOWAIKIT_REPORT_LOGO;
  if (envLogo && !options.brand?.logoBase64) {
    try { const { readFileSync } = await import('fs'); envLogoB64 = readFileSync(envLogo).toString('base64'); } catch { /* ignore bad path */ }
  }
  reportData.brand = resolveBrand({
    company: options.brand?.company || process.env.NOWAIKIT_REPORT_COMPANY,
    accentColor: options.brand?.accentColor || process.env.NOWAIKIT_REPORT_ACCENT,
    logoBase64: options.brand?.logoBase64 || envLogoB64,
    footer: options.brand?.footer || process.env.NOWAIKIT_REPORT_FOOTER,
  });

  // Lazy-load generators
  if (format === 'pdf') {
    const { generatePdf } = await import('./pdf-generator.js');
    return generatePdf(reportData, outputPath);
  }

  if (format === 'pptx') {
    const { generatePptx } = await import('./pptx-generator.js');
    return generatePptx(reportData, outputPath);
  }

  throw new Error(`Unsupported report format: ${format}`);
}

// Re-export types for SDK consumers
export type { ReportData, ReportFormat, ReportOptions, ReportResult, ReportFinding, ReportMetrics, Severity } from './types.js';
export { parseMarkdown } from './parser.js';
