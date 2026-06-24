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
}

export interface ReportMetrics {
  severityCounts: Record<Severity, number>;
  categoryBreakdown: Record<string, number>;
  totalFindings: number;
  overallHealth?: 'healthy' | 'degraded' | 'critical';
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
}

export type ReportFormat = 'pdf' | 'pptx' | 'md';

export interface ReportOptions {
  title: string;
  instanceUrl: string;
  instanceName: string;
  capability?: string;
  outputDir?: string;
}

export interface ReportResult {
  filePath: string;
  sizeBytes: number;
}
