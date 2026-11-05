/**
 * Price rules for Bro Code Gaming Zone.
 *
 * Owner's rate card:
 *   Gaming PC                   : Rs.70 per hour, Rs.50 for 30 minutes
 *   PlayStation 5 (Controller)  : per hour, by group size —
 *                                 Solo Rs.100 · Duo Rs.160 · Trio Rs.240 · Squad Rs.320
 *                                 Squad of 4 deals: 2 hours Rs.600 · 3 hours Rs.900
 *   PlayStation 5 (Wheel)       : Rs.150 per hour, Rs.100 for 30 minutes
 *
 * A station is billed either by time ("time" mode, one rate for the station) or
 * by group size ("group" mode, the hourly price depends on how many play).
 * Both add the half hour rate for a leftover 30 minutes, so longer sessions
 * work out cheaper per minute.
 */

import { STATION_TYPES } from './config.js';

const GROUP_LABELS = ['Solo', 'Duo', 'Trio', 'Squad'];

export const PRICING = {
  PC: {
    type: 'PC',
    label: STATION_TYPES.PC.label,
    mode: 'time',
    hourly: 70,
    halfHour: 50,
    maxPlayers: 1,
    durations: [30, 60, 90, 120, 180, 240],
    perks: [
      'RTX 5060 graphics card | 240Hz',
      'Valorant, CS2, BGMI, GTA V, FIFA',
      'Headset + mechanical keyboard included',
    ],
  },
  PS5C: {
    type: 'PS5C',
    label: STATION_TYPES.PS5C.label,
    mode: 'group',
    // Per hour, indexed by number of players: solo, duo, trio, squad.
    groupRates: [100, 160, 240, 320],
    maxPlayers: 4,
    durations: [30, 60, 90, 120, 180],
    // Long session discounts for a full squad of 4.
    squadPackages: [
      { players: 4, minutes: 60, price: 320 },
      { players: 4, minutes: 120, price: 600 },
      { players: 4, minutes: 180, price: 900 },
    ],
    perks: [
      'PS5 Slim on a 4K 120Hz TV',
      'Solo Rs.100 per hour · Duo Rs.160 · Trio Rs.240 · Squad Rs.320',
      'FIFA 26, Tekken 8, WWE 2K · Extra DualSense controllers available',
    ],
  },
  PS5W: {
    type: 'PS5W',
    label: STATION_TYPES.PS5W.label,
    mode: 'time',
    hourly: 150,
    halfHour: 100,
    maxPlayers: 1,
    durations: [30, 60, 90, 120, 180],
    perks: [
      'Racing wheel, pedals and shifter',
      'PS5 Slim on a 4K 120Hz TV',
      'Forza Horizon 5, Need for Speed, Gran Turismo and more',
    ],
  },
};

export function getPlan(type) {
  return PRICING[type] || null;
}

/** How many people can play on this station type. */
export function maxPlayers(type) {
  const plan = getPlan(type);
  return plan ? plan.maxPlayers : 1;
}

function clampPlayers(plan, players) {
  return Math.max(1, Math.min(plan.maxPlayers, Number(players) || 1));
}

export function isValidDuration(type, minutes) {
  const plan = getPlan(type);
  return Boolean(plan && plan.durations.includes(Number(minutes)));
}

/** What one hour costs on this station for this many players. */
export function hourlyPrice(type, players = 1) {
  const plan = getPlan(type);
  if (!plan) return 0;
  if (plan.mode === 'group') return plan.groupRates[clampPlayers(plan, players) - 1];
  return plan.hourly;
}

/** Price for a stretch of time on one station. */
export function timePrice(type, minutes, players = 1) {
  const plan = getPlan(type);
  if (!plan) return 0;

  const hourly = hourlyPrice(type, players);
  const halfHour = plan.mode === 'group' ? Math.round(hourly / 2) : plan.halfHour;

  const mins = Number(minutes);
  const hours = Math.floor(mins / 60);
  const leftover = mins % 60;

  let total = hours * hourly;
  if (leftover >= 30) total += halfHour;
  return Math.round(total);
}

/** Matching all-in squad deal, or null when none applies. */
export function squadPackage(type, minutes, players) {
  const plan = getPlan(type);
  if (!plan || !plan.squadPackages) return null;
  const count = clampPlayers(plan, players);
  return plan.squadPackages.find(
    (pkg) => pkg.players === count && pkg.minutes === Number(minutes),
  ) || null;
}

/** Full quote for a booking. Squad deals are all-in, so nothing extra is added. */
export function quote(type, minutes, players = 1) {
  const plan = getPlan(type);
  if (!plan) return { total: 0, players: 1, squadPackage: false };

  const count = clampPlayers(plan, players);
  const pkg = squadPackage(type, minutes, count);
  if (pkg) return { total: pkg.price, players: count, squadPackage: true };

  return { total: timePrice(type, minutes, count), players: count, squadPackage: false };
}

/** Rate card in a shape the front end can render directly. */
export function rateCard() {
  return Object.values(PRICING).map((plan) => {
    const group = plan.mode === 'group';

    return {
      type: plan.type,
      label: plan.label,
      group,
      maxPlayers: plan.maxPlayers,
      durations: plan.durations,
      perks: plan.perks,
      hourly: group ? null : plan.hourly,
      halfHour: group ? null : plan.halfHour,
      groupRates: plan.groupRates || null,
      squadPackages: plan.squadPackages || null,
      tableHead: group ? ['Players', 'Price per hour'] : ['Play time', 'Price'],
      table: group
        ? plan.groupRates.map((price, index) => ({
            label: `${GROUP_LABELS[index]} · ${index + 1} ${index === 0 ? 'player' : 'players'}`,
            price,
          }))
        : plan.durations.map((minutes) => ({
            label: formatDuration(minutes),
            price: timePrice(plan.type, minutes),
          })),
    };
  });
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
