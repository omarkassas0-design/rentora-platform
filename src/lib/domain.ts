export type City = { id: string; name: string; ar: string; region: string };
export type Office = { id: string; name: string; city: string; rating: number; reviews: number; verified: boolean; address: string; initials: string; accent: string; fleet: number; response: string };
export type Vehicle = { id: string; name: string; make: string; model: string; year: number; category: string; transmission: 'Automatic' | 'Manual'; fuel: 'Petrol' | 'Diesel' | 'Hybrid' | 'Electric'; seats: number; price: number; weeklyPrice?: number; monthlyPrice?: number; deposit: number; dailyPriceSyp?: number; weeklyPriceSyp?: number; monthlyPriceSyp?: number; depositSyp?: number; officeId: string; officeName?: string; city: string; rating: number; reviews: number; color: string; imageUrl?: string; popular?: boolean; available?: boolean; status?: 'draft' | 'available' | 'rented' | 'maintenance' | 'archived'; mileage: string };
export type BookingStatus = 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled' | 'rejected';
export type Booking = { id: string; number?: string; customer: string; vehicleId: string; officeId: string; pickup: string; dropoff: string; start: string; end: string; status: BookingStatus; total: number };

export const cities: City[] = [
  { id: 'damascus', name: 'Damascus', ar: 'دمشق', region: 'Damascus Governorate' },
  { id: 'aleppo', name: 'Aleppo', ar: 'حلب', region: 'Aleppo Governorate' },
  { id: 'latakia', name: 'Latakia', ar: 'اللاذقية', region: 'Latakia Governorate' },
  { id: 'homs', name: 'Homs', ar: 'حمص', region: 'Homs Governorate' },
  { id: 'tartus', name: 'Tartus', ar: 'طرطوس', region: 'Tartus Governorate' },
  { id: 'hama', name: 'Hama', ar: 'حماة', region: 'Hama Governorate' },
  { id: 'idlib', name: 'Idlib', ar: 'إدلب', region: 'Idlib Governorate' },
];

export const offices: Office[] = [
  { id: 'levant-mobility', name: 'Levant Mobility', city: 'Damascus', rating: 4.9, reviews: 284, verified: true, address: 'Mezzeh, Damascus', initials: 'LM', accent: '#c8f169', fleet: 18, response: 'Usually replies in 12 min' },
  { id: 'cedar-drive', name: 'Cedar Drive Co.', city: 'Aleppo', rating: 4.8, reviews: 196, verified: true, address: 'Al-Aziziyeh, Aleppo', initials: 'CD', accent: '#d8d9ff', fleet: 24, response: 'Usually replies in 20 min' },
  { id: 'coastline-cars', name: 'Coastline Cars', city: 'Latakia', rating: 4.9, reviews: 157, verified: true, address: 'Corniche, Latakia', initials: 'CC', accent: '#c4e9ef', fleet: 15, response: 'Usually replies in 15 min' },
  { id: 'mosaic-rentals', name: 'Mosaic Rentals', city: 'Homs', rating: 4.7, reviews: 112, verified: true, address: 'Al-Hamra, Homs', initials: 'MR', accent: '#f6d5be', fleet: 12, response: 'Usually replies in 30 min' },
  { id: 'blue-cedar', name: 'Blue Cedar Rent a Car', city: 'Tartus', rating: 4.8, reviews: 93, verified: true, address: 'City Center, Tartus', initials: 'BC', accent: '#cae4cb', fleet: 14, response: 'Usually replies in 18 min' },
  { id: 'hama-auto', name: 'Hama Auto Club', city: 'Hama', rating: 4.6, reviews: 76, verified: true, address: 'Al-Jalaa, Hama', initials: 'HA', accent: '#f0d6f2', fleet: 9, response: 'Usually replies in 25 min' },
];

const catalogue: Array<[string, string, number, string, number, number, string, string, number]> = [
  ['Toyota', 'Camry', 2023, 'Comfort', 48, 5, 'Automatic', 'Petrol', 350], ['Hyundai', 'Tucson', 2022, 'SUV', 62, 5, 'Automatic', 'Petrol', 450],
  ['Kia', 'Sportage', 2023, 'SUV', 58, 5, 'Automatic', 'Petrol', 400], ['Mercedes-Benz', 'C-Class', 2022, 'Premium', 105, 5, 'Automatic', 'Petrol', 700],
  ['Toyota', 'Corolla', 2021, 'Economy', 32, 5, 'Automatic', 'Petrol', 250], ['Hyundai', 'Elantra', 2022, 'Comfort', 39, 5, 'Automatic', 'Petrol', 280],
  ['BMW', '3 Series', 2023, 'Premium', 120, 5, 'Automatic', 'Petrol', 800], ['Nissan', 'Sunny', 2020, 'Economy', 26, 5, 'Manual', 'Petrol', 200],
  ['Toyota', 'Land Cruiser', 2022, 'SUV', 145, 7, 'Automatic', 'Petrol', 1000], ['Kia', 'Picanto', 2021, 'Economy', 28, 5, 'Automatic', 'Petrol', 220],
  ['Audi', 'A4', 2022, 'Premium', 98, 5, 'Automatic', 'Petrol', 650], ['Mitsubishi', 'Outlander', 2021, 'SUV', 72, 7, 'Automatic', 'Petrol', 500],
  ['Hyundai', 'Accent', 2020, 'Economy', 29, 5, 'Manual', 'Petrol', 200], ['Toyota', 'RAV4', 2023, 'SUV', 78, 5, 'Automatic', 'Hybrid', 550],
  ['Volkswagen', 'Passat', 2021, 'Comfort', 52, 5, 'Automatic', 'Diesel', 380], ['Lexus', 'ES 350', 2023, 'Premium', 130, 5, 'Automatic', 'Petrol', 900],
  ['Renault', 'Duster', 2022, 'SUV', 55, 5, 'Manual', 'Petrol', 380], ['Toyota', 'Yaris', 2021, 'Economy', 31, 5, 'Automatic', 'Petrol', 230],
  ['Mercedes-Benz', 'Vito', 2021, 'Van', 110, 8, 'Automatic', 'Diesel', 750], ['Chevrolet', 'Captiva', 2022, 'SUV', 68, 7, 'Automatic', 'Petrol', 480],
  ['Skoda', 'Octavia', 2022, 'Comfort', 44, 5, 'Automatic', 'Petrol', 330], ['Jeep', 'Grand Cherokee', 2021, 'SUV', 125, 5, 'Automatic', 'Petrol', 850],
  ['Honda', 'Civic', 2022, 'Comfort', 51, 5, 'Automatic', 'Petrol', 370], ['Porsche', 'Macan', 2023, 'Premium', 180, 5, 'Automatic', 'Petrol', 1250],
];

export const vehicles: Vehicle[] = catalogue.map(([make, model, year, category, price, seats, transmission, fuel, deposit], index) => {
  const office = offices[index % offices.length];
  return { id: `car-${index + 1}`, name: `${make} ${model}`, make, model, year, category, price, weeklyPrice: Math.round(price * 6.3), monthlyPrice: Math.round(price * 26), seats, transmission: transmission as Vehicle['transmission'], fuel: fuel as Vehicle['fuel'], deposit, officeId: office.id, city: office.city, rating: Number((4.65 + (index % 4) * 0.08).toFixed(1)), reviews: 18 + (index * 13) % 137, color: ['#e6e9e6', '#dde3e9', '#e6ddcf', '#dce8e7', '#dcddeb'][index % 5], popular: index < 6, available: true, status: 'available', mileage: '250 km/day included' };
});

export const initialBookings: Booking[] = [
  { id: 'RN-2048', customer: 'Omar Haddad', vehicleId: 'car-2', officeId: 'levant-mobility', pickup: 'Damascus Airport', dropoff: 'Mezzeh, Damascus', start: '2026-11-26', end: '2026-11-29', status: 'confirmed', total: 186 },
  { id: 'RN-2047', customer: 'Lina Saleh', vehicleId: 'car-5', officeId: 'cedar-drive', pickup: 'Aleppo City', dropoff: 'Aleppo City', start: '2026-11-25', end: '2026-11-27', status: 'active', total: 64 },
  { id: 'RN-2046', customer: 'Yazan Mahmoud', vehicleId: 'car-4', officeId: 'coastline-cars', pickup: 'Latakia Port', dropoff: 'Latakia Port', start: '2026-11-24', end: '2026-11-26', status: 'pending', total: 210 },
  { id: 'RN-2045', customer: 'Maya Khalil', vehicleId: 'car-10', officeId: 'mosaic-rentals', pickup: 'Homs City', dropoff: 'Homs City', start: '2026-11-22', end: '2026-11-24', status: 'completed', total: 56 },
  { id: 'RN-2044', customer: 'Samir Nasser', vehicleId: 'car-9', officeId: 'blue-cedar', pickup: 'Tartus City', dropoff: 'Tartus City', start: '2026-11-28', end: '2026-12-02', status: 'confirmed', total: 580 },
  { id: 'RN-2043', customer: 'Rana Faris', vehicleId: 'car-1', officeId: 'hama-auto', pickup: 'Hama City', dropoff: 'Hama City', start: '2026-11-30', end: '2026-12-03', status: 'pending', total: 144 },
  { id: 'RN-2042', customer: 'Tarek Abbas', vehicleId: 'car-6', officeId: 'levant-mobility', pickup: 'Damascus City', dropoff: 'Damascus City', start: '2026-11-19', end: '2026-11-21', status: 'completed', total: 78 },
  { id: 'RN-2041', customer: 'Dima Ismail', vehicleId: 'car-13', officeId: 'cedar-drive', pickup: 'Aleppo Airport', dropoff: 'Aleppo Airport', start: '2026-11-17', end: '2026-11-20', status: 'cancelled', total: 87 },
];

export const monthRevenue = [
  { month: 'Jun', revenue: 3240, bookings: 42 }, { month: 'Jul', revenue: 4160, bookings: 56 }, { month: 'Aug', revenue: 3890, bookings: 51 },
  { month: 'Sep', revenue: 5270, bookings: 68 }, { month: 'Oct', revenue: 4810, bookings: 63 }, { month: 'Nov', revenue: 6240, bookings: 79 },
];

import { formatCurrency } from './locale';

export const money = (value: number, currency = 'USD') => formatCurrency(value, currency);
export const getOffice = (id: string) => offices.find((office) => office.id === id) ?? offices[0];
export const getVehicle = (id: string) => vehicles.find((vehicle) => vehicle.id === id) ?? vehicles[0];
