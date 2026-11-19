/**
 * Report generation data model.
 * Defines the structure used to convert capability markdown output
 * into branded PDF and PPTX reports.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ReportFinding {
  severity: Severity;
  category: string;
  title: string;
  description: string;
  evidence?: string;
  impact?: string;
  recommendation?: string;
  /** ServiceNow table name (for building record links) */
  table?: string;
  /** ServiceNow record sys_id (for building record links) */
  sysId?: string;
  /** Stable finding ID, e.g. "ACL-03" (from the report, or derived from the title). */
  id?: string;
  /** Effort to fix: S, M or L, plus any note. */
  effort?: string;
  /** Record URL taken from the evidence or title, if any. */
  recordUrl?: string;
}

export interface ReportMetrics {
  severityCounts: Record<Severity, number>;
  categoryBreakdown: Record<string, number>;
  totalFindings: number;
  overallHealth?: 'healthy' | 'degraded' | 'critical';
  /** Overall 0 to 100 score from a "Score: NN/100" line. */
  score?: number;
  /** Per-area scores from "Area score: <area> NN/100" lines. */
  areaScores?: Array<{ area: string; score: number }>;
}

export interface ReportTable {
  headers: string[];
  rows: string[][];
}

export interface ReportSection {
  title: string;
  content: string;
  findings: ReportFinding[];
  tables: ReportTable[];
}

export interface ReportData {
  title: string;
  capability: string;
  instanceName: string;
  instanceUrl: string;
  scanDate: string;
  executiveSummary: string;
  metrics: ReportMetrics;
  sections: ReportSection[];
  findings: ReportFinding[];
  rawMarkdown: string;
  /** Resolved white-label branding used by the generators. */
  brand?: BrandKit;
}

export type ReportFormat = 'pdf' | 'pptx' | 'md';

export interface ReportOptions {
  title: string;
  instanceUrl: string;
  instanceName: string;
  capability?: string;
  outputDir?: string;
  /** White-label branding overrides (company, accent colour, logo). Falls back to NowAIKit. */
  brand?: BrandOverrides;
}

/** Caller-supplied branding overrides (CLI flags / env / SDK). */
export interface BrandOverrides {
  company?: string;
  accentColor?: string;
  /** Base64 PNG (no data: prefix). */
  logoBase64?: string;
  footer?: string;
}

/** Fully resolved brand for the generators (overrides merged with NowAIKit defaults). */
export interface BrandKit {
  company: string;
  accent: string;
  logoBase64?: string;
  footer?: string;
}

export interface ReportResult {
  filePath: string;
  sizeBytes: number;
  /** Findings register written next to the report (CSV and JSON). */
  registerPaths?: { csv: string; json: string };
}
