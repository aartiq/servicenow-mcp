import { describe, it, expect } from 'vitest';
import { linkifyTextPdf } from '../../src/reports/brand.js';

describe('linkifyTextPdf markdown bold', () => {
  it('renders **bold** as a bold run without asterisks', () => {
    const runs = linkifyTextPdf('**The KEV date was missed.** All items closed.', 'https://example.service-now.com');
    expect(Array.isArray(runs)).toBe(true);
    expect(runs[0]).toMatchObject({ text: 'The KEV date was missed.', bold: true });
    expect(JSON.stringify(runs)).not.toContain('**');
  });
  it('keeps plain text unchanged', () => {
    expect(linkifyTextPdf('No markers here', 'https://example.service-now.com')).toMatchObject({ text: 'No markers here' });
  });
});
