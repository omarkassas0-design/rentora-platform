import { describe, expect, it } from 'vitest';
import { calendarDates, isSafeCmsImage, isSafeCmsLink, validatePlatformSetting } from './operationalValidation';

describe('calendarDates', () => {
  it('returns the selected day at midnight', () => {
    const [day] = calendarDates(new Date(2026, 10, 26, 17, 45), 'day');
    expect(day).toEqual(new Date(2026, 10, 26));
  });

  it('returns a Monday through Sunday week for a Thursday anchor', () => {
    const week = calendarDates(new Date(2026, 10, 26), 'week');
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual(new Date(2026, 10, 23));
    expect(week[6]).toEqual(new Date(2026, 10, 29));
  });

  it('builds a complete 42-day month grid beginning on Monday', () => {
    const month = calendarDates(new Date(2026, 10, 26), 'month');
    expect(month).toHaveLength(42);
    expect(month[0].getDay()).toBe(1);
    expect(month[35].getTime() - month[34].getTime()).toBe(86_400_000);
    expect(month.some(date => date.getMonth() === 10 && date.getDate() === 1)).toBe(true);
  });
});

describe('platform setting validation', () => {
  it.each([0, 0.1, 1])('accepts valid commission rates including %s', rate => {
    expect(validatePlatformSetting('platform_commission_rate', rate)).toBeNull();
  });

  it.each([-0.01, 1.01, Number.NaN])('rejects invalid tax rates including %s', rate => {
    expect(validatePlatformSetting('tax_rate', rate)).toContain('between 0 and 1');
  });

  it('accepts an unset exchange rate and rejects non-positive rates', () => {
    expect(validatePlatformSetting('syp_per_usd', null)).toBeNull();
    expect(validatePlatformSetting('syp_per_usd', 0)).toContain('greater than 0');
  });

  it('validates booking duration and every configured fee', () => {
    expect(validatePlatformSetting('booking_rules', { minimum_hours: 4, maximum_days: 60, delivery_fee: 0, insurance_per_day: 8, extra_driver_per_day: 5, late_fee_per_hour: 10 })).toBeNull();
    expect(validatePlatformSetting('booking_rules', { minimum_hours: 0, maximum_days: 60 })).toContain('duration');
    expect(validatePlatformSetting('booking_rules', { minimum_hours: 4, maximum_days: 60, delivery_fee: -1 })).toContain('delivery_fee');
    expect(validatePlatformSetting('booking_rules', [])).toContain('JSON object');
  });

  it('requires language codes in an array', () => {
    expect(validatePlatformSetting('supported_languages', ['en', 'ar'])).toBeNull();
    expect(validatePlatformSetting('supported_languages', 'en')).toContain('array');
    expect(validatePlatformSetting('supported_languages', [''])).toContain('array');
  });
});

describe('CMS URL validation', () => {
  it('accepts secure and site-relative links', () => {
    expect(isSafeCmsLink('/cars')).toBe(true);
    expect(isSafeCmsLink('https://rentora.example/offers')).toBe(true);
  });

  it('rejects protocol-relative and executable links', () => {
    expect(isSafeCmsLink('//example.com')).toBe(false);
    expect(isSafeCmsLink('javascript:alert(1)')).toBe(false);
    expect(isSafeCmsLink('http://example.com')).toBe(false);
  });

  it('accepts only secure image URLs', () => {
    expect(isSafeCmsImage('https://cdn.example/image.webp')).toBe(true);
    expect(isSafeCmsImage('/image.webp')).toBe(false);
    expect(isSafeCmsImage('http://cdn.example/image.webp')).toBe(false);
  });
});
