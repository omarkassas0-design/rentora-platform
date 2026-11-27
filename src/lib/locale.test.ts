import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatNumber, uiText } from './locale';

describe('language-specific formatting', () => {
  it('uses Latin digits for English numbers and currency', () => {
    expect(formatNumber(123456, {}, 'en')).toBe('123,456');
    expect(formatCurrency(1234, 'USD', 'en')).toContain('1,234');
  });

  it('uses Arabic-Indic digits for Arabic numbers and currency', () => {
    expect(formatNumber(123456, {}, 'ar')).toBe('١٢٣٬٤٥٦');
    expect(formatCurrency(1234, 'SYP', 'ar')).toContain('١٬٢٣٤');
  });

  it('localizes digits in translated interface labels only', () => {
    expect(uiText('92% fleet active', 'ar')).toContain('٩٢٪');
    expect(uiText('92% fleet active', 'en')).toContain('92%');
  });

  it('formats dates using the selected interface locale', () => {
    const date = new Date('2026-11-27T12:00:00.000Z');
    expect(formatDate(date, { year: 'numeric' }, 'en')).toContain('2026');
    expect(formatDate(date, { year: 'numeric' }, 'ar')).toContain('٢٠٢٦');
  });
});
