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

  /** "Solo Rs.100 · Duo Rs.160 · Trio Rs.240 · Squad Rs.320" for a group plan. */
  function controllerBreakdown(plan) {
    if (!plan || !plan.groupRates) return '';
    const labels = ['Solo', 'Duo', 'Trio', 'Squad'];
    const count = Math.max(1, Math.min(Number(plan.maxPlayers) || 1, labels.length));
    return labels.slice(0, count).map((label, index) => {
      return `${label} ${formatMoney(plan.groupRates[index])}`;
    }).join(' · ');
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
    stationIds: [],
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
      `PS5 controller per hour: ${controllerBreakdown(state.rates.PS5C) || 'Solo Rs.100 · Duo Rs.160 · Trio Rs.240 · Squad Rs.320'}`;

    $('#pricingBlurb').textContent =
      'Pay only for the time you play — longer sessions get better value, and squads on the ' +
      'PlayStation pay less per person.';

    $('#bookingBlurb').textContent =
      'Pick a day, a start time and how long you want to play. We show you exactly which ' +
      'stations are still free — and you can book several gaming PCs for your squad in one go.';

    const pcCount = state.stations.filter((s) => s.type === 'PC').length;
    const controllerCount = state.stations.filter((s) => s.type === 'PS5C').length;
    const wheelCount = state.stations.filter((s) => s.type === 'PS5W').length;
    const ps5Count = controllerCount + wheelCount;

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
    $('#quickRates').innerHTML = Object.values(state.rates).map((plan) => {
      const detail = plan.group
        ? `${formatMoney(plan.groupRates[0])}
           <small>per hour solo · ${formatMoney(plan.groupRates[plan.groupRates.length - 1])} for a squad</small>`
        : `${formatMoney(plan.hourly)}
           <small>per hour · ${formatMoney(plan.halfHour)} for 30 mins</small>`;

      return `
      <div class="rate-row">
        <span class="label">${escapeHtml(plan.label)}</span>
        <span class="value">${detail}</span>
      </div>`;
    }).join('');

    // Pricing section
    const stationCounts = { PC: pcCount, PS5C: controllerCount, PS5W: wheelCount };

    $('#rateGrid').innerHTML = Object.values(state.rates).map((plan) => {
      const units = plan.type === 'PC' ? 'stations' : 'setups';
      const chip = `${stationCounts[plan.type] || 0} ${units}`;

      const hero = plan.group ? `From ${formatMoney(plan.groupRates[0])}` : formatMoney(plan.hourly);
      const heroNote = plan.group
        ? 'Price per hour depends on how many play — see the table below'
        : `${formatMoney(plan.halfHour)} for the first 30 minutes`;

      return `
        <article class="rate-card">
          <div class="rate-card__top">
            <h3>${escapeHtml(plan.label)}</h3>
            <span class="chip">${escapeHtml(chip)}</span>
          </div>

          <div class="rate-hero">
            <b>${escapeHtml(hero)}</b>
            <span>per hour</span>
          </div>
          <div class="muted" style="font-size:.9rem">
            ${escapeHtml(heroNote)}
          </div>

          <table class="price-table">
            <thead>
              <tr>${plan.tableHead.map((head) => `<th>${escapeHtml(head)}</th>`).join('')}</tr>
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

          ${plan.squadPackages ? `
            <div class="note-strip note-strip--deal" style="margin-top:14px">
              <strong>Squad deal · 4 players, all in</strong><br>
              ${plan.squadPackages.map((pkg) =>
                `${formatDuration(pkg.minutes)} ${formatMoney(pkg.price)}`).join(' · ')}
            </div>` : ''}
        </article>`;
    }).join('');

    $('#pricingNote').innerHTML =
      'Controller prices are per setup and per hour. PS5 controller — ' +
      (controllerBreakdown(state.rates.PS5C) ||
        'Solo Rs.100 · Duo Rs.160 · Trio Rs.240 · Squad Rs.320') +
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

  function allDurations() {
    const set = new Set();
    Object.values(state.rates).forEach((plan) => plan.durations.forEach((d) => set.add(d)));
    return Array.from(set).sort((a, b) => a - b);
  }

  /** Durations that every one of these station types can be booked for. */
  function commonDurations(types) {
    const plans = types.map(planFor).filter(Boolean);
    if (!plans.length) return allDurations();

    const shared = plans
      .map((plan) => plan.durations)
      .reduce((kept, list) => kept.filter((minutes) => list.includes(minutes)));

    return shared.length ? shared.slice().sort((a, b) => a - b) : allDurations();
  }

  /** Mirrors the server pricing: hours x hourly rate, plus the half hour rate. */
  function timePriceFor(plan, minutes, players) {
    const hourly = plan.group ? plan.groupRates[players - 1] : plan.hourly;
    const halfHour = plan.group ? Math.round(hourly / 2) : plan.halfHour;
    const mins = Number(minutes);

    let total = Math.floor(mins / 60) * hourly;
    if (mins % 60 >= 30) total += halfHour;
    return Math.round(total);
  }

  function quoteFor(type, minutes, players) {
    const plan = planFor(type);
    if (!plan) return { total: 0, players: 1, squadPackage: false };

    const max = Number(plan.maxPlayers) || 1;
    const count = Math.max(1, Math.min(max, Number(players) || 1));

    if (plan.squadPackages) {
      const pkg = plan.squadPackages.find(
        (entry) => entry.players === count && Number(entry.minutes) === Number(minutes),
      );
      if (pkg) return { total: pkg.price, players: count, squadPackage: true };
    }

    return { total: timePriceFor(plan, minutes, count), players: count, squadPackage: false };
  }

  function selectedStations() {
    return state.stationIds.map(stationById).filter(Boolean);
  }

  /** The group priced setup in the selection, if one is picked. */
  function groupStation() {
    return selectedStations().find((station) => {
      const plan = planFor(station.type);
      return plan && plan.group;
    }) || null;
  }

  /** What the whole selection costs for the chosen length of time. */
  function selectedTotal() {
    const chosen = selectedStations();
    if (!chosen.length) return 0;

    return chosen.reduce((sum, station) => {
      const plan = planFor(station.type);
      const players = plan && plan.group ? state.players : 1;
      return sum + quoteFor(station.type, state.duration, players).total;
    }, 0);
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

  function openMinutes() {
    return timeToMinutes(state.hours.open);
  }

  /** Close time on the trading day's scale — 09:59 the next morning is 2039. */
  function closeMinutes() {
    const close = timeToMinutes(state.hours.close);
    const open = openMinutes();
    return close <= open ? close + 1440 : close;
  }

  /** Clock times before the opening hour sit at the tail of the trading day. */
  function toTimeline(minutes) {
    return minutes < openMinutes() ? minutes + 1440 : minutes;
  }

  /** A booked window from /api/availability, as [start, end] on the timeline. */
  function slotRange(slot) {
    const start = toTimeline(timeToMinutes(slot.start));
    let end = toTimeline(timeToMinutes(slot.end));
    if (end <= start) end += 1440;
    return { start, end };
  }

  function clashFor(station, startAt, endAt) {
    const list = state.availability[station.id] || [];
    return list.find((slot) => {
      const range = slotRange(slot);
      return overlaps(startAt, endAt, range.start, range.end);
    }) || null;
  }

  /* ------------------------------------------------------------- rendering */

  function renderStartOptions() {
    const select = $('#bkStart');
    const step = state.slotMinutes;
    const earliest = openMinutes();
    const latest = closeMinutes() - (state.duration || 30);

    const previous = select.value;
    const options = [];

    // The trading day opens at `earliest` and runs into the next morning, so a
    // slot "after midnight" simply comes later on the same day.
    const nowClock = nowMinutes();
    const pastOnToday = isToday(state.date) && nowClock >= earliest ? nowClock : -1;

    for (let minutes = earliest; minutes <= latest; minutes += step) {
      if (minutes <= pastOnToday) continue;
      options.push(minutes);
    }

    select.innerHTML = options.length
      ? options.map((minutes) => {
          const value = minutesToTime(minutes);
          const nextMorning = minutes >= 1440 ? ' (next morning)' : '';
          return `<option value="${value}">${formatTimeLabel(value)}${nextMorning}</option>`;
        }).join('')
      : '<option value="">No slots left for this date</option>';

    if (options.length && previous && options.some((minutes) => minutesToTime(minutes) === previous)) {
      select.value = previous;
    }

    state.start = select.value || '';
    $('#bkStartHint').textContent = options.length
      ? `Last start time is ${formatTimeLabel(minutesToTime(latest))} · open ${state.hours.label}`
      : `${state.hours.label} — but every slot for this day has gone. Try another day.`;
  }

  function renderDurationOptions() {
    const select = $('#bkDuration');
    const chosen = selectedStations();
    const list = chosen.length
      ? commonDurations(chosen.map((station) => station.type))
      : allDurations();

    const previous = Number(select.value) || 0;
    select.innerHTML = list
      .map((minutes) => `<option value="${minutes}">${formatDuration(minutes)}</option>`)
      .join('');

    // Keep the closest duration that is still valid for this selection.
    const smaller = list.filter((minutes) => minutes <= previous);
    select.value = String(smaller.length ? smaller[smaller.length - 1] : list[0]);

    state.duration = Number(select.value) || 30;
    $('#bkDurationHint').textContent = chosen.length
      ? `${formatDuration(state.duration)} on ${chosen.map((station) => station.label).join(', ')}`
      : 'Choose your stations to see the durations available';
  }

  function renderStationGrid() {
    const startClock = timeToMinutes(state.start);
    const ready = startClock !== null && state.duration > 0;

    const startAt = ready ? toTimeline(startClock) : null;
    const endAt = ready ? startAt + state.duration : null;

    // Drop anything that got taken while the customer was choosing.
    if (ready) {
      state.stationIds = state.stationIds.filter((id) => {
        const station = stationById(id);
        return station && !clashFor(station, startAt, endAt);
      });
    }

    const groups = { PC: $('#pcGrid'), PS5C: $('#ps5cGrid'), PS5W: $('#ps5wGrid') };
    let freeCount = 0;

    Object.keys(groups).forEach((type) => {
      const stations = state.stations.filter((station) => station.type === type);

      groups[type].innerHTML = stations.map((station) => {
        const clash = ready ? clashFor(station, startAt, endAt) : null;
        if (!clash) freeCount += 1;

        const chosen = state.stationIds.includes(station.id);
        const subtitle = clash
          ? `Booked ${formatTimeLabel(clash.start)}–${formatTimeLabel(clash.end)}`
          : (ready ? (chosen ? 'Selected' : 'Available') : station.spec);

        return `
          <button type="button" class="station" data-station="${station.id}"
                  ${clash ? 'disabled' : ''}
                  aria-pressed="${chosen ? 'true' : 'false'}"
                  title="${escapeHtml(station.spec)}">
            <strong>${escapeHtml(station.label.replace('Gaming ', ''))}</strong>
            <span>${escapeHtml(subtitle)}</span>
          </button>`;
      }).join('');
    });

    const pcCount = state.stations.filter((s) => s.type === 'PC').length;
    const controllerCount = state.stations.filter((s) => s.type === 'PS5C').length;
    const wheelCount = state.stations.filter((s) => s.type === 'PS5W').length;
    $('#pcCount').textContent = `· ${pcCount} stations · pick as many as you need`;
    $('#ps5cCount').textContent = `· ${controllerCount} setup${controllerCount === 1 ? '' : 's'}`;
    $('#ps5wCount').textContent = `· ${wheelCount} setup${wheelCount === 1 ? '' : 's'}`;

    const picked = state.stationIds.length;

    if (!ready) {
      $('#availabilityNote').textContent = 'Pick a date, start time and duration to see availability.';
    } else {
      $('#availabilityNote').textContent =
        `${freeCount} of ${state.stations.length} stations free from ` +
        `${formatTimeLabel(state.start)} for ${formatDuration(state.duration)} ` +
        `on ${formatDateLabel(state.date)}` +
        (picked ? ` · ${picked} selected` : '');
    }
  }

  function renderPlayerField() {
    const station = groupStation();
    const plan = station ? planFor(station.type) : null;
    const wrap = $('#bkPlayersWrap');
    const select = $('#bkPlayers');

    if (!plan) {
      wrap.hidden = true;
      state.players = 1;
      return;
    }

    wrap.hidden = false;
    const max = Number(plan.maxPlayers) || 1;
    const previous = Number(select.value) || 1;

    select.innerHTML = Array.from({ length: max }, (_, index) => {
      const count = index + 1;
      const quote = quoteFor(station.type, state.duration, count);
      const note = quote.squadPackage
        ? `squad deal ${formatMoney(quote.total)} all in`
        : `${formatMoney(quote.total)} total`;
      return `<option value="${count}">${count} ${count === 1 ? 'player' : 'players'} · ${note}</option>`;
    }).join('');

    select.value = String(Math.min(previous, max));
    state.players = Number(select.value);

    const deal = (plan.squadPackages || []).find(
      (entry) => Number(entry.minutes) === Number(state.duration),
    );
    $('#bkPlayersHint').textContent = deal
      ? `Controller charge per hour — ${controllerBreakdown(plan)}. Squad of 4 for ` +
        `${formatDuration(state.duration)}: ${formatMoney(deal.price)} all in (console + controllers).`
      : `Controller charge per hour — ${controllerBreakdown(plan)}.`;
  }

  function renderSummary() {
    const chosen = selectedStations();
    const hasGroup = Boolean(groupStation());
    const total = chosen.length ? selectedTotal() : null;

    const lines = [
      ['Stations', chosen.length
        ? chosen.map((station) => station.label).join(', ')
        : 'Not selected'],
      ['Date', state.date ? formatDateLabel(state.date) : '—'],
      ['Time', state.start
        ? `${formatTimeLabel(state.start)} – ${formatTimeLabel(minutesToTime(timeToMinutes(state.start) + state.duration))}`
        : '—'],
      ['Duration', state.duration ? formatDuration(state.duration) : '—'],
    ];

    if (hasGroup) {
      lines.push(['Players', `${state.players}`]);
    }

    if (total !== null) {
      lines.push(['Estimated charge', formatMoney(total)]);
    }

    $('#summaryLines').innerHTML = lines.map(([label, value]) => `
      <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');

    $('#summaryTotal').textContent = formatMoney(total === null ? 0 : total);
    $('#summaryStatus').textContent = chosen.length
      ? `${chosen.length} station${chosen.length === 1 ? '' : 's'} ready`
      : 'Pending';
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
      state.stationIds = [];
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

      const id = button.dataset.station;
      const at = state.stationIds.indexOf(id);
      if (at === -1) state.stationIds.push(id);
      else state.stationIds.splice(at, 1);

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
      state.stationIds = [];
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
    const chosen = selectedStations();

    if (!chosen.length) {
      showBookingError('Please choose at least one gaming station to continue.');
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
          stationIds: chosen.map((station) => station.id),
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
