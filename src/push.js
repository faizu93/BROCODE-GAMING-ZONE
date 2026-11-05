/**
 * Browser push notifications for the owner's devices.
 *
 * The dashboard asks the browser for permission once, then sends the resulting
 * subscription here. Whenever a customer books a slot we push a notification to
 * every saved device — the owner sees it even when the dashboard tab is closed.
 *
 * Subscriptions live in data/push.json, which is what the free Render plan
 * wipes on restart. The dashboard repairs that by itself: every time it loads it
 * re-sends its subscription, so notifications come back on the next visit.
 */

import webpush from 'web-push';

import { load, save } from './store.js';
import { CAFE } from './config.js';

// Keys are fixed so a browser subscription stays valid across restarts. The host
// can override them with environment variables without touching this file.
const PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BJ9G5sF_vqRVW6MGKNOpElsIuTpAn1UqQkRhatVOhoEVrUG4jG23N8NLMHDPBALVStnesQBBVIP5yPbkjRx__UI';

const PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || 'UPpEY4qgjJhuZzcmCnwsDCQ10RyzMXNoa3lFm5nY0lw';

webpush.setVapidDetails(CAFE.siteUrl, PUBLIC_KEY, PRIVATE_KEY);

export const publicKey = PUBLIC_KEY;

/** Guard against a runaway list of devices. */
const MAX_DEVICES = 10;

function devices() {
  const list = load('push', []);
  return Array.isArray(list) ? list : [];
}

export function deviceCount() {
  return devices().length;
}

/** Save a browser subscription. Re-subscribing the same device just refreshes it. */
export function subscribe(subscription, label) {
  const endpoint = subscription && subscription.endpoint;
  const keys = subscription && subscription.keys;

  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return { ok: false, error: 'That subscription is not valid.' };
  }

  const list = devices().filter((device) => device.endpoint !== endpoint);
  list.push({
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    label: String(label || '').slice(0, 80),
    createdAt: new Date().toISOString(),
  });

  save('push', list.slice(-MAX_DEVICES));
  return { ok: true, devices: deviceCount() };
}

export function unsubscribe(endpoint) {
  const list = devices();
  const next = list.filter((device) => device.endpoint !== String(endpoint || ''));
  if (next.length !== list.length) save('push', next);
  return { ok: true, devices: next.length };
}

export function unsubscribeAll() {
  save('push', []);
  return { ok: true, devices: 0 };
}

/**
 * Push a notification to every saved device.
 * Dead subscriptions (the browser was cleared or uninstalled) are dropped.
 */
export async function notify({ title, body, url, tag }) {
  const list = devices();
  if (!list.length) return { ok: true, sent: 0, devices: 0 };

  const payload = JSON.stringify({
    title: String(title || CAFE.name),
    body: String(body || ''),
    url: url || '/admin',
    tag: tag || 'bro-code',
  });

  const alive = [];
  let sent = 0;

  await Promise.all(list.map(async (device) => {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: device.keys },
        payload,
      );
      alive.push(device);
      sent += 1;
    } catch (error) {
      const status = Number(error && error.statusCode);
      // 404 / 410 mean the subscription is gone for good — drop it.
      if (status !== 404 && status !== 410) alive.push(device);
    }
  }));

  if (alive.length !== list.length) save('push', alive);

  return { ok: true, sent, devices: alive.length };
}
