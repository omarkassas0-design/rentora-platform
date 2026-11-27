import { z } from 'zod';
import type { Vehicle } from './domain';

export const quoteRequestSchema = z.object({
  start: z.string().min(1), end: z.string().min(1), delivery: z.boolean().default(false), insurance: z.boolean().default(false), extraDriver: z.boolean().default(false), coupon: z.string().optional(),
}).refine(({ start, end }) => new Date(end) > new Date(start), { message: 'Return must be after pickup', path: ['end'] });

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type Quote = { days: number; rate: number; rental: number; delivery: number; insurance: number; extraDriver: number; discount: number; serviceFee: number; tax: number; total: number; deposit: number };

export function calculateQuote(vehicle: Vehicle, input: QuoteRequest): Quote {
  const request = quoteRequestSchema.parse(input);
  const duration = new Date(request.end).getTime() - new Date(request.start).getTime();
  const days = Math.max(1, Math.ceil(duration / 86_400_000));
  const months = Math.floor(days / 30);
  const remainder = days % 30;
  const weeks = Math.floor(remainder / 7);
  const remaining = remainder % 7;
  const rate = vehicle.price;
  const rental = (months > 0 && vehicle.monthlyPrice ? months * vehicle.monthlyPrice : 0) + (weeks > 0 && vehicle.weeklyPrice ? weeks * vehicle.weeklyPrice + remaining * rate : months > 0 ? remainder * rate : days * rate);
  const delivery = request.delivery ? 18 : 0;
  const insurance = request.insurance ? days * 8 : 0;
  const extraDriver = request.extraDriver ? days * 5 : 0;
  const serviceFee = Math.round((rental + delivery + insurance + extraDriver) * 0.04);
  const discount = request.coupon?.trim().toUpperCase() === 'WELCOME10' ? Math.round(rental * 0.1) : 0;
  const tax = 0;
  const total = rental + delivery + insurance + extraDriver + serviceFee + tax - discount;
  return { days, rate, rental, delivery, insurance, extraDriver, discount, serviceFee, tax, total, deposit: vehicle.deposit };
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}
