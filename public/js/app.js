/* ==========================================================================
   Bro Code Gaming Zone — customer site
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------- utilities */

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);

  const pad = (value) => String(value).padStart(2, '0');

  function toISODate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function timeToMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function minutesToTime(total) {
    const mins = ((Number(total) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }

  function formatTimeLabel(value) {
    const total = timeToMinutes(value);
    if (total === null) return String(value || '');

    const hours24 = Math.floor(total / 60);
    const minutes = total % 60;
    const suffix = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

    return minutes === 0 ? `${hours12} ${suffix}` : `${hours12}:${pad(minutes)} ${suffix}`;
  }

  function formatDuration(minutes) {
    const mins = Number(minutes);
    if (mins < 60) return `${mins} mins`;
    const hours = Math.floor(mins / 60);
    const rest = mins % 60;
    const label = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    return rest ? `${label} ${rest} mins` : label;
  }

  function formatMoney(amount) {
    return `Rs.${Number(amount || 0).toLocaleString('en-IN')}`;
  }

  function controllerBreakdown(plan) {
    if (!plan || !plan.playerCharge) return '';
    const { solo, perPerson, maxPlayers } = plan.playerCharge;
    const labels = ['Solo', 'Duo', 'Trio', 'Squad'];
    const count = Math.max(1, Math.min(Number(maxPlayers) || 1, labels.length));
    return labels.slice(0, count).map((label, index) => {
      const players = index + 1;
      return `${label} ${formatMoney(players === 1 ? solo : perPerson * players)}`;
    }).join(' · ') + ' (once per booking)';
  }

  function formatDateLabel(iso) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!parts) return String(iso || '');

    const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function addDays(iso, days) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!parts) return iso;
    const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    date.setDate(date.getDate() + days);
    return toISODate(date);
  }

  let toastTimer = null;

  function toast(message, tone = '') {
    const node = $('#toast');
    if (!node) return;

    node.textContent = message;
    node.className = `toast show ${tone}`.trim();

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.className = `toast ${tone}`.trim();
    }, 4200);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || 'Something went wrong. Please try again.');
    }

    return payload;
  }

  /* ----------------------------------------------------------------- state */

  const state = {
    cafe: null,
    hours: null,
    stations: [],
    stationTypes: {},
    rates: {},
    slotMinutes: 30,
    maxAdvanceDays: 14,
    availability: {},
    date: '',
    start: '',
    duration: 0,
    stationId: '',
    players: 1,
    busy: false,
  };

  const IMAGES = {
    hero: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=' +
      encodeURIComponent('dark esports gaming cafe interior, long rows of RGB gaming PCs glowing red, black walls, red neon strip lighting, cinematic wide shot, photorealistic, moody') +
      '&image_size=landscape_16_9',
    gallery: [
      'close up of red backlit mechanical gaming keyboard in a dark room, neon red glow, shallow depth of field, photorealistic',
      'young gamers wearing headsets playing on gaming PCs in a dark cafe lit with red neon, over the shoulder shot, photorealistic',
      'playstation 5 console with two controllers on a black desk under red neon light, photorealistic product shot',
      'esports tournament crowd watching a big screen in a dark arena with red stage lighting, photorealistic',
      'gaming chair and desk setup with red LED strips in a dark room, photorealistic interior',
      'cold drinks and snacks on a table next to a gaming controller in a red lit cafe, photorealistic',
    ],
  };

  function imageUrl(prompt, size) {
    return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=${size}`;
  }

  /* ------------------------------------------------------------ static text */

  /** Keep the canonical + share links in step with the configured public address. */
  function syncSiteMeta() {
    const base = (state.cafe && state.cafe.siteUrl) || '';
    if (!base) return;

    const url = base.endsWith('/') ? base : `${base}/`;
    const canonical = $('link[rel="canonical"]');
    const ogUrl = $('meta[property="og:url"]');

    if (canonical) canonical.href = url;
    if (ogUrl) ogUrl.content = url;
  }

  function whatsappLink(message) {
    const number = (state.cafe && state.cafe.contact.whatsapp[0]) || '';
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }

  function renderStatic() {
    const { cafe } = state;

    syncSiteMeta();

    document.title = `${cafe.name} | Gaming Cafe in Kalwa Naka, Thane — Book Your Slot`;

    $('#heroEyebrow').textContent = cafe.contact.address.split(',').slice(-3, -1).join(',').trim();
    $('#heroTagline').textContent = cafe.tagline;
    $('#heroIntro').textContent = cafe.intro;
    $('#heroBg').style.backgroundImage = `url("${IMAGES.hero}")`;

    $('#quickNote').textContent =
      `PS5 controller charge: ${controllerBreakdown(state.rates.PS5) || 'Rs.100 Solo · Rs.160 Duo · Rs.240 Trio · Rs.320 Squad'}`;

    $('#pricingBlurb').textContent =
      'Pay only for the time you play — longer sessions get better value, and squads on the ' +
      'PlayStation pay less per person.';

    $('#bookingBlurb').textContent =
      'Pick a day, a start time and how long you want to play. We show you exactly which ' +
      'stations are still free.';

    const pcCount = state.stations.filter((s) => s.type === 'PC').length;
    const ps5Count = state.stations.filter((s) => s.type === 'PS5').length;

    document.querySelectorAll('.js-whatsapp').forEach((link) => {
      if (!link.getAttribute('href')) {
        link.href = whatsappLink(`Hi ${cafe.name}! I would like to book a gaming slot.`);
        link.target = '_blank';
        link.rel = 'noopener';
      }
    });

    const callLink = document.querySelector('.js-call');
    if (callLink) callLink.href = `tel:${cafe.contact.phone[0].replace(/\s/g, '')}`;

    // Hero stats
    $('#heroStats').innerHTML = [
      { value: String(pcCount), label: 'Gaming PCs' },
      { value: String(ps5Count), label: 'PS5 zones' },
      { value: cafe.hours.label, label: 'Open daily' },
      { value: 'Online', label: 'Slot booking' },
    ].map((stat) => `
      <div class="stat">
        <b>${escapeHtml(stat.value)}</b>
        <span>${escapeHtml(stat.label)}</span>
      </div>`).join('');

    // Quick rate card in the hero
    $('#quickRates').innerHTML = Object.values(state.rates).map((plan) => `
      <div class="rate-row">
        <span class="label">${escapeHtml(plan.label)}</span>
        <span class="value">
          ${formatMoney(plan.hourly)}
          <small>per hour · ${formatMoney(plan.halfHour)} for 30 mins</small>
        </span>
      </div>`).join('');

    // Pricing section
    $('#rateGrid').innerHTML = Object.values(state.rates).map((plan) => {
      const chip = plan.type === 'PC' ? `${pcCount} stations` : `${ps5Count} zones`;

      return `
        <article class="rate-card">
          <div class="rate-card__top">
            <h3>${escapeHtml(plan.label)}</h3>
            <span class="chip">${escapeHtml(chip)}</span>
          </div>

          <div class="rate-hero">
            <b>${formatMoney(plan.hourly)}</b>
            <span>per hour</span>
          </div>
          <div class="muted" style="font-size:.9rem">
            ${formatMoney(plan.halfHour)} for the first 30 minutes
          </div>

          <table class="price-table">
            <thead>
              <tr><th>Play time</th><th>Price</th></tr>
            </thead>
            <tbody>
              ${plan.table.map((row) => `
                <tr><td>${escapeHtml(row.label)}</td><td>${formatMoney(row.price)}</td></tr>
              `).join('')}
            </tbody>
          </table>

          <ul class="perks">
            ${plan.perks.map((perk) => `<li>${escapeHtml(perk)}</li>`).join('')}
          </ul>

          ${plan.playerCharge ? `
            <div class="note-strip" style="margin-top:20px">
              Controller charge — ${controllerBreakdown(plan)}.
            </div>` : ''}

          ${plan.squadPackages ? `
            <div class="note-strip note-strip--deal" style="margin-top:14px">
              <strong>Squad deal · 4 players, all in</strong><br>
              ${plan.squadPackages.map((pkg) =>
                `${formatDuration(pkg.minutes)} ${formatMoney(pkg.price)}`).join(' · ')}
            </div>` : ''}
        </article>`;
    }).join('');

    $('#pricingNote').innerHTML =
      'PS5 prices are per station. Controller charge — ' + controllerBreakdown(state.rates.PS5) +
      '. Squad of 4? Grab the all-in deals above — console time and controllers included.';

    // Gallery
    $('#galleryGrid').innerHTML = IMAGES.gallery.map((prompt, index) => `
      <figure>
        <img src="${imageUrl(prompt, index % 3 === 0 ? 'landscape_4_3' : 'square')}"
             alt="Inside Bro Code Gaming Zone" loading="lazy">
      </figure>`).join('');

    // Visit panel
    const contact = cafe.contact;
    $('#visitList').innerHTML = `
      <div class="visit-item">
        <div class="visit-item__icon">◎</div>
        <div>
          <h4>Address</h4>
          <p>${escapeHtml(contact.address)}</p>
        </div>
      </div>
      <div class="visit-item">
        <div class="visit-item__icon">◷</div>
        <div>
          <h4>Timings</h4>
          <p>${escapeHtml(cafe.hours.label)} · ${escapeHtml(cafe.hours.days)}</p>
        </div>
      </div>
      <div class="visit-item">
        <div class="visit-item__icon">✆</div>
        <div>
          <h4>Call or WhatsApp</h4>
          <p>${contact.whatsappDisplay.map(escapeHtml).join(' · ')}</p>
        </div>
      </div>`;

    $('#mapFrame').innerHTML = `
      <iframe title="Bro Code Gaming Zone location"
        src="https://www.google.com/maps?q=${encodeURIComponent(contact.mapQuery)}&output=embed"
        loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;

    $('#footerBlurb').textContent =
      `${cafe.hours.label} · ${contact.address}`;

    $('#footerContact').innerHTML = `
      ${contact.whatsappDisplay.map((number, index) => `
        <a href="${whatsappLink('Hi Bro Code Gaming Zone! I would like to book a gaming slot.')}"
           target="_blank" rel="noopener">WhatsApp ${escapeHtml(number)}</a>`).join('')}
      <a href="tel:${contact.phone[0].replace(/\s/g, '')}">${escapeHtml(contact.phone[0])}</a>`;

    $('#footerCopy').textContent =
      `© ${new Date().getFullYear()} ${cafe.name}. All rights reserved.`;
  }

  /* --------------------------------------------------------------- pricing */

  function planFor(type) {
    return state.rates[type] || null;
  }

  function durationsFor(type) {
    const plan = planFor(type);
    return plan ? plan.durations.slice() : [];
  }

  function allDurations() {
    const set = new Set();
    Object.values(state.rates).forEach((plan) => plan.durations.forEach((d) => set.add(d)));
    return Array.from(set).sort((a, b) => a - b);
  }

  function quoteFor(type, minutes, players) {
    const plan = planFor(type);
    if (!plan) return { timePrice: 0, playerCharge: 0, total: 0, players: 1, squadPackage: false };

    let count = 1;
    if (plan.playerCharge) {
      count = Math.max(1, Math.min(plan.playerCharge.maxPlayers, Number(players) || 1));
    }

    if (plan.squadPackages) {
      const pkg = plan.squadPackages.find(
        (entry) => entry.players === count && Number(entry.minutes) === Number(minutes),
      );
      if (pkg) {
        return {
          timePrice: pkg.price,
          playerCharge: 0,
          total: pkg.price,
          players: count,
          squadPackage: true,
        };
      }
    }

    const row = plan.table.find((entry) => Number(entry.minutes) === Number(minutes));
    const timePrice = row ? row.price : 0;

    let playerCharge = 0;
    if (plan.playerCharge) {
      playerCharge = count === 1
        ? plan.playerCharge.solo
        : plan.playerCharge.perPerson * count;
    }

    return { timePrice, playerCharge, total: timePrice + playerCharge, players: count, squadPackage: false };
  }

  function currentQuote() {
    const station = stationById(state.stationId);
    if (!station) return null;
    return quoteFor(station.type, state.duration, state.players);
  }

  /* ---------------------------------------------------------------- helpers */

  function stationById(id) {
    return state.stations.find((station) => station.id === id) || null;
  }

  function nowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function isToday(iso) {
    return iso === toISODate(new Date());
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function clashFor(station, startMinutes, durationMinutes) {
    const list = state.availability[station.id] || [];
    const end = startMinutes + durationMinutes;

    return list.find((slot) =>
      overlaps(startMinutes, end, timeToMinutes(slot.start), timeToMinutes(slot.end))) || null;
  }

  function openMinutes() {
    return timeToMinutes(state.hours.open);
  }

  function closeMinutes() {
    return timeToMinutes(state.hours.close);
  }

  /* ------------------------------------------------------------- rendering */

  function renderStartOptions() {
    const select = $('#bkStart');
    const step = state.slotMinutes;
    const earliest = openMinutes();
    const latest = closeMinutes() - (state.duration || 30);

    const previous = select.value;
    const options = [];

    for (let minutes = earliest; minutes <= latest; minutes += step) {
      if (isToday(state.date) && minutes <= nowMinutes()) continue;
      options.push(minutes);
    }

    select.innerHTML = options.length
      ? options.map((minutes) => {
          const value = minutesToTime(minutes);
          return `<option value="${value}">${formatTimeLabel(value)}</option>`;
        }).join('')
      : '<option value="">No slots left for this date</option>';

    if (options.length && previous && options.includes(timeToMinutes(previous))) {
      select.value = previous;
    }

    state.start = select.value || '';
    $('#bkStartHint').textContent = options.length
      ? `Last start time is ${formatTimeLabel(minutesToTime(latest))}`
      : `We close at ${formatTimeLabel(state.hours.close)}. Try another day.`;
  }

  function renderDurationOptions() {
    const select = $('#bkDuration');
    const station = stationById(state.stationId);
    const list = station ? durationsFor(station.type) : allDurations();

    const previous = Number(select.value) || 0;
    select.innerHTML = list
      .map((minutes) => `<option value="${minutes}">${formatDuration(minutes)}</option>`)
      .join('');

    // Keep the closest duration that is still valid for this station type.
    const smaller = list.filter((minutes) => minutes <= previous);
    select.value = String(smaller.length ? smaller[smaller.length - 1] : list[0]);

    state.duration = Number(select.value) || 30;
    $('#bkDurationHint').textContent = station
      ? `${formatDuration(state.duration)} on ${station.label}`
      : 'Choose a duration to see live availability';
  }

  function renderStationGrid() {
    const startMinutes = timeToMinutes(state.start);
    const ready = startMinutes !== null && state.duration > 0;

    const groups = { PC: $('#pcGrid'), PS5: $('#ps5Grid') };
    let freeCount = 0;

    Object.keys(groups).forEach((type) => {
      const stations = state.stations.filter((station) => station.type === type);

      groups[type].innerHTML = stations.map((station) => {
        const clash = ready ? clashFor(station, startMinutes, state.duration) : null;
        if (!clash) freeCount += 1;

        const subtitle = clash
          ? `Booked ${formatTimeLabel(clash.start)}–${formatTimeLabel(clash.end)}`
          : (ready ? 'Available' : station.spec);

        return `
          <button type="button" class="station" data-station="${station.id}"
                  ${clash ? 'disabled' : ''}
                  aria-pressed="${state.stationId === station.id ? 'true' : 'false'}"
                  title="${escapeHtml(station.spec)}">
            <strong>${escapeHtml(station.label.replace('Gaming ', '').replace('PlayStation 5 · ', 'PS5 '))}</strong>
            <span>${escapeHtml(subtitle)}</span>
          </button>`;
      }).join('');
    });

    const pcCount = state.stations.filter((s) => s.type === 'PC').length;
    const ps5Count = state.stations.filter((s) => s.type === 'PS5').length;
    $('#pcCount').textContent = `· ${pcCount} stations`;
    $('#ps5Count').textContent = `· ${ps5Count} zones`;

    if (!ready) {
      $('#availabilityNote').textContent = 'Pick a date, start time and duration to see availability.';
    } else {
      $('#availabilityNote').textContent =
        `${freeCount} of ${state.stations.length} stations free from ` +
        `${formatTimeLabel(state.start)} for ${formatDuration(state.duration)} ` +
        `on ${formatDateLabel(state.date)}.`;
    }

    const station = stationById(state.stationId);
    if (station && ready && clashFor(station, startMinutes, state.duration)) {
      state.stationId = '';
    }
  }

  function renderPlayerField() {
    const station = stationById(state.stationId);
    const plan = station ? planFor(station.type) : null;
    const wrap = $('#bkPlayersWrap');
    const select = $('#bkPlayers');

    if (!plan || !plan.playerCharge) {
      wrap.hidden = true;
      state.players = 1;
      return;
    }

    wrap.hidden = false;
    const max = plan.playerCharge.maxPlayers;
    const previous = Number(select.value) || 1;

    select.innerHTML = Array.from({ length: max }, (_, index) => {
      const count = index + 1;
      const quote = quoteFor(station.type, state.duration, count);
      const note = quote.squadPackage
        ? `squad deal ${formatMoney(quote.total)} all in`
        : `controller ${formatMoney(quote.playerCharge)}`;
      return `<option value="${count}">${count} ${count === 1 ? 'player' : 'players'} · ${note}</option>`;
    }).join('');

    select.value = String(Math.min(previous, max));
    state.players = Number(select.value);

    const deal = (plan.squadPackages || []).find(
      (entry) => Number(entry.minutes) === Number(state.duration),
    );
    $('#bkPlayersHint').textContent = deal
      ? `Controller charge: ${controllerBreakdown(plan)}. Squad of 4 for ` +
        `${formatDuration(state.duration)}: ${formatMoney(deal.price)} all in (console + controllers).`
      : `Controller charge: ${controllerBreakdown(plan)}.`;
  }

  function renderSummary() {
    const station = stationById(state.stationId);
    const quote = currentQuote();

    const lines = [
      ['Station', station ? station.label : 'Not selected'],
      ['Date', state.date ? formatDateLabel(state.date) : '—'],
      ['Time', state.start
        ? `${formatTimeLabel(state.start)} – ${formatTimeLabel(minutesToTime(timeToMinutes(state.start) + state.duration))}`
        : '—'],
      ['Duration', state.duration ? formatDuration(state.duration) : '—'],
    ];

    if (station && station.type === 'PS5') {
      lines.push(['Players', `${state.players}`]);
    }

    if (quote) {
      if (quote.squadPackage) {
        lines.push(['Squad deal (4 players)', formatMoney(quote.total)]);
      } else {
        lines.push(['Station charge', formatMoney(quote.timePrice)]);
        if (quote.playerCharge) lines.push(['Controller charge', formatMoney(quote.playerCharge)]);
      }
    }

    $('#summaryLines').innerHTML = lines.map(([label, value]) => `
      <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');

    $('#summaryTotal').textContent = formatMoney(quote ? quote.total : 0);
    $('#summaryStatus').textContent = station ? 'Ready to book' : 'Pending';
  }

  function renderAll() {
    renderDurationOptions();
    renderStartOptions();
    renderStationGrid();
    renderPlayerField();
    renderSummary();
  }

  /* --------------------------------------------------------- availability IO */

  let availabilityToken = 0;

  async function loadAvailability() {
    const token = ++availabilityToken;

    try {
      const payload = await api(`/api/availability?date=${encodeURIComponent(state.date)}`);
      if (token !== availabilityToken) return;

      state.availability = {};
      payload.stations.forEach((station) => {
        state.availability[station.id] = station.busy || [];
      });
    } catch (error) {
      if (token !== availabilityToken) return;
      state.availability = {};
      toast(error.message, 'err');
    }

    renderAll();
  }

  /* ----------------------------------------------------------------- offers */

  async function loadOffers() {
    const grid = $('#offersGrid');

    try {
      const { offers } = await api('/api/offers');

      if (!offers.length) {
        grid.innerHTML = '<p class="muted">No offers are running right now. Follow us on WhatsApp for the next drop.</p>';
        return;
      }

      grid.innerHTML = offers.map((offer) => `
        <article class="offer-card ${offer.highlight ? 'offer-card--hot' : ''}">
          <span class="chip">${escapeHtml(offer.badge)}</span>
          <h3>${escapeHtml(offer.title)}</h3>
          <p>${escapeHtml(offer.description)}</p>
          ${offer.detail ? `<div class="offer-detail">${escapeHtml(offer.detail)}</div>` : ''}
          <div class="offer-expiry">
            <span>${offer.validToLabel ? `Valid till ${escapeHtml(offer.validToLabel)}` : 'Ongoing'}</span>
            <a class="muted" style="color:var(--red)"
               href="${whatsappLink(`Hi Bro Code Gaming Zone! I want to claim the "${offer.title}" offer.`)}"
               target="_blank" rel="noopener">Claim on WhatsApp</a>
          </div>
        </article>`).join('');

      // Scrolling ticker built from the same live offers
      const items = offers.map((offer) => `
        <span class="ticker-item">${escapeHtml(offer.badge)} — ${escapeHtml(offer.title)}</span>`).join('');
      $('#tickerTrack').innerHTML = items + items;
    } catch (error) {
      grid.innerHTML = '<p class="muted">Could not load offers right now. Please refresh the page.</p>';
    }
  }

  /* ------------------------------------------------------------ tournaments */

  async function loadTournaments() {
    const grid = $('#tournamentsGrid');

    try {
      const { tournaments } = await api('/api/tournaments');

      if (!tournaments.length) {
        grid.innerHTML = '<p class="muted">No tournaments are scheduled right now. New brackets drop every month.</p>';
        return;
      }

      grid.innerHTML = tournaments.map((tournament) => {
        const full = tournament.slotsLeft === 0;
        const canRegister = !tournament.isPast && !full;

        return `
          <article class="tournament">
            <div class="tournament__banner">
              <span class="chip">${escapeHtml(tournament.platform || tournament.game || 'Esports')}</span>
              ${tournament.image ? `<img src="${escapeHtml(tournament.image)}" alt="${escapeHtml(tournament.title)}" loading="lazy">` : ''}
            </div>

            <div class="tournament__body">
              <h3>${escapeHtml(tournament.title)}</h3>
              <div class="tournament__game">${escapeHtml(tournament.game || '')}</div>
              <div class="tournament__mode">${escapeHtml(tournament.mode || '')}</div>

              <div class="tournament__meta">
                <div><span>Date</span><b>${escapeHtml(tournament.dateLabel.split(',')[1] || tournament.dateLabel)}</b></div>
                <div><span>Starts</span><b>${escapeHtml(tournament.timeLabel || '')}</b></div>
                <div><span>Entry</span><b>${escapeHtml(tournament.entryLabel || formatMoney(tournament.entryFee))}</b></div>
              </div>

              <div class="tournament__meta" style="margin-top:10px;grid-template-columns:1fr">
                <div><span>Prize pool</span><b style="color:var(--red)">${escapeHtml(tournament.prizeLabel || formatMoney(tournament.prizePool))}</b></div>
              </div>

              ${tournament.details ? `<p class="tournament__details">${escapeHtml(tournament.details)}</p>` : ''}

              <div class="slot-bar">
                <div class="slot-bar__labels">
                  <span>${tournament.takenSlots} / ${tournament.totalSlots} slots taken</span>
                  <span>${tournament.isPast ? 'Completed' : `${tournament.slotsLeft} left`}</span>
                </div>
                <div class="slot-bar__track">
                  <div class="slot-bar__fill" style="width:${tournament.fillPercent}%"></div>
                </div>
              </div>

              <div class="tournament__footer">
                ${tournament.isPast
                  ? '<span class="badge-past">Tournament completed</span>'
                  : canRegister
                    ? `<button class="btn btn-primary btn-sm js-register" data-id="${tournament.id}">Register squad</button>
                       <a class="btn btn-quiet btn-sm"
                          href="${whatsappLink(`Hi Bro Code Gaming Zone! I want to know more about the ${tournament.title} tournament.`)}"
                          target="_blank" rel="noopener">Ask on WhatsApp</a>`
                    : '<span class="badge-past">All slots full</span>'}
              </div>
            </div>
          </article>`;
      }).join('');
    } catch (error) {
      grid.innerHTML = '<p class="muted">Could not load tournaments right now. Please refresh the page.</p>';
    }
  }

  /* ----------------------------------------------------------------- modal */

  function openModal(html) {
    $('#modalBody').innerHTML = html;
    $('#modal').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal').classList.remove('show');
    document.body.style.overflow = '';
  }

  async function openRegisterModal(id) {
    let tournament = null;

    try {
      const payload = await api('/api/tournaments');
      tournament = payload.tournaments.find((item) => item.id === id) || null;
    } catch (error) {
      toast(error.message, 'err');
      return;
    }

    if (!tournament) return;

    openModal(`
      <h3 id="modalTitle">${escapeHtml(tournament.title)}</h3>
      <p class="modal-sub">
        ${escapeHtml(tournament.dateLabel)} at ${escapeHtml(tournament.timeLabel || '')} ·
        ${escapeHtml(tournament.entryLabel || formatMoney(tournament.entryFee))} ·
        ${escapeHtml(tournament.prizeLabel || formatMoney(tournament.prizePool))}
      </p>

      ${tournament.rules && tournament.rules.length ? `
        <ul class="rule-list">
          ${tournament.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}
        </ul>` : ''}

      <div class="form-msg" id="regError"></div>

      <form id="regForm">
        <div class="field">
          <label for="regTeam">Team name</label>
          <input type="text" id="regTeam" maxlength="60" required placeholder="e.g. Team Phantom">
        </div>
        <div class="field-row">
          <div class="field">
            <label for="regCaptain">Captain name</label>
            <input type="text" id="regCaptain" maxlength="50" required placeholder="Full name">
          </div>
          <div class="field">
            <label for="regPhone">Mobile number</label>
            <input type="tel" id="regPhone" maxlength="15" required placeholder="10 digit mobile" inputmode="numeric">
          </div>
        </div>
        <div class="field">
          <label for="regPlayers">Number of players</label>
          <input type="number" id="regPlayers" min="1" max="10" value="1">
        </div>
        <div class="field">
          <label for="regNotes">Notes (optional)</label>
          <textarea id="regNotes" maxlength="300" placeholder="Substitute names, preferred slot, etc."></textarea>
        </div>
        <div class="hint" style="margin-bottom:18px">
          ${tournament.slotsLeft} of ${tournament.totalSlots} slots still open. Entry fee is paid at the counter.
        </div>
        <button class="btn btn-primary btn-full" type="submit" id="regSubmit">Register my team</button>
      </form>
    `);

    $('#regForm').addEventListener('submit', async (event) => {
      event.preventDefault();

      const button = $('#regSubmit');
      const errorBox = $('#regError');
      errorBox.classList.remove('show');
      button.disabled = true;
      button.textContent = 'Registering…';

      try {
        const payload = await api(`/api/tournaments/${id}/register`, {
          method: 'POST',
          body: {
            teamName: $('#regTeam').value.trim(),
            captainName: $('#regCaptain').value.trim(),
            phone: $('#regPhone').value.trim(),
            players: Number($('#regPlayers').value) || 1,
            notes: $('#regNotes').value.trim(),
          },
        });

        openModal(`
          <h3 id="modalTitle">You are in!</h3>
          <p class="modal-sub">
            ${escapeHtml(payload.registration.teamName)} is registered for
            ${escapeHtml(payload.tournamentTitle)}. We will confirm on WhatsApp and share the
            room details before the match.
          </p>
          <div class="ticket show">
            <h4>Registration details</h4>
            <p><strong>Captain:</strong> ${escapeHtml(payload.registration.captainName)}</p>
            <p><strong>Mobile:</strong> ${escapeHtml(payload.registration.phone)}</p>
            <p><strong>Players:</strong> ${escapeHtml(payload.registration.players)}</p>
            <p>${payload.slotsLeft} slot(s) still open in this bracket.</p>
          </div>
          <div class="ticket-actions" style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
            <a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener"
               href="${whatsappLink(`Hi Bro Code Gaming Zone! I registered team "${payload.registration.teamName}" for ${payload.tournamentTitle}. My mobile number is ${payload.registration.phone}.`)}">
              Confirm on WhatsApp
            </a>
            <button class="btn btn-quiet btn-sm" type="button" id="modalDone">Done</button>
          </div>
        `);

        $('#modalDone').addEventListener('click', () => {
          closeModal();
          loadTournaments();
        });

        loadTournaments();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.add('show');
        button.disabled = false;
        button.textContent = 'Register my team';
      }
    });
  }

  /* --------------------------------------------------------------- booking */

  function showBookingError(message) {
    const box = $('#bkError');
    if (!message) {
      box.classList.remove('show');
      box.textContent = '';
      return;
    }
    box.textContent = message;
    box.classList.add('show');
  }

  function resetTicket() {
    $('#bkTicket').classList.remove('show');
    const pay = $('#bkPay');
    if (pay) pay.hidden = true;
  }

  /* --------------------------------------------------- online payment (UPI) */

  function upiPayLink(amount, note) {
    const pay = (state.cafe && state.cafe.payments) || {};
    if (!pay.upiId) return '';

    const params = new URLSearchParams({
      pa: pay.upiId,
      pn: pay.payeeName || state.cafe.name || 'Gaming Cafe',
      am: String(amount),
      cu: 'INR',
      tn: note,
    });
    return `upi://pay?${params.toString()}`;
  }

  function qrImageUrl(data, size = 240) {
    return 'https://api.qrserver.com/v1/create-qr-code/?margin=8' +
      `&size=${size}x${size}&data=${encodeURIComponent(data)}`;
  }

  function renderPayment(booking) {
    const panel = $('#bkPay');
    if (!panel) return;

    const pay = (state.cafe && state.cafe.payments) || {};
    if (!pay.upiId) {
      panel.hidden = true;
      return;
    }

    const amount = Number(booking.quotedTotal) || 0;
    const link = upiPayLink(amount, `Bro Code booking ${booking.code}`);

    $('#payQr').src = qrImageUrl(link, 240);
    $('#payQr').alt = `Scan to pay ${formatMoney(amount)} to ${pay.upiId}`;
    $('#payAmount').textContent = formatMoney(amount);
    $('#payUpiId').textContent = pay.upiId;
    $('#payNote').textContent = pay.note || '';
    $('#payWhatsapp').href = whatsappLink(
      `Hi Bro Code Gaming Zone! I have paid ${formatMoney(amount)} for booking ` +
      `${booking.code} to ${pay.upiId}. Sharing the payment screenshot now.`,
    );

    panel.hidden = false;
  }

  function initBookingForm() {
    const dateInput = $('#bkDate');
    const today = toISODate(new Date());

    dateInput.min = today;
    dateInput.max = addDays(today, state.maxAdvanceDays);
    state.date = today;
    dateInput.value = today;

    // If today has no slots left, roll over to tomorrow.
    if (nowMinutes() >= closeMinutes() - state.slotMinutes) {
      state.date = addDays(today, 1);
      dateInput.value = state.date;
    }

    $('#bkDateHint').textContent =
      `Open ${state.hours.label} · bookings up to ${state.maxAdvanceDays} days ahead`;

    state.duration = allDurations()[0] || 30;

    dateInput.addEventListener('change', () => {
      const value = dateInput.value;
      if (!value) return;

      state.date = value;
      state.stationId = '';
      resetTicket();
      showBookingError('');
      loadAvailability();
    });

    $('#bkDuration').addEventListener('change', (event) => {
      state.duration = Number(event.target.value) || 30;
      resetTicket();
      renderStartOptions();
      renderStationGrid();
      renderPlayerField();
      renderSummary();
    });

    $('#bkStart').addEventListener('change', (event) => {
      state.start = event.target.value;
      resetTicket();
      renderStationGrid();
      renderSummary();
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('.station');
      if (!button || button.disabled) return;

      state.stationId = button.dataset.station;
      resetTicket();
      showBookingError('');
      renderDurationOptions();
      renderStartOptions();
      renderStationGrid();
      renderPlayerField();
      renderSummary();
    });

    $('#bkPlayers').addEventListener('change', (event) => {
      state.players = Number(event.target.value) || 1;
      renderPlayerField();
      renderSummary();
    });

    $('#ticketReset').addEventListener('click', () => {
      resetTicket();
      $('#bookingForm').reset();
      state.stationId = '';
      state.players = 1;
      if (!dateInput.value) dateInput.value = state.date;
      state.date = dateInput.value;
      loadAvailability();
      document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#payCopy').addEventListener('click', async () => {
      const id = $('#payUpiId').textContent.trim();
      if (!id || id === '—') return;
      try {
        await navigator.clipboard.writeText(id);
        toast(`UPI ID copied — ${id}`, 'ok');
      } catch (error) {
        toast('Copy failed. Please note down the UPI ID manually.', 'err');
      }
    });

    $('#bookingForm').addEventListener('submit', submitBooking);

    renderAll();
    loadAvailability();
  }

  async function submitBooking(event) {
    event.preventDefault();

    const button = $('#bkSubmit');
    const station = stationById(state.stationId);

    if (!station) {
      showBookingError('Please choose a gaming station to continue.');
      return;
    }
    if (!state.start) {
      showBookingError('Please choose a start time.');
      return;
    }

    showBookingError('');
    button.disabled = true;
    button.textContent = 'Reserving your slot…';

    try {
      const payload = await api('/api/bookings', {
        method: 'POST',
        body: {
          name: $('#bkName').value.trim(),
          phone: $('#bkPhone').value.trim(),
          stationId: station.id,
          date: state.date,
          start: state.start,
          duration: state.duration,
          players: state.players,
          notes: $('#bkNotes').value.trim(),
        },
      });

      const booking = payload.booking;

      $('#ticketCode').textContent = booking.code;
      $('#ticketSummary').textContent =
        `${booking.stationLabel} · ${formatDateLabel(booking.date)} · ` +
        `${formatTimeLabel(booking.start)} – ${formatTimeLabel(booking.end)} · ` +
        `${formatDuration(booking.durationMinutes)} · Estimated ${formatMoney(booking.quotedTotal)}`;

      $('#ticketNote').textContent =
        'We will confirm it on WhatsApp shortly. Pay online below or at the counter — ' +
        'show this code when you arrive.';

      $('#ticketWhatsapp').href = whatsappLink(
        `Hi Bro Code Gaming Zone! I booked a slot. My booking code is ${booking.code} — ` +
        `${booking.stationLabel}, ${formatDateLabel(booking.date)}, ` +
        `${formatTimeLabel(booking.start)} to ${formatTimeLabel(booking.end)}. Name: ${booking.name}.`,
      );

      renderPayment(booking);

      $('#bkTicket').classList.add('show');
      toast(`Slot requested. Your booking code is ${booking.code}.`, 'ok');
      $('#bkTicket').scrollIntoView({ behavior: 'smooth', block: 'center' });

      loadAvailability();
    } catch (error) {
      showBookingError(error.message);
      toast(error.message, 'err');
    } finally {
      button.disabled = false;
      button.textContent = 'Confirm my slot';
    }
  }

  function initTracker() {
    const input = $('#trackCode');
    const button = $('#trackBtn');
    const result = $('#trackResult');

    const statusTone = {
      pending: 'var(--warn)',
      confirmed: 'var(--ok)',
      completed: 'var(--info)',
      declined: 'var(--red)',
      cancelled: 'var(--dim)',
    };

    async function check() {
      const code = input.value.trim().toUpperCase();
      if (!code) {
        toast('Enter the booking code from your confirmation.', 'err');
        return;
      }

      button.disabled = true;
      try {
        const payload = await api(`/api/bookings/${encodeURIComponent(code)}`);
        const booking = payload.booking;

        result.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <strong style="font-family:var(--head);letter-spacing:.1em">${escapeHtml(booking.code)}</strong>
            <span class="chip" style="color:${statusTone[booking.status] || 'var(--muted)'};
                  border-color:${statusTone[booking.status] || 'var(--line-2)'}">
              ${escapeHtml(booking.status)}
            </span>
          </div>
          <div class="muted" style="margin-top:10px;font-size:.92rem">
            ${escapeHtml(booking.name)} · ${escapeHtml(booking.stationLabel)}<br>
            ${escapeHtml(payload.dateLabel)} · ${escapeHtml(payload.startLabel)} – ${escapeHtml(formatTimeLabel(booking.end))}<br>
            Estimated ${formatMoney(booking.quotedTotal)}
            ${booking.adminNote ? `<br><span style="color:#ffc9d2">Cafe note: ${escapeHtml(booking.adminNote)}</span>` : ''}
          </div>`;
        result.classList.add('show');
      } catch (error) {
        result.innerHTML = `<span class="muted">${escapeHtml(error.message)}</span>`;
        result.classList.add('show');
      } finally {
        button.disabled = false;
      }
    }

    button.addEventListener('click', check);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        check();
      }
    });
  }

  /* -------------------------------------------------------------- shell nav */

  function initNav() {
    const toggle = $('#navToggle');
    const links = $('#navLinks');

    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '✕' : '☰';
    });

    links.addEventListener('click', (event) => {
      if (event.target.tagName === 'A') {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '☰';
      }
    });
  }

  function initModal() {
    $('#modalClose').addEventListener('click', closeModal);

    $('#modal').addEventListener('click', (event) => {
      if (event.target.id === 'modal') closeModal();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('.js-register');
      if (button) openRegisterModal(button.dataset.id);
    });
  }

  /* ------------------------------------------------------------------- boot */

  async function boot() {
    initNav();
    initModal();
    initTracker();

    try {
      const payload = await api('/api/site');

      state.cafe = payload.cafe;
      state.hours = payload.hours;
      state.stations = payload.stations;
      state.stationTypes = payload.stationTypes;
      state.slotMinutes = payload.slotMinutes;
      state.maxAdvanceDays = payload.maxAdvanceDays;
      state.rates = {};
      payload.rates.forEach((plan) => { state.rates[plan.type] = plan; });
    } catch (error) {
      toast('Could not reach the booking server. Please refresh the page.', 'err');
      return;
    }

    renderStatic();
    initBookingForm();

    loadOffers();
    loadTournaments();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
