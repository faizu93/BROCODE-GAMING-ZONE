/**
 * Bro Code Gaming Zone — website + booking server.
 *
 *   npm install
 *   npm start        ->  http://localhost:3000
 *
 * Public domain : https://brocode-gaming-zone.onrender.com   (override with SITE_URL)
 * Customer site : http://localhost:3000
 * Admin panel   : http://localhost:3000/admin
 */

import express from 'express';

import { PUBLIC_DIR } from './src/store.js';
import { CAFE } from './src/config.js';
import { seedEverything, ADMIN_DEFAULTS } from './src/seed.js';
import publicRoutes from './src/routes/public.js';
import adminRoutes from './src/routes/admin.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

seedEverything();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));

// Static website. Only the public/ folder is exposed — data/ and src/ stay private.
app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html',
    extensions: ['html'],
    etag: true,
  }),
);

app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'That endpoint does not exist.' });
  }

  return res.status(404).send(
    '<!doctype html><html lang="en"><meta charset="utf-8">' +
      '<title>Page not found · Bro Code Gaming Zone</title>' +
      '<body style="margin:0;height:100vh;display:grid;place-items:center;background:#08080a;' +
      'color:#f2f2f5;font-family:system-ui,sans-serif;text-align:center">' +
      '<div><h1 style="font-size:64px;color:#ff1f3d;margin:0">404</h1>' +
      '<p style="color:#9a9aa8">That page does not exist.</p>' +
      '<a href="/" style="color:#ff1f3d;font-weight:600">Back to Bro Code Gaming Zone</a></div></body></html>',
  );
});

app.use((error, req, res, next) => {
  if (error && error.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'The request data was not valid JSON.' });
  }

  console.error('[bro-code] unexpected error:', error);
  return res.status(500).json({ ok: false, error: 'Something went wrong on our side.' });
});

const server = app.listen(PORT, HOST, () => {
  const line = '─'.repeat(58);
  console.log(`\n${line}`);
  console.log('  BRO CODE GAMING ZONE — server is running');
  console.log(line);
  console.log(`  Public domain    : ${CAFE.siteUrl}`);
  console.log(`  Local address    : http://localhost:${PORT}`);
  console.log(`  Admin dashboard  : http://localhost:${PORT}/admin`);
  console.log(`  Admin login      : ${ADMIN_DEFAULTS.user} / ${ADMIN_DEFAULTS.password}`);
  console.log(`  Data folder      : ./data  (change the admin password after first login)`);
  console.log(`${line}\n  Press Ctrl + C to stop the server.\n`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `\n[bro-code] Port ${PORT} is already in use.\n` +
        `Close the other program, or start on a different port with:  npm start -- --port 3100\n` +
        `(on Windows PowerShell:  $env:PORT=3100; npm start )\n`,
    );
  } else {
    console.error('[bro-code] Could not start the server:', error);
  }
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n[bro-code] Shutting down. Bookings are saved in ./data. Goodbye.');
    server.close(() => process.exit(0));
  });
}
