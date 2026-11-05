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
} from '../pricing.js';
import { load, save, newId } from '../store.js';
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

function activeBookingsFor(date) {
  return load('bookings', []).filter(
    (booking) => booking.date === date && BLOCKING_STATUSES.includes(booking.status),
  );
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

  const busy = activeBookingsFor(date);

  const stations = STATIONS.map((station) => ({
    id: station.id,
    type: station.type,
    label: station.label,
    spec: station.spec,
    busy: busy
      .filter((booking) => booking.stationId === station.id)
      .map((booking) => ({
        start: booking.start,
        end: booking.end,
        status: booking.status,
      }))
      .sort((a, b) => a.start.localeCompare(b.start)),
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
  const stationId = String(body.stationId || '').trim();
  const date = String(body.date || '').trim();
  const start = String(body.start || '').trim();
  const durationMinutes = Number(body.duration || 0);
  const notes = String(body.notes || '').trim().slice(0, 300);

  if (name.length < 2 || name.length > 50) {
    return res.status(400).json({ ok: false, error: 'Please enter your name (2 to 50 characters).' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid 10 digit mobile number.' });
  }

  const station = STATIONS.find((item) => item.id === stationId);
  if (!station) {
    return res.status(400).json({ ok: false, error: 'That gaming station does not exist.' });
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

  if (!isValidDuration(station.type, durationMinutes)) {
    const plan = getPlan(station.type);
    return res.status(400).json({
      ok: false,
      error: `Please pick a valid duration for ${plan ? plan.label : 'this station'}.`,
    });
  }

  const startMinutes = time.timeToMinutes(start);
  if (startMinutes === null || startMinutes % CAFE.slotMinutes !== 0) {
    return res.status(400).json({ ok: false, error: 'Please pick a valid start time.' });
  }

  const openMinutes = time.timeToMinutes(CAFE.hours.open);
  const closeMinutes = time.timeToMinutes(CAFE.hours.close);
  const endMinutes = startMinutes + durationMinutes;

  if (startMinutes < openMinutes || endMinutes > closeMinutes) {
    return res.status(400).json({
      ok: false,
      error: `We are open ${CAFE.hours.label}. This slot falls outside our timings.`,
    });
  }

  if (daysAhead === 0 && startMinutes <= time.minutesOfDay()) {
    return res.status(400).json({
      ok: false,
      error: 'That time has already passed today. Please pick a later slot or another day.',
    });
  }

  const plan = getPlan(station.type);
  const players = plan && plan.mode === 'group'
    ? Math.min(maxPlayers(station.type), Math.max(1, Number(body.players) || 1))
    : 1;

  const end = time.minutesToTime(endMinutes);

  const clash = activeBookingsFor(date).find(
    (booking) =>
      booking.stationId === station.id &&
      overlaps(startMinutes, endMinutes, time.timeToMinutes(booking.start), time.timeToMinutes(booking.end)),
  );

  if (clash) {
    return res.status(409).json({
      ok: false,
      error: `${station.label} is already booked from ${time.formatTimeLabel(clash.start)} to ${time.formatTimeLabel(clash.end)}. Please choose another slot.`,
    });
  }

  const bookings = load('bookings', []);
  const booking = {
    id: newId('bkg'),
    code: uniqueBookingCode(bookings),
    name,
    phone: normalisePhone(phone),
    stationId: station.id,
    stationLabel: station.label,
    stationType: station.type,
    date,
    start: time.minutesToTime(startMinutes),
    end,
    durationMinutes,
    players,
    notes,
    quotedTotal: quote(station.type, durationMinutes, players).total,
    status: 'pending',
    adminNote: '',
    createdAt: new Date().toISOString(),
  };

  bookings.push(booking);
  save('bookings', bookings);

  return res.status(201).json({
    ok: true,
    booking,
    code: booking.code,
    dateLabel: time.formatDateLabel(date),
    startLabel: time.formatTimeLabel(booking.start),
    endLabel: time.formatTimeLabel(end),
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
