/**
 * Central configuration for Bro Code Gaming Zone.
 *
 * EVERYTHING the cafe owner normally needs to change lives in this one file:
 * shop details, opening hours, number of gaming stations and the games listed.
 * Change a value here, restart the server, and the whole website updates.
 */

export const CAFE = {
  name: 'BRO CODE GAMING ZONE',
  shortName: 'BRO CODE',
  // Public web address. Used for canonical/share links and the server banner.
  // The host can override this with a SITE_URL environment variable, so the
  // domain can be changed without touching the code.
  siteUrl: (process.env.SITE_URL || 'https://brocode-gaming-zone.onrender.com').replace(/\/+$/, ''),
  tagline: 'Squad Up. Level Up. Dominate.',
  intro:
    'Kalwa Naka\'s home ground for competitive gaming. High refresh-rate gaming PCs, ' +
    'PlayStation 5 controller and racing wheel setups, and a crowd that plays to win. ' +
    'Book your slot before it is gone.',

  contact: {
    // Digits only, with country code. Used for wa.me links.
    whatsapp: ['919967191318', '918591691318'],
    // Pretty versions shown on screen.
    whatsappDisplay: ['99671 91318', '85916 91318'],
    phone: ['+91 99671 91318', '+91 85916 91318'],
    address: 'Nasheman Apt Coop Society, Kalwa Naka, Thane, Maharashtra 400605',
    mapQuery: 'Nasheman Apt Coop Society, Kalwa Naka, Thane, Maharashtra 400605',
    // Leave blank to hide the field on the website.
    email: '',
    instagram: '',
  },

  hours: {
    open: '11:00',
    close: '23:00',
    label: '11:00 AM – 11:00 PM',
    days: 'Open all 7 days',
  },

  // Shown in the booking receipt so customers can pay online via UPI.
  payments: {
    upiId: 'ansarifaizan2794-2@okicici',
    payeeName: 'BRO CODE GAMING ZONE',
    note:
      'Scan the QR or pay to the UPI ID above, then send the payment screenshot on ' +
      'WhatsApp so we can confirm your slot faster.',
  },

  // Bookings are taken every 30 minutes.
  slotMinutes: 30,
  // How far in advance a customer may book.
  maxAdvanceDays: 14,

  bookingNote:
    'Your slot is confirmed on WhatsApp. Please reach the cafe 5 minutes early — ' +
    'a late arrival may shorten your session.',
};

/** The physical gaming stations in the cafe. Add or remove entries freely. */
export const STATIONS = [
  ...Array.from({ length: 8 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return {
      id: `PC-${n}`,
      type: 'PC',
      label: `Gaming PC ${n}`,
      spec: 'RTX 5060 · i5 12400F · 240Hz · Mechanical',
    };
  }),
  {
    id: 'PS5C-01',
    type: 'PS5C',
    label: 'PS5 Controller Setup',
    spec: 'PS5 Slim · 4K 120Hz TV · 4 DualSense controllers',
  },
  {
    id: 'PS5W-01',
    type: 'PS5W',
    label: 'PS5 Wheel Simulator',
    spec: 'PS5 Slim · 4K 120Hz TV · Racing wheel, pedals and shifter',
  },
];

export const STATION_TYPES = {
  PC: { label: 'Gaming PC', singular: 'PC' },
  PS5C: { label: 'PlayStation 5 (Controller)', singular: 'PS5 Controller' },
  PS5W: { label: 'PlayStation 5 (Wheel Simulator)', singular: 'PS5 Wheel' },
};

export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'completed',
  'declined',
  'cancelled',
];

/** Statuses that block a station from being double-booked. */
export const BLOCKING_STATUSES = ['pending', 'confirmed'];
