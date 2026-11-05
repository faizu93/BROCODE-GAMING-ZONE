/**
 * First-run data. Creates the admin login, a starter set of offers,
 * tournaments and a couple of demo bookings so the dashboard is not empty.
 *
 * Nothing here overwrites existing data — if data/*.json already exists it is
 * left exactly as it is.
 */

import { ensure, newId } from './store.js';
import { hashPassword } from './auth.js';
import { todayISO, addDays } from './time.js';

const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'brocode@123';

function image(prompt, size = 'landscape_16_9') {
  const base = 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image';
  return `${base}?prompt=${encodeURIComponent(prompt)}&image_size=${size}`;
}

export function seedEverything() {
  ensure('settings', {
    adminUser: DEFAULT_ADMIN_USER,
    adminPassword: hashPassword(DEFAULT_ADMIN_PASSWORD),
    createdAt: new Date().toISOString(),
  });

  const today = todayISO();

  ensure('offers', [
    {
      id: newId('off'),
      badge: 'HAPPY HOURS',
      title: 'Happy Hours',
      description: 'Every gaming PC drops to a flat Rs.50 per hour between 12 PM and 4 PM.',
      detail: 'Flat Rs.50 / hour on all 8 gaming PCs · Monday to Friday',
      validFrom: today,
      validTo: addDays(today, 30),
      highlight: true,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('off'),
      badge: 'STUDENT',
      title: 'Student Squad Deal',
      description: 'Show a valid college ID and get 20% off any booking of 2 hours or more.',
      detail: '20% off · 2 hour minimum · ID must be shown at the counter',
      validFrom: today,
      validTo: addDays(today, 60),
      highlight: false,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('off'),
      badge: 'SQUAD OF 4',
      title: 'PS5 Squad Night',
      description: 'Four friends, one hour of PlayStation 5, four controllers — Rs.470 all in.',
      detail: '1 hour PS5 + 4 players · Rs.470 · 8 PM onwards',
      validFrom: today,
      validTo: addDays(today, 20),
      highlight: true,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('off'),
      badge: 'NEW PLAYER',
      title: 'First Slot Free',
      description: 'First time at Bro Code? Your first 30 minutes on any gaming PC are on us.',
      detail: 'One free 30 minute PC slot per new customer',
      validFrom: today,
      validTo: addDays(today, 45),
      highlight: false,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('off'),
      badge: 'WEEKEND',
      title: 'Weekend Marathon Pack',
      description: 'Four hours of PC gaming for Rs.250 flat. Bring your whole squad.',
      detail: '4 hours PC · Rs.250 · Saturday & Sunday',
      validFrom: today,
      validTo: addDays(today, 30),
      highlight: false,
      active: true,
      createdAt: new Date().toISOString(),
    },
  ]);

  const tournaments = [
    {
      id: newId('trn'),
      title: 'BGMI Squad Showdown',
      game: 'BGMI',
      mode: 'Squad · 4 players per team',
      date: addDays(today, 10),
      startTime: '18:00',
      entryFee: 100,
      entryLabel: 'Rs.100 per team',
      prizePool: 5000,
      prizeLabel: 'Rs.5,000 prize pool',
      totalSlots: 16,
      platform: 'Mobile',
      image: image('esports tournament banner, dark background with red neon glow, battle royale soldier silhouette, dramatic lighting, cinematic, no text'),
      details: 'Erangel and Miramar. Three matches, points table decides the winner. Room ID shared on WhatsApp 30 minutes before the match.',
      rules: [
        'Team of 4 + 1 substitute allowed',
        'No emulators, no third-party tools',
        'Room ID shared 30 minutes before start',
        'Screenshot proof needed for prize claims',
      ],
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('trn'),
      title: 'Valorant 5v5 Clash',
      game: 'Valorant',
      mode: '5v5 · Competitive ruleset',
      date: addDays(today, 17),
      startTime: '17:00',
      entryFee: 250,
      entryLabel: 'Rs.250 per team',
      prizePool: 10000,
      prizeLabel: 'Rs.10,000 prize pool',
      totalSlots: 8,
      platform: 'PC',
      image: image('esports tournament banner, dark red neon futuristic tactical shooter agent silhouette, abstract geometric shapes, cinematic, no text'),
      details: 'Best of one group stage, best of three final. Players may use cafe accounts or bring their own.',
      rules: [
        'Team of 5, one substitute allowed',
        'Bring your own Riot ID',
        'Standard competitive ruleset',
        'Late teams forfeit after 10 minutes',
      ],
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('trn'),
      title: 'FIFA 26 PS5 Cup',
      game: 'FIFA 26',
      mode: '1v1 · PlayStation 5',
      date: addDays(today, 24),
      startTime: '16:00',
      entryFee: 150,
      entryLabel: 'Rs.150 per player',
      prizePool: 3000,
      prizeLabel: 'Rs.3,000 prize pool',
      totalSlots: 16,
      platform: 'PlayStation 5',
      image: image('esports tournament banner, football stadium at night with red neon lights, dramatic sports lighting, cinematic, no text'),
      details: 'Knockout bracket on our PS5 zone. 6 minute halves, default squads only.',
      rules: [
        '1v1 knockout format',
        '6 minute halves',
        'Default club squads only',
        'Bring your own controller if you prefer',
      ],
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('trn'),
      title: 'Free Fire Solo Scramble',
      game: 'Free Fire',
      mode: 'Solo battle royale',
      date: addDays(today, -12),
      startTime: '19:00',
      entryFee: 50,
      entryLabel: 'Rs.50 per player',
      prizePool: 2000,
      prizeLabel: 'Rs.2,000 prize pool',
      totalSlots: 24,
      platform: 'Mobile',
      image: image('esports tournament banner, dark red neon battle royale action silhouette, gritty texture, cinematic, no text'),
      details: 'Completed. Congratulations to our winner Arjun M. Next solo scramble announced soon.',
      rules: ['Solo only', 'No emulators'],
      active: false,
      createdAt: new Date().toISOString(),
    },
  ];

  ensure('tournaments', tournaments);

  ensure('registrations', [
    {
      id: newId('reg'),
      tournamentId: tournaments[0].id,
      teamName: 'Team Phantom',
      captainName: 'Rohit Sharma',
      phone: '9967191318',
      players: 4,
      notes: 'Prefer evening slot',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('reg'),
      tournamentId: tournaments[0].id,
      teamName: 'Kalwa Kings',
      captainName: 'Sameer Patil',
      phone: '8591691318',
      players: 4,
      notes: '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('reg'),
      tournamentId: tournaments[1].id,
      teamName: 'Neon Reapers',
      captainName: 'Aditya Rane',
      phone: '9876543210',
      players: 5,
      notes: '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ]);

  ensure('bookings', [
    {
      id: newId('bkg'),
      code: 'BC-DEMO1',
      name: 'Rahul Verma',
      phone: '9967191318',
      stationId: 'PC-01',
      stationLabel: 'Gaming PC 01',
      stationType: 'PC',
      date: today,
      start: '15:00',
      end: '16:00',
      durationMinutes: 60,
      players: 1,
      notes: 'Demo booking created during setup — safe to delete.',
      quotedTotal: 70,
      status: 'confirmed',
      adminNote: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('bkg'),
      code: 'BC-DEMO2',
      name: 'Faizan Khan',
      phone: '8591691318',
      stationId: 'PS5-01',
      stationLabel: 'PlayStation 5 · Zone 1',
      stationType: 'PS5',
      date: today,
      start: '18:00',
      end: '19:00',
      durationMinutes: 60,
      players: 2,
      notes: 'Demo booking created during setup — safe to delete.',
      quotedTotal: 310,
      status: 'pending',
      adminNote: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: newId('bkg'),
      code: 'BC-DEMO3',
      name: 'Sneha Iyer',
      phone: '9820011223',
      stationId: 'PC-04',
      stationLabel: 'Gaming PC 04',
      stationType: 'PC',
      date: addDays(today, 1),
      start: '17:30',
      end: '19:30',
      durationMinutes: 120,
      players: 1,
      notes: 'Demo booking created during setup — safe to delete.',
      quotedTotal: 140,
      status: 'confirmed',
      adminNote: '',
      createdAt: new Date().toISOString(),
    },
  ]);
}

export const ADMIN_DEFAULTS = {
  user: DEFAULT_ADMIN_USER,
  password: DEFAULT_ADMIN_PASSWORD,
};
