/**
 * Markdown → ReportData parser.
 * Extracts sections, findings, tables, and metrics from capability output.
 */
import type { ReportData, ReportSection, ReportFinding, ReportTable, ReportMetrics, Severity } from './types.js';

const SEVERITY_PATTERN = /\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]/i;
const SECTION_PATTERN = /^#{1,3}\s+(?:\d+\.\s*)?(.+)$/;
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;

/** Parse a line of markdown for a severity-tagged finding. */
function parseFinding(line: string, category: string): ReportFinding | null {
  const match = line.match(SEVERITY_PATTERN);
  if (!match) return null;

  const severity = match[1].toLowerCase() as Severity;
  // Remove the severity tag and clean up the line
  const rest = line.replace(SEVERITY_PATTERN, '').replace(/^[\s\-*]+/, '').trim();

  // Try to split on common delimiters: " — ", " - ", ": "
  const parts = rest.split(/\s+[—\-]\s+/);
  const title = parts[0]?.trim() || rest;
  const description = parts.slice(1).join(' — ').trim() || title;

  return {
    severity,
    category,
    title,
    description,
  };
}

/** Parse evidence, impact, recommendation from indented lines following a finding. */
function enrichFinding(finding: ReportFinding, lines: string[]): void {
  for (const line of lines) {
    const trimmed = line.trim();
    const evidenceMatch = trimmed.match(/^Evidence:\s*(.+)/i);
    if (evidenceMatch) {
      finding.evidence = evidenceMatch[1].trim();
      continue;
    }
    const impactMatch = trimmed.match(/^Impact:\s*(.+)/i);
    if (impactMatch) {
      finding.impact = impactMatch[1].trim();
      continue;
    }
    const recMatch = trimmed.match(/^Recommendation:\s*(.+)/i);
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
    if (lastFinding && line.match(/^\s+(Evidence|Impact|Recommendation):/i)) {
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

  const metrics: ReportMetrics = {
    severityCounts,
    categoryBreakdown,
    totalFindings: allFindings.length,
    overallHealth: detectOverallHealth(markdown),
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
