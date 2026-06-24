/**
 * Zero-dependency SVG chart generators for PDF reports.
 * pdfmake supports SVG natively — no canvas/browser needed.
 * pptxgenjs has its own chart API, so these are PDF-only.
 */
import type { Severity } from './types.js';
import { severityColor, BRAND } from './brand.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** Escape XML special characters for safe SVG text content. */
function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Generate an SVG pie chart for severity distribution. */
export function severityPieChart(
  counts: Record<Severity, number>,
  size = 200
): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 10}" fill="${BRAND.grayLight}" />
      <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dy="4" font-size="12" fill="${BRAND.textLight}">No findings</text>
    </svg>`;
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 10;
  let startAngle = -Math.PI / 2; // Start from top

  const paths: string[] = [];
  const labels: string[] = [];

  for (const sev of SEVERITY_ORDER) {
    const count = counts[sev];
    if (count === 0) continue;

    const sliceAngle = (count / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const color = severityColor(sev);

    paths.push(
      `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}" stroke="white" stroke-width="1.5"/>`
    );

    // Label at midpoint of arc
    const midAngle = startAngle + sliceAngle / 2;
    const labelRadius = radius * 0.65;
    const lx = cx + labelRadius * Math.cos(midAngle);
    const ly = cy + labelRadius * Math.sin(midAngle);
    const pct = Math.round((count / total) * 100);
    if (pct >= 5) {
      labels.push(
        `<text x="${lx}" y="${ly}" text-anchor="middle" dy="4" font-size="10" font-weight="bold" fill="white">${count}</text>`
      );
    }

    startAngle = endAngle;
  }

  // Legend
  const legendY = size + 8;
  const legendItems = SEVERITY_ORDER
    .filter(s => counts[s] > 0)
    .map((sev, i) => {
      const x = 10 + (i % 3) * 70;
      const y = legendY + Math.floor(i / 3) * 16;
      return `<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${severityColor(sev)}"/>
        <text x="${x + 14}" y="${y + 9}" font-size="9" fill="${BRAND.text}">${escXml(sev.charAt(0).toUpperCase() + sev.slice(1))} (${counts[sev]})</text>`;
    });

  const legendHeight = Math.ceil(SEVERITY_ORDER.filter(s => counts[s] > 0).length / 3) * 16 + 8;
  const totalHeight = size + legendHeight + 12;

  return `<svg width="${size}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
    ${paths.join('\n    ')}
    ${labels.join('\n    ')}
    ${legendItems.join('\n    ')}
  </svg>`;
}

/** Generate an SVG horizontal bar chart for category breakdown. */
export function categoryBarChart(
  breakdown: Record<string, number>,
  width = 300,
  barHeight = 22
): string {
  const entries = Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Top 10 categories

  if (entries.length === 0) {
    return `<svg width="${width}" height="40" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="20" text-anchor="middle" font-size="12" fill="${BRAND.textLight}">No categories</text>
    </svg>`;
  }

  const maxValue = Math.max(...entries.map(e => e[1]));
  const labelWidth = 120;
  const chartWidth = width - labelWidth - 40;
  const padding = 4;
  const totalHeight = entries.length * (barHeight + padding) + 10;

  const bars = entries.map(([category, count], i) => {
    const y = i * (barHeight + padding) + 5;
    const barW = Math.max((count / maxValue) * chartWidth, 2);
    const truncatedLabel = category.length > 18 ? category.slice(0, 16) + '...' : category;

    return `<text x="${labelWidth - 5}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="10" fill="${BRAND.text}">${escXml(truncatedLabel)}</text>
      <rect x="${labelWidth}" y="${y}" width="${barW}" height="${barHeight}" rx="3" fill="${BRAND.teal}" opacity="0.85"/>
      <text x="${labelWidth + barW + 5}" y="${y + barHeight / 2 + 4}" font-size="10" fill="${BRAND.textLight}">${count}</text>`;
  });

  return `<svg width="${width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
    ${bars.join('\n    ')}
  </svg>`;
}
