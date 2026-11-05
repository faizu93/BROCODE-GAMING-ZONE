/**
 * Tiny JSON file database.
 *
 * A single gaming cafe takes a few dozen bookings a day, so plain JSON files
 * are plenty. Everything is kept in memory and mirrored to disk on every write,
 * using a temp file + rename so a crash can never leave half-written data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(here, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const cache = new Map();

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

export function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);

  let value = fallback;
  const file = fileFor(name);

  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, 'utf8').trim();
      if (raw) value = JSON.parse(raw);
    } catch (error) {
      console.error(`[store] data/${name}.json is unreadable (${error.message}). Using defaults.`);
    }
  }

  cache.set(name, value);
  return value;
}

export function save(name, value) {
  cache.set(name, value);
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const file = fileFor(name);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);

  return value;
}

export function update(name, fallback, mutator) {
  const current = load(name, fallback);
  const next = mutator(current);
  return save(name, next === undefined ? current : next);
}

/** Called once at boot to make sure every collection exists on disk. */
export function ensure(name, fallback) {
  const file = fileFor(name);
  if (!fs.existsSync(file)) save(name, fallback);
  return load(name, fallback);
}

export function newId(prefix) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return prefix ? `${prefix}_${stamp}${rand}` : `${stamp}${rand}`;
}
