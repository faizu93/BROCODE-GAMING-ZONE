/** Date and time helpers. All dates are plain "YYYY-MM-DD" strings, local time. */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function toISODate(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function parseISODate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function isValidISODate(iso) {
  return Boolean(parseISODate(iso));
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  if (!date) return null;
  date.setDate(date.getDate() + Number(days));
  return toISODate(date);
}

export function daysBetween(fromISO, toISO) {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export function minutesToTime(totalMinutes) {
  const mins = ((Number(totalMinutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export function minutesOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function formatDateLabel(iso) {
  const date = parseISODate(iso);
  if (!date) return String(iso || '');
  return `${DAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatShortDate(iso) {
  const date = parseISODate(iso);
  if (!date) return String(iso || '');
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

export function formatTimeLabel(value) {
  const total = timeToMinutes(value);
  if (total === null) return String(value || '');

  const hours24 = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return minutes === 0
    ? `${hours12} ${suffix}`
    : `${hours12}:${pad(minutes)} ${suffix}`;
}

export function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return `${formatDateLabel(toISODate(date))}, ${formatTimeLabel(`${pad(date.getHours())}:${pad(date.getMinutes())}`)}`;
}
