/**
 * Admin authentication.
 *
 * Passwords are hashed with scrypt (built into Node, so no extra packages).
 * Sessions are random tokens held in memory and handed to the browser as an
 * httpOnly cookie, valid for 12 hours.
 */

import crypto from 'node:crypto';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;

  const [salt, expected] = stored.split(':');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actual = crypto.scryptSync(String(password), salt, 64);

  if (actual.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actual, expectedBuffer);
}

export function startSession(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function readSession(token) {
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  // Sliding expiry: keep an active admin logged in.
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

export function endSession(token) {
  if (token) sessions.delete(token);
}

export function parseCookies(header = '') {
  const jar = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    jar[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return jar;
}

export const SESSION_COOKIE = 'bcgz_admin';

export function sessionCookieHeader(token) {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  return attrs.join('; ');
}

export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Express middleware guarding every /api/admin route except login. */
export function requireAdmin(req, res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const session = readSession(token);

  if (!session) {
    return res.status(401).json({ ok: false, error: 'Please sign in to continue.' });
  }

  req.admin = session;
  req.sessionToken = token;
  return next();
}
