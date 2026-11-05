/** Admin API. Every route except /login sits behind the session guard. */

import express from 'express';

import { CAFE, STATIONS, BLOCKING_STATUSES, BOOKING_STATUSES } from '../config.js';
import {
  hashPassword,
  verifyPassword,
  startSession,
  readSession,
  endSession,
  requireAdmin,
  parseCookies,
  SESSION_COOKIE,
  sessionCookieHeader,
  clearCookieHeader,
} from '../auth.js';
import { load, save, newId } from '../store.js';
import { publicKey, subscribe, unsubscribe, notify, deviceCount } from '../push.js';
import * as time from '../time.js';

const router = express.Router();

/* -------------------------------------------------------------------- login */

router.post('/login', (req, res) => {
  const settings = load('settings', {});
  const username = String((req.body || {}).username || '').trim();
  const password = String((req.body || {}).password || '');

  const userOk = username.toLowerCase() === String(settings.adminUser || 'admin').toLowerCase();
  const passOk = verifyPassword(password, settings.adminPassword);

  if (!userOk || !passOk) {
    return res.status(401).json({ ok: false, error: 'Wrong username or password.' });
  }

  const token = startSession(settings.adminUser);
  res.setHeader('Set-Cookie', sessionCookieHeader(token));

  return res.json({ ok: true, user: settings.adminUser });
});

router.post('/logout', (req, res) => {
  endSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  res.setHeader('Set-Cookie', clearCookieHeader());
  return res.json({ ok: true });
});

router.get('/session', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const session = readSession(token);

  if (!session) return res.json({ ok: true, signedIn: false });
  return res.json({ ok: true, signedIn: true, user: session.username });
});

/* ---------------------------------------------------------- everything else */

router.use(requireAdmin);

/* --------------------------------------------------------------------- push */

/** The public VAPID key the browser needs before it can subscribe. */
router.get('/push', (req, res) => {
  res.json({ ok: true, publicKey, devices: deviceCount() });
});

router.post('/push/subscribe', (req, res) => {
  const result = subscribe((req.body || {}).subscription, (req.body || {}).label);

  if (!result.ok) return res.status(400).json(result);
  return res.json(result);
});

router.post('/push/unsubscribe', (req, res) => {
  res.json(unsubscribe((req.body || {}).endpoint));
});

/** Fires a test notification so the owner can confirm it works. */
router.post('/push/test', async (req, res) => {
  const result = await notify({
    title: 'Test notification',
    body: 'Notifications are working. You will be alerted here for every new booking.',
    url: '/admin',
    tag: 'bro-code-test',
  });

  return res.json(result);
});

/* ------------------------------------------------------------------ summary */

router.get('/summary', (req, res) => {
  const today = time.todayISO();
  const bookings = load('bookings', []);
  const tournaments = load('tournaments', []);
  const registrations = load('registrations', []);

  const todays = bookings.filter((booking) => booking.date === today);
  const pending = bookings.filter((booking) => booking.status === 'pending');

  const weekStart = time.addDays(today, -6);
  const weekBookings = bookings.filter(
    (booking) => booking.date >= weekStart && booking.date <= today,
  );

  const money = (list) => list
    .filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
    .reduce((sum, booking) => sum + (Number(booking.quotedTotal) || 0), 0);

  const upcoming = tournaments
    .filter((tournament) => tournament.active && tournament.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  return res.json({
    ok: true,
    today,
    todayLabel: time.formatDateLabel(today),
    stats: {
      todayTotal: todays.length,
      todayPending: todays.filter((b) => b.status === 'pending').length,
      todayConfirmed: todays.filter((b) => b.status === 'confirmed').length,
      pendingAll: pending.length,
      revenueToday: money(todays),
      revenueWeek: money(weekBookings),
      bookingsWeek: weekBookings.length,
      activeOffers: load('offers', []).filter((offer) => offer.active).length,
      upcomingTournaments: upcoming.length,
      tournamentEntries: registrations.filter((entry) => entry.status !== 'cancelled').length,
      stationsTotal: STATIONS.length,
    },
    pendingList: pending
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      .slice(0, 6)
      .map((booking) => ({
        ...booking,
        dateLabel: time.formatDateLabel(booking.date),
        startLabel: time.formatTimeLabel(booking.start),
      })),
  });
});

/* ----------------------------------------------------------------- bookings */

router.get('/bookings', (req, res) => {
  const { date, status, q, from } = req.query;
  let bookings = load('bookings', []);

  if (date) bookings = bookings.filter((booking) => booking.date === date);
  if (from) bookings = bookings.filter((booking) => booking.date >= String(from));
  if (status && status !== 'all') bookings = bookings.filter((booking) => booking.status === status);

  if (q) {
    const needle = String(q).toLowerCase();
    bookings = bookings.filter((booking) =>
      [booking.name, booking.phone, booking.code, booking.stationLabel]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }

  const decorated = bookings
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
    .map((booking) => ({
      ...booking,
      dateLabel: time.formatDateLabel(booking.date),
      startLabel: time.formatTimeLabel(booking.start),
      endLabel: time.formatTimeLabel(booking.end),
      createdLabel: time.formatDateTime(booking.createdAt),
    }));

  return res.json({
    ok: true,
    bookings: decorated,
    counts: {
      total: decorated.length,
      pending: decorated.filter((b) => b.status === 'pending').length,
      confirmed: decorated.filter((b) => b.status === 'confirmed').length,
      completed: decorated.filter((b) => b.status === 'completed').length,
      blocked: decorated.filter((b) => BLOCKING_STATUSES.includes(b.status)).length,
    },
  });
});

router.patch('/bookings/:id', (req, res) => {
  const bookings = load('bookings', []);
  const booking = bookings.find((item) => item.id === req.params.id);

  if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found.' });

  const status = (req.body || {}).status;
  if (status !== undefined) {
    if (!BOOKING_STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, error: 'Unknown booking status.' });
    }
    booking.status = status;
  }

  if ((req.body || {}).adminNote !== undefined) {
    booking.adminNote = String(req.body.adminNote).slice(0, 300);
  }

  booking.updatedAt = new Date().toISOString();
  save('bookings', bookings);

  return res.json({ ok: true, booking });
});

router.delete('/bookings/:id', (req, res) => {
  const bookings = load('bookings', []);
  const next = bookings.filter((item) => item.id !== req.params.id);

  if (next.length === bookings.length) {
    return res.status(404).json({ ok: false, error: 'Booking not found.' });
  }

  save('bookings', next);
  return res.json({ ok: true });
});

/* ------------------------------------------------------------------- offers */

router.get('/offers', (req, res) => {
  res.json({ ok: true, offers: load('offers', []) });
});

router.post('/offers', (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();

  if (!title) return res.status(400).json({ ok: false, error: 'Please give the offer a title.' });

  const offer = {
    id: newId('off'),
    badge: String(body.badge || 'OFFER').trim().toUpperCase().slice(0, 20),
    title,
    description: String(body.description || '').trim().slice(0, 240),
    detail: String(body.detail || '').trim().slice(0, 200),
    validFrom: time.isValidISODate(body.validFrom) ? body.validFrom : time.todayISO(),
    validTo: time.isValidISODate(body.validTo) ? body.validTo : '',
    highlight: Boolean(body.highlight),
    active: body.active === undefined ? true : Boolean(body.active),
    createdAt: new Date().toISOString(),
  };

  const offers = load('offers', []);
  offers.push(offer);
  save('offers', offers);

  return res.status(201).json({ ok: true, offer });
});

router.patch('/offers/:id', (req, res) => {
  const offers = load('offers', []);
  const offer = offers.find((item) => item.id === req.params.id);

  if (!offer) return res.status(404).json({ ok: false, error: 'Offer not found.' });

  const body = req.body || {};
  for (const field of ['badge', 'title', 'description', 'detail', 'validFrom', 'validTo']) {
    if (body[field] !== undefined) offer[field] = String(body[field]).slice(0, 240);
  }
  if (offer.badge) offer.badge = offer.badge.toUpperCase().slice(0, 20);
  if (body.highlight !== undefined) offer.highlight = Boolean(body.highlight);
  if (body.active !== undefined) offer.active = Boolean(body.active);
  offer.updatedAt = new Date().toISOString();

  save('offers', offers);
  return res.json({ ok: true, offer });
});

router.delete('/offers/:id', (req, res) => {
  const offers = load('offers', []);
  const next = offers.filter((item) => item.id !== req.params.id);

  if (next.length === offers.length) {
    return res.status(404).json({ ok: false, error: 'Offer not found.' });
  }

  save('offers', next);
  return res.json({ ok: true });
});

/* -------------------------------------------------------------- tournaments */

router.get('/tournaments', (req, res) => {
  const registrations = load('registrations', []);
  const today = time.todayISO();

  const tournaments = load('tournaments', [])
    .map((tournament) => {
      const taken = registrations.filter(
        (entry) => entry.tournamentId === tournament.id && entry.status !== 'cancelled',
      ).length;
      return {
        ...tournament,
        takenSlots: taken,
        slotsLeft: Math.max(0, Number(tournament.totalSlots || 0) - taken),
        dateLabel: time.formatDateLabel(tournament.date),
        isPast: tournament.date < today,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return res.json({ ok: true, tournaments, today });
});

router.post('/tournaments', (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();

  if (!title) return res.status(400).json({ ok: false, error: 'Please give the tournament a title.' });
  if (!time.isValidISODate(body.date)) {
    return res.status(400).json({ ok: false, error: 'Please choose a valid tournament date.' });
  }

  const tournament = {
    id: newId('trn'),
    title,
    game: String(body.game || '').trim().slice(0, 40),
    mode: String(body.mode || '').trim().slice(0, 80),
    date: body.date,
    startTime: time.timeToMinutes(body.startTime) === null ? '18:00' : body.startTime,
    entryFee: Number(body.entryFee) || 0,
    entryLabel: String(body.entryLabel || '').trim().slice(0, 60),
    prizePool: Number(body.prizePool) || 0,
    prizeLabel: String(body.prizeLabel || '').trim().slice(0, 60),
    totalSlots: Math.max(1, Number(body.totalSlots) || 8),
    platform: String(body.platform || '').trim().slice(0, 40),
    image: String(body.image || '').trim(),
    details: String(body.details || '').trim().slice(0, 600),
    rules: Array.isArray(body.rules)
      ? body.rules.map((rule) => String(rule).trim()).filter(Boolean).slice(0, 10)
      : String(body.rules || '').split('\n').map((rule) => rule.trim()).filter(Boolean).slice(0, 10),
    active: body.active === undefined ? true : Boolean(body.active),
    createdAt: new Date().toISOString(),
  };

  const tournaments = load('tournaments', []);
  tournaments.push(tournament);
  save('tournaments', tournaments);

  return res.status(201).json({ ok: true, tournament });
});

router.patch('/tournaments/:id', (req, res) => {
  const tournaments = load('tournaments', []);
  const tournament = tournaments.find((item) => item.id === req.params.id);

  if (!tournament) return res.status(404).json({ ok: false, error: 'Tournament not found.' });

  const body = req.body || {};
  for (const field of ['title', 'game', 'mode', 'platform', 'image', 'details', 'entryLabel', 'prizeLabel']) {
    if (body[field] !== undefined) tournament[field] = String(body[field]);
  }
  if (time.isValidISODate(body.date)) tournament.date = body.date;
  if (time.timeToMinutes(body.startTime) !== null) tournament.startTime = body.startTime;
  if (body.entryFee !== undefined) tournament.entryFee = Number(body.entryFee) || 0;
  if (body.prizePool !== undefined) tournament.prizePool = Number(body.prizePool) || 0;
  if (body.totalSlots !== undefined) tournament.totalSlots = Math.max(1, Number(body.totalSlots) || 8);
  if (body.rules !== undefined) {
    tournament.rules = Array.isArray(body.rules)
      ? body.rules.map((rule) => String(rule).trim()).filter(Boolean).slice(0, 10)
      : String(body.rules).split('\n').map((rule) => rule.trim()).filter(Boolean).slice(0, 10);
  }
  if (body.active !== undefined) tournament.active = Boolean(body.active);
  tournament.updatedAt = new Date().toISOString();

  save('tournaments', tournaments);
  return res.json({ ok: true, tournament });
});

router.delete('/tournaments/:id', (req, res) => {
  const tournaments = load('tournaments', []);
  const next = tournaments.filter((item) => item.id !== req.params.id);

  if (next.length === tournaments.length) {
    return res.status(404).json({ ok: false, error: 'Tournament not found.' });
  }

  save('tournaments', next);
  save('registrations', load('registrations', []).filter((entry) => entry.tournamentId !== req.params.id));

  return res.json({ ok: true });
});

/* ------------------------------------------------------------- registrations */

router.get('/registrations', (req, res) => {
  const tournaments = load('tournaments', []);
  const titleFor = (id) => (tournaments.find((item) => item.id === id) || {}).title || 'Removed tournament';

  const registrations = load('registrations', [])
    .map((entry) => ({
      ...entry,
      tournamentTitle: titleFor(entry.tournamentId),
      createdLabel: time.formatDateTime(entry.createdAt),
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return res.json({ ok: true, registrations });
});

router.patch('/registrations/:id', (req, res) => {
  const registrations = load('registrations', []);
  const entry = registrations.find((item) => item.id === req.params.id);

  if (!entry) return res.status(404).json({ ok: false, error: 'Registration not found.' });

  const status = (req.body || {}).status;
  if (status !== undefined) {
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Unknown registration status.' });
    }
    entry.status = status;
  }
  if ((req.body || {}).notes !== undefined) entry.notes = String(req.body.notes).slice(0, 300);

  save('registrations', registrations);
  return res.json({ ok: true, registration: entry });
});

router.delete('/registrations/:id', (req, res) => {
  const registrations = load('registrations', []);
  const next = registrations.filter((item) => item.id !== req.params.id);

  if (next.length === registrations.length) {
    return res.status(404).json({ ok: false, error: 'Registration not found.' });
  }

  save('registrations', next);
  return res.json({ ok: true });
});

/* ----------------------------------------------------------------- settings */

router.get('/settings', (req, res) => {
  const settings = load('settings', {});
  res.json({
    ok: true,
    settings: {
      adminUser: settings.adminUser,
      hours: CAFE.hours,
      contact: CAFE.contact,
      cafe: { name: CAFE.name, tagline: CAFE.tagline },
      stations: STATIONS,
    },
  });
});

router.patch('/settings', (req, res) => {
  const body = req.body || {};
  const settings = load('settings', {});

  if (body.hours) {
    const open = body.hours.open;
    const close = body.hours.close;
    if (time.timeToMinutes(open) === null || time.timeToMinutes(close) === null) {
      return res.status(400).json({ ok: false, error: 'Please use 24 hour times such as 10:00.' });
    }
    if (time.timeToMinutes(open) === time.timeToMinutes(close)) {
      return res.status(400).json({ ok: false, error: 'Opening and closing time cannot be the same.' });
    }
    // A close time earlier than the open time means the cafe trades past
    // midnight — a full 24 hour day when the two are 24 hours apart.
    const overnight = time.timeToMinutes(close) < time.timeToMinutes(open);
    const span = overnight
      ? time.timeToMinutes(close) + 1440 - time.timeToMinutes(open)
      : time.timeToMinutes(close) - time.timeToMinutes(open);

    CAFE.hours.open = open;
    CAFE.hours.close = close;
    CAFE.hours.label = span >= 1440
      ? 'Open 24 hours'
      : `${time.formatTimeLabel(open)} – ${time.formatTimeLabel(close)}`;
  }

  if (body.contact) {
    for (const field of ['address', 'mapQuery', 'email', 'instagram']) {
      if (body.contact[field] !== undefined) CAFE.contact[field] = String(body.contact[field]);
    }
    if (Array.isArray(body.contact.whatsapp)) {
      CAFE.contact.whatsapp = body.contact.whatsapp.map((n) => String(n).replace(/\D/g, '')).filter(Boolean);
      CAFE.contact.whatsappDisplay = body.contact.whatsapp
        .map((n) => String(n).trim())
        .filter(Boolean);
    }
  }

  if (body.newPassword) {
    if (String(body.newPassword).length < 6) {
      return res.status(400).json({ ok: false, error: 'The new password must be at least 6 characters.' });
    }
    if (!verifyPassword(String(body.currentPassword || ''), settings.adminPassword)) {
      return res.status(401).json({ ok: false, error: 'Your current password is wrong.' });
    }
    settings.adminPassword = hashPassword(String(body.newPassword));
  }

  if (body.adminUser) {
    const username = String(body.adminUser).trim();
    if (username.length < 3) {
      return res.status(400).json({ ok: false, error: 'Username must be at least 3 characters.' });
    }
    settings.adminUser = username;
  }

  settings.updatedAt = new Date().toISOString();
  save('settings', settings);

  return res.json({ ok: true, settings: { ...settings, adminPassword: undefined } });
});

export default router;
