/**
 * Price rules for Bro Code Gaming Zone.
 *
 * Owner's rate card:
 *   Gaming PC      : Rs.70 per hour, Rs.50 per 30 minutes
 *   PlayStation 5  : Rs.150 per hour, Rs.100 per 30 minutes
 *   PS5 controller : Rs.100 solo · Rs.160 duo · Rs.240 trio · Rs.320 squad
 *                    (Rs.100 solo, then Rs.80 per additional player)
 *                    Charged once per booking, no matter how long you play.
 *   PS5 squad deal : 4 players all in — Rs.320 (1 hr) · Rs.600 (2 hrs) · Rs.900 (3 hrs)
 *
 * Any booking is billed as (full hours x hourly rate) + (Rs.50 / Rs.100 for a
 * leftover half hour), so longer sessions are better value.
 */

import { STATION_TYPES } from './config.js';

export const PRICING = {
  PC: {
    type: 'PC',
    label: STATION_TYPES.PC.label,
    hourly: 70,
    halfHour: 50,
    perPerson: 0,
    durations: [30, 60, 90, 120, 180, 240],
    perks: [
      'RTX 5060 graphics card | 240Hz',
      'Valorant, CS2, BGMI, GTA V, FIFA',
      'Headset + mechanical keyboard included',
    ],
  },
  PS5: {
    type: 'PS5',
    label: STATION_TYPES.PS5.label,
    hourly: 150,
    halfHour: 100,
    durations: [30, 60, 90, 120, 180],
    playerCharge: {
      solo: 100,
      perPerson: 80,
      maxPlayers: 4,
    },
    // All-in party deals: console time + up to 4 controllers for one flat price.
    squadPackages: [
      { players: 4, minutes: 60, price: 320 },
      { players: 4, minutes: 120, price: 600 },
      { players: 4, minutes: 180, price: 900 },
    ],
    perks: [
      'PS5 Slim on a 4K 120Hz TV',
      'Wheel simulator — Forza Horizon 5, Need for Speed, Gran Turismo and more',
      'FIFA 26, Tekken 8, WWE 2K · Extra DualSense controllers available',
    ],
  },
};

export function getPlan(type) {
  return PRICING[type] || null;
}

export function isValidDuration(type, minutes) {
  const plan = getPlan(type);
  return Boolean(plan && plan.durations.includes(Number(minutes)));
}

/** Time-only price for the station. */
export function timePrice(type, minutes) {
  const plan = getPlan(type);
  if (!plan) return 0;
  const mins = Number(minutes);
  const hours = Math.floor(mins / 60);
  const leftover = mins % 60;
  let total = hours * plan.hourly;
  if (leftover >= 30) total += plan.halfHour;
  return Math.round(total);
}

/** PS5 controller / per-player charge. PCs are always Rs.0. */
export function playerCharge(type, players) {
  const plan = getPlan(type);
  if (!plan || !plan.playerCharge) return 0;
  const count = Math.max(1, Number(players) || 1);
  const { solo, perPerson } = plan.playerCharge;
  return count === 1 ? solo : perPerson * count;
}

export function maxPlayers(type) {
  const plan = getPlan(type);
  return plan && plan.playerCharge ? plan.playerCharge.maxPlayers : 1;
}

/** Matching all-in squad deal (4 players), or null when none applies. */
export function squadPackage(type, minutes, players) {
  const plan = getPlan(type);
  if (!plan || !plan.squadPackages) return null;
  const count = Math.max(1, Number(players) || 1);
  return plan.squadPackages.find(
    (pkg) => pkg.players === count && pkg.minutes === Number(minutes),
  ) || null;
}

/** Full quote for a booking. Squad deals are all-in, so nothing extra is added. */
export function quote(type, minutes, players = 1) {
  const count = type === 'PS5' ? Math.max(1, Number(players) || 1) : 1;
  const pkg = squadPackage(type, minutes, count);
  if (pkg) {
    return {
      timePrice: pkg.price,
      playerCharge: 0,
      total: pkg.price,
      players: count,
      squadPackage: true,
    };
  }
  const time = timePrice(type, minutes);
  const charge = playerCharge(type, players);
  return {
    timePrice: time,
    playerCharge: charge,
    total: time + charge,
    players: count,
    squadPackage: false,
  };
}

/** Rate card in a shape the front end can render directly. */
export function rateCard() {
  return Object.values(PRICING).map((plan) => ({
    type: plan.type,
    label: plan.label,
    hourly: plan.hourly,
    halfHour: plan.halfHour,
    durations: plan.durations,
    perks: plan.perks,
    playerCharge: plan.playerCharge || null,
    squadPackages: plan.squadPackages || null,
    table: plan.durations.map((minutes) => ({
      minutes,
      label: formatDuration(minutes),
      price: timePrice(plan.type, minutes),
    })),
  }));
}

export function formatDuration(minutes) {
  const mins = Number(minutes);
  if (mins < 60) return `${mins} mins`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  const hourLabel = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return rest ? `${hourLabel} ${rest} mins` : hourLabel;
}

export function formatMoney(amount) {
  return `Rs.${Number(amount).toLocaleString('en-IN')}`;
}
