import { describe, expect, it } from 'vitest';
import { calculateQuote, overlaps } from './pricing';
import { vehicles } from './domain';

describe('rental quote', () => {
  it('charges a minimum one day and itemizes fees', () => {
    const quote = calculateQuote(vehicles[0], { start: '2026-12-01T00:00:00Z', end: '2026-12-01T03:00:00Z', delivery: false, insurance: false, extraDriver: false });
    expect(quote.days).toBe(1);
    expect(quote.total).toBeGreaterThan(quote.rental);
    expect(quote.deposit).toBe(350);
  });
  it('applies weekly pricing and a validated discount', () => {
    const quote = calculateQuote(vehicles[0], { start: '2026-12-01', end: '2026-12-10', delivery: true, insurance: true, extraDriver: true, coupon: 'welcome10' });
    expect(quote.days).toBe(9);
    expect(quote.rental).toBe(vehicles[0].weeklyPrice! + 2 * 48);
    expect(quote.discount).toBeGreaterThan(0);
  });
  it('detects half-open overlapping intervals', () => {
    expect(overlaps('2026-12-01', '2026-12-04', '2026-12-03', '2026-12-05')).toBe(true);
    expect(overlaps('2026-12-01', '2026-12-04', '2026-12-04', '2026-12-06')).toBe(false);
  });
});
