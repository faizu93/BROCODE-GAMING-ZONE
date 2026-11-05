/** Public API used by the customer-facing website. */

import express from 'express';

import {
  CAFE,
  STATIONS,
  STATION_TYPES,
  BLOCKING_STATUSES,
} from '../config.js';
import {
  rateCard,
  quote,
  isValidDuration,
  maxPlayers,
  getPlan,
  formatMoney,
} from '../pricing.js';
import { load, save, newId } from '../store.js';
import { notify } from '../push.js';
import * as time from '../time.js';

const router = express.Router();

/* ------------------------------------------------------------------ helpers */

function normalisePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function isValidPhone(value) {
  return /^[6-9]\d{9}$/.test(normalisePhone(value));
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * The trading window in minutes. A close time earlier than the open time means
 * the cafe trades through the night, so the window runs past midnight: opening
 * at 10:00 and closing at 09:59 becomes 600 → 2039 (09:59 the next morning).
 */
function businessWindow() {
  const open = time.timeToMinutes(CAFE.hours.open);
  const close = time.timeToMinutes(CAFE.hours.close);
  if (open === null || close === null) return null;
  return { open, close: close <= open ? close + 1440 : close };
}

/**
 * Place a clock time on the trading day's timeline. Times before the opening
 * hour belong to the tail of the day, so 02:00 becomes 1560 — two in the
 * morning after the night that started at 10:00.
 */
function toTimeline(clockMinutes, open) {
  return clockMinutes < open ? clockMinutes + 1440 : clockMinutes;
}

/** A booked session as [start, end] on its own trading day's timeline. */
function bookingTimeline(booking, open) {
  const startClock = time.timeToMinutes(booking.start);
  const endClock = time.timeToMinutes(booking.end);
  if (startClock === null || endClock === null) return null;

  const start = toTimeline(startClock, open);
  let end = toTimeline(endClock, open);
  if (end <= start) end += 1440;
  return { start, end };
}

/** The station ids a booking holds — one for older rows, a list after that. */
function bookingStationIds(booking) {
  if (Array.isArray(booking.stationIds) && booking.stationIds.length) return booking.stationIds;
  return booking.stationId ? [booking.stationId] : [];
}

/** How many people play on a station, for the group priced setups. */
function playersFor(station, requested) {
  const plan = getPlan(station.type);
  if (!plan || plan.mode !== 'group') return 1;
  return Math.min(maxPlayers(station.type), Math.max(1, Number(requested) || 1));
}

function bookingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `BC-${code}`;
}

function uniqueBookingCode(existing) {
  const used = new Set(existing.map((b) => b.code));
  let code = bookingCode();
  let guard = 0;
  while (used.has(code) && guard < 50) {
    code = bookingCode();
    guard += 1;
  }
  return code;
}

/** Every booked session on a date, on that trading day's timeline. */
function bookedSlots(date, window) {
  return load('bookings', [])
    .filter(
      (booking) => booking.date === date && BLOCKING_STATUSES.includes(booking.status),
    )
    .map((booking) => {
      const range = bookingTimeline(booking, window.open);
      if (!range) return null;
      return {
        start: range.start,
        end: range.end,
        stationIds: bookingStationIds(booking),
        booking,
      };
    })
    .filter(Boolean);
}

/* Rate limiting: at most 8 booking attempts per IP every 10 minutes. */
const attempts = new Map();
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const ATTEMPT_LIMIT = 8;

function rateLimited(ip) {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((stamp) => now - stamp < ATTEMPT_WINDOW_MS);

  if (recent.length >= ATTEMPT_LIMIT) {
    attempts.set(ip, recent);
    return true;
  }

  recent.push(now);
  attempts.set(ip, recent);
  return false;
}

/* ------------------------------------------------------------------- routes */

/** Everything the front end needs to draw itself. */
router.get('/site', (req, res) => {
  res.json({
    ok: true,
    cafe: CAFE,
    hours: CAFE.hours,
    stations: STATIONS,
    stationTypes: STATION_TYPES,
    rates: rateCard(),
    slotMinutes: CAFE.slotMinutes,
    maxAdvanceDays: CAFE.maxAdvanceDays,
    today: time.todayISO(),
  });
});

/** Live offers shown on the home page. */
router.get('/offers', (req, res) => {
  const today = time.todayISO();
  const offers = load('offers', [])
    .filter((offer) => offer.active)
    .filter((offer) => !offer.validTo || offer.validTo >= today)
    .map((offer) => ({
      ...offer,
      validToLabel: offer.validTo ? time.formatDateLabel(offer.validTo) : '',
      daysLeft: offer.validTo ? time.daysBetween(today, offer.validTo) : null,
    }));

  offers.sort((a, b) => Number(b.highlight) - Number(a.highlight));
  res.json({ ok: true, offers });
});

/** Tournaments with live slot counts. */
router.get('/tournaments', (req, res) => {
  const registrations = load('registrations', []);
  const today = time.todayISO();

  const tournaments = load('tournaments', [])
    .filter((tournament) => tournament.active)
    .map((tournament) => {
      const taken = registrations.filter(
        (entry) => entry.tournamentId === tournament.id && entry.status !== 'cancelled',
      ).length;

      const totalSlots = Number(tournament.totalSlots) || 0;
      const isPast = tournament.date < today;

      return {
        ...tournament,
        takenSlots: taken,
        slotsLeft: Math.max(0, totalSlots - taken),
        isPast,
        dateLabel: time.formatDateLabel(tournament.date),
        timeLabel: time.formatTimeLabel(tournament.startTime),
        fillPercent: totalSlots ? Math.min(100, Math.round((taken / totalSlots) * 100)) : 0,
      };
    })
    .sort((a, b) => {
      if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
      return a.date.localeCompare(b.date);
    });

  res.json({ ok: true, tournaments });
});

/** Which stations are already taken on a given date. */
router.get('/availability', (req, res) => {
  const date = String(req.query.date || '');

  if (!time.isValidISODate(date)) {
    return res.status(400).json({ ok: false, error: 'Please choose a valid date.' });
  }

  const busy = bookedSlots(date, businessWindow());

  const stations = STATIONS.map((station) => ({
    id: station.id,
    type: station.type,
    label: station.label,
    spec: station.spec,
    busy: busy
      .filter((slot) => slot.stationIds.includes(station.id))
      .sort((a, b) => a.start - b.start)
      .map((slot) => ({
        start: time.minutesToTime(slot.start),
        end: time.minutesToTime(slot.end),
        status: slot.booking.status,
      })),
  }));

  res.json({
    ok: true,
    date,
    slotMinutes: CAFE.slotMinutes,
    hours: CAFE.hours,
    stations,
  });
});

/** Take a new booking. */
router.post('/bookings', (req, res) => {
  if (rateLimited(req.ip)) {
    return res.status(429).json({
      ok: false,
      error: 'Too many booking attempts. Please wait a few minutes or message us on WhatsApp.',
    });
  }

  const body = req.body || {};
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const date = String(body.date || '').trim();
  const start = String(body.start || '').trim();
  const durationMinutes = Number(body.duration || 0);
  const notes = String(body.notes || '').trim().slice(0, 300);

  // A booking can hold several stations — a squad often takes a row of PCs.
  const requested = Array.isArray(body.stationIds) ? body.stationIds : [body.stationId];
  const stationIds = Array.from(
    new Set(requested.map((id) => String(id || '').trim()).filter(Boolean)),
  );

  if (name.length < 2 || name.length > 50) {
    return res.status(400).json({ ok: false, error: 'Please enter your name (2 to 50 characters).' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid 10 digit mobile number.' });
  }

  if (!stationIds.length) {
    return res.status(400).json({ ok: false, error: 'Please choose at least one gaming station.' });
  }
  if (stationIds.length > STATIONS.length) {
    return res.status(400).json({ ok: false, error: 'That is more stations than we have. Please pick again.' });
  }

  const stations = [];
  for (const id of stationIds) {
    const station = STATIONS.find((item) => item.id === id);
    if (!station) {
      return res.status(400).json({ ok: false, error: `Station ${id} does not exist.` });
    }
    stations.push(station);
  }

  if (!time.isValidISODate(date)) {
    return res.status(400).json({ ok: false, error: 'Please choose a valid date.' });
  }

  const today = time.todayISO();
  const daysAhead = time.daysBetween(today, date);
  if (daysAhead < 0) {
    return res.status(400).json({ ok: false, error: 'That date has already passed.' });
  }
  if (daysAhead > CAFE.maxAdvanceDays) {
    return res.status(400).json({
      ok: false,
      error: `Bookings open only ${CAFE.maxAdvanceDays} days in advance.`,
    });
  }

  // The length has to be sold on every station in the booking.
  const unsupported = stations.find((station) => !isValidDuration(station.type, durationMinutes));
  if (unsupported) {
    const plan = getPlan(unsupported.type);
    return res.status(400).json({
      ok: false,
      error: `Please pick a valid duration for ${plan ? plan.label : 'this station'}.`,
    });
  }

  const window = businessWindow();

  const startClock = time.timeToMinutes(start);
  if (startClock === null || startClock % CAFE.slotMinutes !== 0) {
    return res.status(400).json({ ok: false, error: 'Please pick a valid start time.' });
  }

  // Work on the trading day's timeline so a 22:00–02:00 session stays one unit.
  const startMinutes = toTimeline(startClock, window.open);
  const endMinutes = startMinutes + durationMinutes;

  if (startMinutes < window.open || endMinutes > window.close) {
    return res.status(400).json({
      ok: false,
      error:
        `Our slots run ${time.formatTimeLabel(CAFE.hours.open)} to ` +
        `${time.formatTimeLabel(CAFE.hours.close)}. This slot falls outside our timings.`,
    });
  }

  if (daysAhead === 0) {
    const nowClock = time.minutesOfDay();
    // Before the opening hour the current trading day has not started yet, so
    // every slot on it is still ahead.
    if (nowClock >= window.open && startMinutes <= nowClock) {
      return res.status(400).json({
        ok: false,
        error: 'That time has already passed today. Please pick a later slot or another day.',
      });
    }
  }

  const slots = bookedSlots(date, window);
  const clash = slots.find(
    (slot) =>
      slot.stationIds.some((id) => stationIds.includes(id)) &&
      overlaps(startMinutes, endMinutes, slot.start, slot.end),
  );

  if (clash) {
    const clashId = clash.stationIds.find((id) => stationIds.includes(id));
    const clashStation = STATIONS.find((item) => item.id === clashId);
    return res.status(409).json({
      ok: false,
      error:
        `${clashStation ? clashStation.label : 'That station'} is already booked from ` +
        `${time.formatTimeLabel(clash.booking.start)} to ` +
        `${time.formatTimeLabel(clash.booking.end)}. Please choose another slot.`,
    });
  }

  const labels = stations.map((station) => station.label);
  const types = Array.from(new Set(stations.map((station) => station.type)));
  const players = Math.max(...stations.map((station) => playersFor(station, body.players)));
  const quotedTotal = stations.reduce(
    (sum, station) => sum + quote(station.type, durationMinutes, playersFor(station, body.players)).total,
    0,
  );

  const bookings = load('bookings', []);
  const booking = {
    id: newId('bkg'),
    code: uniqueBookingCode(bookings),
    name,
    phone: normalisePhone(phone),
    stationId: stations[0].id,
    stationIds: stations.map((station) => station.id),
    stationLabel: labels.join(' + '),
    stationLabels: labels,
    stationType: types.length === 1 ? types[0] : 'MIXED',
    date,
    start: time.minutesToTime(startClock),
    end: time.minutesToTime(endMinutes),
    durationMinutes,
    players,
    notes,
    quotedTotal,
    status: 'pending',
    adminNote: '',
    createdAt: new Date().toISOString(),
  };

  bookings.push(booking);
  save('bookings', bookings);

  // Alert the owner's devices. Fire and forget so the customer is not kept waiting.
  notify({
    title: `New booking · ${booking.code}`,
    body:
      `${booking.name} · ${booking.phone}\n` +
      `${booking.stationLabel} · ${time.formatDateLabel(date)} · ` +
      `${time.formatTimeLabel(booking.start)}–${time.formatTimeLabel(booking.end)}\n` +
      `${formatMoney(booking.quotedTotal)} · ${stations.length} station(s)`,
    url: '/admin',
    tag: `booking-${booking.id}`,
  }).catch((error) => console.error('[push] booking alert failed:', error.message));

  return res.status(201).json({
    ok: true,
    booking,
    code: booking.code,
    dateLabel: time.formatDateLabel(date),
    startLabel: time.formatTimeLabel(booking.start),
    endLabel: time.formatTimeLabel(booking.end),
  });
});

/** Look up a booking by its code. */
router.get('/bookings/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const booking = load('bookings', []).find((item) => item.code === code);

  if (!booking) {
    return res.status(404).json({ ok: false, error: 'No booking found with that code.' });
  }

  return res.json({
    ok: true,
    booking: {
      code: booking.code,
      name: booking.name,
      stationLabel: booking.stationLabel,
      date: booking.date,
      start: booking.start,
      end: booking.end,
      players: booking.players,
      status: booking.status,
      quotedTotal: booking.quotedTotal,
      adminNote: booking.adminNote,
    },
    dateLabel: time.formatDateLabel(booking.date),
    startLabel: time.formatTimeLabel(booking.start),
  });
});

/** Register a team for a tournament. */
router.post('/tournaments/:id/register', (req, res) => {
  if (rateLimited(req.ip)) {
    return res.status(429).json({ ok: false, error: 'Too many attempts. Please try again later.' });
  }

  const body = req.body || {};
  const tournament = load('tournaments', []).find((item) => item.id === req.params.id);

  if (!tournament || !tournament.active) {
    return res.status(404).json({ ok: false, error: 'That tournament is not open for registration.' });
  }

  const today = time.todayISO();
  if (tournament.date < today) {
    return res.status(400).json({ ok: false, error: 'This tournament is already over.' });
  }

  const teamName = String(body.teamName || '').trim().slice(0, 60);
  const captainName = String(body.captainName || '').trim().slice(0, 50);
  const phone = String(body.phone || '').trim();
  const notes = String(body.notes || '').trim().slice(0, 300);

  if (teamName.length < 2) {
    return res.status(400).json({ ok: false, error: 'Please enter a team name.' });
  }
  if (captainName.length < 2) {
    return res.status(400).json({ ok: false, error: 'Please enter the captain name.' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid 10 digit mobile number.' });
  }

  const registrations = load('registrations', []);
  const forTournament = registrations.filter(
    (entry) => entry.tournamentId === tournament.id && entry.status !== 'cancelled',
  );

  if (forTournament.length >= Number(tournament.totalSlots || 0)) {
    return res.status(409).json({ ok: false, error: 'All slots for this tournament are full.' });
  }

  const normalised = normalisePhone(phone);
  if (forTournament.some((entry) => normalisePhone(entry.phone) === normalised)) {
    return res.status(409).json({ ok: false, error: 'This mobile number is already registered for this tournament.' });
  }

  const entry = {
    id: newId('reg'),
    tournamentId: tournament.id,
    teamName,
    captainName,
    phone: normalised,
    players: Math.max(1, Number(body.players) || 1),
    notes,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  registrations.push(entry);
  save('registrations', registrations);

  return res.status(201).json({
    ok: true,
    registration: entry,
    tournamentTitle: tournament.title,
    slotsLeft: Math.max(0, Number(tournament.totalSlots || 0) - forTournament.length - 1),
  });
});

/* -------------------------------------------------------------- healthcheck */

router.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

export default router;
