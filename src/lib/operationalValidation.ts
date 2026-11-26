export type CalendarMode = 'day' | 'week' | 'month';

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export function calendarDates(anchor: Date, mode: CalendarMode): Date[] {
  if (mode === 'day') return [startOfDay(anchor)];
  if (mode === 'week') {
    const monday = startOfDay(anchor);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

export function validatePlatformSetting(key: string, value: unknown): string | null {
  if (['platform_commission_rate', 'booking_service_fee_rate', 'tax_rate'].includes(key)) {
    const rate = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) return `${key} must be between 0 and 1.`;
  }
  if (key === 'syp_per_usd' && value !== null) {
    const rate = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100_000_000) return 'syp_per_usd must be greater than 0 and no more than 100,000,000.';
  }
  if (key === 'booking_rules') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'booking_rules must be a JSON object.';
    const rules = value as Record<string, unknown>;
    const minimumHours = Number(rules.minimum_hours ?? 0);
    const maximumDays = Number(rules.maximum_days ?? 0);
    if (!Number.isFinite(minimumHours) || minimumHours < 1 || minimumHours > 168 || !Number.isFinite(maximumDays) || maximumDays < 1 || maximumDays > 365) return 'Booking duration must be 1–168 minimum hours and 1–365 maximum days.';
    for (const field of ['delivery_fee', 'insurance_per_day', 'extra_driver_per_day', 'late_fee_per_hour']) {
      const fee = Number(rules[field] ?? -1);
      if (!Number.isFinite(fee) || fee < 0) return `${field} cannot be negative.`;
    }
  }
  if (key === 'supported_languages' && (!Array.isArray(value) || value.some(language => typeof language !== 'string' || !language.trim()))) return 'supported_languages must be an array of language codes.';
  return null;
}

export function isSafeCmsLink(value: string): boolean {
  return /^\/(?!\/)|^https:\/\//i.test(value.trim());
}

export function isSafeCmsImage(value: string): boolean {
  return /^https:\/\//i.test(value.trim());
}
