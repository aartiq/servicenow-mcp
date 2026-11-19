/**
 * Markdown → ReportData parser.
 * Extracts sections, findings, tables, and metrics from capability output.
 */
import type { ReportData, ReportSection, ReportFinding, ReportTable, ReportMetrics, Severity } from './types.js';
import { findRecordRef } from './brand.js';
import { createHash } from 'node:crypto';

const FINDING_ID = /^(?:\*\*)?([A-Z][A-Z0-9]{1,6}-\d{1,4})(?:\*\*)?[\s:.-]+/;
const SCORE_LINE = /^\s*(?:[-*]\s*)?(?:\*\*)?(?:overall\s+)?score(?:\*\*)?\s*:?\s*(?:\*\*)?\s*(\d{1,3})\s*\/\s*100/im;
const AREA_SCORE_LINE = /^\s*(?:[-*]\s*)?(?:\*\*)?area score(?:\*\*)?\s*:?\s*(.+?)\s*[:-]?\s*(?:\*\*)?(\d{1,3})\s*\/\s*100/gim;

/** The overall score and per-area scores a report states. */
export function parseScores(markdown: string): { score?: number; areaScores: Array<{ area: string; score: number }> } {
  const m = SCORE_LINE.exec(markdown);
  const score = m ? Math.min(100, Number(m[1])) : undefined;
  const areaScores = [...markdown.matchAll(AREA_SCORE_LINE)].map((a) => ({ area: a[1]!.replace(/[*`]/g, '').replace(/[:-]\s*$/, '').trim(), score: Math.min(100, Number(a[2])) }));
  return { score, areaScores };
}

/** A short, stable ID for a finding without one: capability prefix plus a hash of the title. */
export function derivedFindingId(capability: string, title: string): string {
  const prefix = (capability || 'NAK').split('-').map((w) => w[0] || '').join('').toUpperCase().padEnd(2, 'X').slice(0, 4);
  const h = createHash('sha1').update(title.toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 4).toUpperCase();
  return `${prefix}-${h}`;
}

const SEVERITY_PATTERN = /\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]/i;
const SECTION_PATTERN = /^#{1,3}\s+(?:\d+\.\s*)?(.+)$/;
// Anchored, no ambiguous overlap: the pipe is only a group separator, never inside the
// repeated class, so there is no polynomial backtracking on adversarial input.
const TABLE_SEPARATOR = /^[ \t]*\|[ \t:-]+(?:\|[ \t:-]+)*\|?[ \t]*$/;

/** Parse a line of markdown for a severity-tagged finding. */
function parseFinding(line: string, category: string): ReportFinding | null {
  const match = line.match(SEVERITY_PATTERN);
  if (!match) return null;

  const severity = match[1].toLowerCase() as Severity;
  // Remove the severity tag and clean up the line
  const rest = line.replace(SEVERITY_PATTERN, '').replace(/^[\s\-*]+/, '').trim();

  // A leading stable ID ("ACL-03 ...") is kept as the finding ID.
  const idMatch = FINDING_ID.exec(rest);
  const body = idMatch ? rest.slice(idMatch[0].length) : rest;
  // Try to split on common delimiters: " — ", " - ", ": "
  const parts = body.split(/\s+[—\-]\s+/);
  const title = parts[0]?.trim() || body;
  const description = parts.slice(1).join(' — ').trim() || title;

  // A record link in the finding (from the gathered record_url) becomes the finding's "open record" link.
  const ref = findRecordRef(rest);
  return {
    severity,
    category,
    title,
    description,
    ...(idMatch ? { id: idMatch[1] } : {}),
    ...(ref ? { table: ref.table, sysId: ref.sysId } : {}),
  };
}

/** Parse evidence, impact, recommendation from indented lines following a finding. */
function enrichFinding(finding: ReportFinding, lines: string[]): void {
  for (const line of lines) {
    const trimmed = line.trim();
    const evidenceMatch = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?Evidence:(?:\*\*)?\s*(.+)/i);
    if (evidenceMatch) {
      finding.evidence = evidenceMatch[1].trim();
      if (!finding.sysId) {
        const ref = findRecordRef(finding.evidence);
        if (ref) { finding.table = ref.table; finding.sysId = ref.sysId; }
      }
      continue;
    }
    const impactMatch = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?Impact:(?:\*\*)?\s*(.+)/i);
    if (impactMatch) {
      finding.impact = impactMatch[1].trim();
      continue;
    }
    const effortMatch = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?Effort:(?:\*\*)?\s*(.+)/i);
    if (effortMatch) {
      finding.effort = effortMatch[1].trim();
      continue;
    }
    const recMatch = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?Recommendation:(?:\*\*)?\s*(.+)/i);
    if (recMatch) {
      finding.recommendation = recMatch[1].trim();
      continue;
    }
  }
}

/** Parse markdown pipe-delimited table into headers and rows. */
function parseTable(lines: string[]): ReportTable | null {
  if (lines.length < 2) return null;

  const parseRow = (line: string): string[] =>
    line.split('|').map(c => c.trim()).filter(c => c.length > 0);

  const headers = parseRow(lines[0]);
  if (headers.length === 0) return null;

  // Skip separator line (line[1])
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (row.length > 0) rows.push(row);
  }

  if (rows.length === 0) return null;
  return { headers, rows };
}

/** Extract the executive summary from markdown. */
function extractExecutiveSummary(markdown: string): string {
  // Look for "EXECUTIVE SUMMARY" or "Executive Summary" heading
  const pattern = /(?:^|\n)#+\s*(?:EXECUTIVE\s+SUMMARY|Executive\s+Summary)[^\n]*\n([\s\S]*?)(?=\n#|\n---|\n\*{3}|$)/i;
  const match = markdown.match(pattern);
  if (match) {
    return match[1].trim().split('\n').filter(l => l.trim()).slice(0, 10).join('\n');
  }

  // Fallback: first paragraph after first heading
  const firstParagraph = markdown.match(/^#+[^\n]+\n+([\s\S]*?)(?:\n\n|\n#)/);
  if (firstParagraph) {
    return firstParagraph[1].trim().split('\n').slice(0, 5).join('\n');
  }

  return '';
}

/** Detect overall health from markdown content. */
function detectOverallHealth(markdown: string): 'healthy' | 'degraded' | 'critical' | undefined {
  const healthMatch = markdown.match(/Overall\s+health:\s*(Healthy|Degraded|Critical)/i);
  if (healthMatch) {
    return healthMatch[1].toLowerCase() as 'healthy' | 'degraded' | 'critical';
  }
  return undefined;
}

/** Parse capability markdown output into structured ReportData. */
export function parseMarkdown(
  markdown: string,
  options: { title: string; capability: string; instanceName: string; instanceUrl: string }
): ReportData {
  const lines = markdown.split('\n');
  const sections: ReportSection[] = [];
  const allFindings: ReportFinding[] = [];

  let currentSection: ReportSection | null = null;
  let currentCategory = 'General';
  let tableLines: string[] = [];
  let inTable = false;
  let findingContextLines: string[] = [];
  let lastFinding: ReportFinding | null = null;

  const flushTable = () => {
    if (inTable && tableLines.length > 0 && currentSection) {
      const table = parseTable(tableLines);
      if (table) currentSection.tables.push(table);
      tableLines = [];
      inTable = false;
    }
  };

  const flushFindingContext = () => {
    if (lastFinding && findingContextLines.length > 0) {
      enrichFinding(lastFinding, findingContextLines);
      findingContextLines = [];
    }
    lastFinding = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section header
    const sectionMatch = line.match(SECTION_PATTERN);
    if (sectionMatch && !inTable) {
      flushTable();
      flushFindingContext();

      currentCategory = sectionMatch[1].trim();
      currentSection = {
        title: currentCategory,
        content: '',
        findings: [],
        tables: [],
      };
      sections.push(currentSection);
      continue;
    }

    // Table detection
    if (line.trim().startsWith('|')) {
      if (TABLE_SEPARATOR.test(line) && tableLines.length === 1) {
        inTable = true;
        tableLines.push(line);
        continue;
      }
      if (inTable || tableLines.length === 0) {
        tableLines.push(line);
        if (!inTable && tableLines.length === 1) continue; // Wait for separator
        continue;
      }
    } else if (inTable) {
      flushTable();
    } else if (tableLines.length > 0) {
      // Single pipe line that wasn't followed by separator — not a table
      tableLines = [];
    }

    // Finding detection
    const finding = parseFinding(line, currentCategory);
    if (finding) {
      flushFindingContext();
      lastFinding = finding;
      allFindings.push(finding);
      if (currentSection) currentSection.findings.push(finding);
      continue;
    }

    // Context lines for findings (evidence, impact, recommendation)
    if (lastFinding && line.match(/^\s+(?:[-*]\s*)?(?:\*\*)?(Evidence|Impact|Recommendation|Effort):/i)) {
      findingContextLines.push(line);
      continue;
    } else if (lastFinding && line.trim() === '') {
      flushFindingContext();
    }

    // Regular content
    if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  flushTable();
  flushFindingContext();

  // Build metrics
  const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const categoryBreakdown: Record<string, number> = {};

  for (const f of allFindings) {
    severityCounts[f.severity]++;
    categoryBreakdown[f.category] = (categoryBreakdown[f.category] || 0) + 1;
  }

  // Every finding gets an ID (its own, or a stable one derived from the title) and a record URL when it has one.
  const seen = new Set<string>();
  for (const f of allFindings) {
    let id = f.id || derivedFindingId(options.capability, f.title);
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    f.id = id;
    if (f.table && f.sysId) f.recordUrl = `${options.instanceUrl.replace(/\/$/, '')}/${f.table}.do?sys_id=${f.sysId}`;
  }

  const { score, areaScores } = parseScores(markdown);
  const health = detectOverallHealth(markdown) ?? (score === undefined ? undefined : score >= 80 ? 'healthy' : score >= 60 ? 'degraded' : 'critical');
  const metrics: ReportMetrics = {
    severityCounts,
    categoryBreakdown,
    totalFindings: allFindings.length,
    overallHealth: health,
    ...(score !== undefined ? { score } : {}),
    ...(areaScores.length ? { areaScores } : {}),
  };

  return {
    title: options.title,
    capability: options.capability,
    instanceName: options.instanceName,
    instanceUrl: options.instanceUrl,
    scanDate: new Date().toISOString().split('T')[0],
    executiveSummary: extractExecutiveSummary(markdown),
    metrics,
    sections,
    findings: allFindings,
    rawMarkdown: markdown,
  };
}
