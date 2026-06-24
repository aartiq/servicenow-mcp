import { describe, it, expect } from 'vitest';
import { severityPieChart, categoryBarChart } from '../../src/reports/charts.js';

describe('severityPieChart', () => {
  it('generates valid SVG string', () => {
    const counts = { critical: 2, high: 3, medium: 5, low: 1, info: 4 };
    const svg = severityPieChart(counts);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes pie slices as paths', () => {
    const counts = { critical: 2, high: 3, medium: 0, low: 0, info: 0 };
    const svg = severityPieChart(counts);
    expect(svg).toContain('<path');
    expect(svg).toContain('#E8466A'); // critical color
    expect(svg).toContain('#FF6B35'); // high color
  });

  it('handles all-zero counts', () => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const svg = severityPieChart(counts);
    expect(svg).toContain('No findings');
  });

  it('handles single severity', () => {
    const counts = { critical: 5, high: 0, medium: 0, low: 0, info: 0 };
    const svg = severityPieChart(counts);
    expect(svg).toContain('<path');
    expect(svg).toContain('#E8466A');
  });

  it('accepts custom size parameter', () => {
    const counts = { critical: 1, high: 1, medium: 1, low: 1, info: 1 };
    const svg = severityPieChart(counts, 300);
    expect(svg).toContain('width="300"');
  });
});

describe('categoryBarChart', () => {
  it('generates valid SVG string', () => {
    const breakdown = { 'Plugin Status': 3, 'Scheduled Jobs': 5, 'System Properties': 1 };
    const svg = categoryBarChart(breakdown);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('includes bars as rects', () => {
    const breakdown = { 'Plugin Status': 3, 'System Properties': 1 };
    const svg = categoryBarChart(breakdown);
    expect(svg).toContain('<rect');
    expect(svg).toContain('#00D4AA'); // teal brand color
  });

  it('handles empty breakdown', () => {
    const svg = categoryBarChart({});
    expect(svg).toContain('No categories');
  });

  it('truncates long category names', () => {
    const breakdown = { 'Very Long Category Name That Exceeds Limit': 5 };
    const svg = categoryBarChart(breakdown);
    expect(svg).toContain('...');
  });

  it('sorts categories by count descending', () => {
    const breakdown = { 'A': 1, 'B': 10, 'C': 5 };
    const svg = categoryBarChart(breakdown);
    // B should appear first (top) in the SVG
    const bPos = svg.indexOf('>B<');
    const cPos = svg.indexOf('>C<');
    const aPos = svg.indexOf('>A<');
    expect(bPos).toBeLessThan(cPos);
    expect(cPos).toBeLessThan(aPos);
  });
});
