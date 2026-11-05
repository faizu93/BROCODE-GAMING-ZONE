/* ==========================================================================
   Bro Code Gaming Zone — owner dashboard
   ========================================================================== */

(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);

  const money = (amount) => `Rs.${Number(amount || 0).toLocaleString('en-IN')}`;

  function formatDateLabel(iso) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!parts) return String(iso || '');

    const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
  }

  const pad = (value) => String(value).padStart(2, '0');
  const todayISO = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  };

  let toastTimer = null;

  function toast(message, tone = '') {
    const node = $('#toast');
    node.textContent = message;
    node.className = `toast show ${tone}`.trim();

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = `toast ${tone}`.trim(); }, 4200);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let payload = {};
    try { payload = await response.json(); } catch (error) { payload = {}; }

    if (response.status === 401) {
      showLogin();
      throw new Error(payload.error || 'Your session expired. Please sign in again.');
    }

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || 'Something went wrong.');
    }

    return payload;
  }

  const state = {
    bookings: [],
    offers: [],
    tournaments: [],
    registrations: [],
    settings: null,
    filters: { date: '', status: 'all', q: '' },
  };

  /* --------------------------------------------------------------- modals */

  function openModal(html) {
    $('#modalBody').innerHTML = html;
    $('#modal').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal').classList.remove('show');
    document.body.style.overflow = '';
  }

  function initModal() {
    $('#modalClose').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', (event) => {
      if (event.target.id === 'modal') closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeModal();
    });
  }

  /* ------------------------------------------------------------------ auth */

  function showLogin() {
    $('#loginScreen').hidden = false;
    $('#app').hidden = true;
  }

  function showApp(user) {
    $('#loginScreen').hidden = true;
    $('#app').hidden = false;
    $('#adminUser').textContent = user ? `Signed in as ${user}` : 'Signed in';
    loadEverything();
  }

  async function checkSession() {
    try {
      const payload = await api('/api/admin/session');
      if (payload.signedIn) {
        showApp(payload.user);
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
    }
  }

  function initAuth() {
    $('#loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();

      const button = $('#loginSubmit');
      const errorBox = $('#loginError');
      errorBox.classList.remove('show');
      button.disabled = true;
      button.textContent = 'Signing in…';

      try {
        const payload = await api('/api/admin/login', {
          method: 'POST',
          body: {
            username: $('#loginUser').value.trim(),
            password: $('#loginPass').value,
          },
        });

        $('#loginPass').value = '';
        showApp(payload.user);
        toast('Welcome back.', 'ok');
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.add('show');
      } finally {
        button.disabled = false;
        button.textContent = 'Sign in';
      }
    });

    $('#logoutBtn').addEventListener('click', async () => {
      try { await api('/api/admin/logout', { method: 'POST' }); } catch (error) { /* ignore */ }
      showLogin();
      toast('Signed out.');
    });
  }

  /* ------------------------------------------------------------------ tabs */

  const LOADERS = {
    dashboard: loadDashboard,
    bookings: loadBookings,
    offers: loadOffers,
    tournaments: () => Promise.all([loadTournaments(), loadRegistrations()]),
    settings: loadSettings,
  };

  function initTabs() {
    $('#adminTabs').addEventListener('click', (event) => {
      const button = event.target.closest('.admin-tab');
      if (!button) return;

      const tab = button.dataset.tab;

      $$('.admin-tab').forEach((node) => node.classList.toggle('active', node === button));
      $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });

      if (LOADERS[tab]) LOADERS[tab]().catch((error) => toast(error.message, 'err'));
    });
  }

  function loadEverything() {
    loadDashboard().catch((error) => toast(error.message, 'err'));
    loadOffers().catch(() => {});
    loadTournaments().catch(() => {});
    loadRegistrations().catch(() => {});
    loadSettings().catch(() => {});
  }

  /* ------------------------------------------------------------- dashboard */

  async function loadDashboard() {
    const payload = await api('/api/admin/summary');
    const s = payload.stats;

    $('#todayLabel').textContent = payload.todayLabel;

    const cards = [
      { label: 'Bookings today', value: s.todayTotal },
      { label: 'Confirmed today', value: s.todayConfirmed },
      { label: 'Waiting approval', value: s.pendingAll, accent: s.pendingAll > 0 },
      { label: 'Revenue today', value: money(s.revenueToday), accent: true },
      { label: 'Revenue last 7 days', value: money(s.revenueWeek) },
      { label: 'Bookings last 7 days', value: s.bookingsWeek },
      { label: 'Live offers', value: s.activeOffers },
      { label: 'Upcoming tournaments', value: s.upcomingTournaments },
      { label: 'Tournament entries', value: s.tournamentEntries },
      { label: 'Stations', value: s.stationsTotal },
    ];

    $('#statGrid').innerHTML = cards.map((card) => `
      <div class="stat-card ${card.accent ? 'accent' : ''}">
        <b>${escapeHtml(card.value)}</b>
        <span>${escapeHtml(card.label)}</span>
      </div>`).join('');

    const badge = $('#tabPendingCount');
    badge.textContent = String(s.pendingAll);
    badge.hidden = s.pendingAll === 0;

    $('#pendingList').innerHTML = payload.pendingList.length
      ? payload.pendingList.map((booking) => `
          <li class="mini-item">
            <div>
              <strong>${escapeHtml(booking.code)}</strong>
              <div class="mini-meta">
                ${escapeHtml(booking.name)} · ${escapeHtml(booking.phone)} ·
                ${escapeHtml(booking.stationLabel)} · ${escapeHtml(booking.dateLabel)} ·
                ${escapeHtml(booking.startLabel)} – ${escapeHtml(booking.endLabel)}
              </div>
            </div>
            <span class="spacer"></span>
            <button class="btn btn-primary btn-sm" data-action="confirm" data-id="${booking.id}">Confirm</button>
            <button class="btn btn-quiet btn-sm" data-action="decline" data-id="${booking.id}">Decline</button>
          </li>`).join('')
      : '<li class="mini-item" style="border-left-color:var(--line)"><span class="mini-meta">Nothing is waiting for approval. Nice.</span></li>';
  }

  /* -------------------------------------------------------------- bookings */

  async function loadBookings() {
    const params = new URLSearchParams();
    if (state.filters.date) params.set('date', state.filters.date);
    if (state.filters.status !== 'all') params.set('status', state.filters.status);
    if (state.filters.q) params.set('q', state.filters.q);

    const payload = await api(`/api/admin/bookings?${params.toString()}`);
    state.bookings = payload.bookings;

    $('#bookingCounts').textContent =
      `${payload.counts.total} bookings shown · ${payload.counts.pending} pending · ` +
      `${payload.counts.confirmed} confirmed · ${payload.counts.completed} completed`;

    $('#bookingsBody').innerHTML = state.bookings.length
      ? state.bookings.map((booking) => `
          <tr>
            <td class="code-cell">${escapeHtml(booking.code)}</td>
            <td class="name-cell">
              <strong>${escapeHtml(booking.name)}</strong>
              <span>${escapeHtml(booking.phone)}</span>
            </td>
            <td>
              ${escapeHtml(booking.stationLabel)}
              ${booking.notes ? `<div class="mini-meta" style="color:var(--dim);font-size:.82rem">${escapeHtml(booking.notes)}</div>` : ''}
              ${booking.adminNote ? `<div class="mini-meta" style="color:#ffc9d2;font-size:.82rem">Note: ${escapeHtml(booking.adminNote)}</div>` : ''}
            </td>
            <td>
              ${escapeHtml(formatDateLabel(booking.date))}<br>
              <span class="mini-meta">${escapeHtml(booking.startLabel)} – ${escapeHtml(booking.endLabel)} ·
              ${escapeHtml(Math.round(booking.durationMinutes / 30) / 2 >= 1
                ? `${Math.round(booking.durationMinutes / 60 * 10) / 10} hrs`
                : `${booking.durationMinutes} mins`)}</span>
            </td>
            <td>${escapeHtml(booking.players)}</td>
            <td>${escapeHtml(money(booking.quotedTotal))}</td>
            <td><span class="pill pill--${escapeHtml(booking.status)}">${escapeHtml(booking.status)}</span></td>
            <td>
              <div class="row-actions">
                ${booking.status === 'pending'
                  ? `<button class="btn btn-primary btn-sm" data-action="confirm" data-id="${booking.id}">Confirm</button>
                     <button class="btn btn-quiet btn-sm" data-action="decline" data-id="${booking.id}">Decline</button>`
                  : ''}
                ${booking.status === 'confirmed'
                  ? `<button class="btn btn-ghost btn-sm" data-action="completed" data-id="${booking.id}">Mark done</button>`
                  : ''}
                <button class="btn btn-quiet btn-sm" data-action="note" data-id="${booking.id}">Note</button>
                <button class="btn btn-quiet btn-sm" data-action="delete" data-id="${booking.id}">Delete</button>
              </div>
            </td>
          </tr>`).join('')
      : '<tr class="empty-row"><td colspan="8">No bookings match these filters yet.</td></tr>';
  }

  async function updateBooking(id, patch, successMessage) {
    await api(`/api/admin/bookings/${id}`, { method: 'PATCH', body: patch });
    toast(successMessage, 'ok');
    await Promise.all([loadBookings(), loadDashboard()]);
  }

  function openNoteModal(id) {
    const booking = state.bookings.find((item) => item.id === id);
    if (!booking) return;

    openModal(`
      <h3>Internal note</h3>
      <p class="modal-sub">
        ${escapeHtml(booking.code)} · ${escapeHtml(booking.name)} ·
        ${escapeHtml(booking.stationLabel)} · ${escapeHtml(booking.startLabel)} – ${escapeHtml(booking.endLabel)}
      </p>
      <div class="field">
        <label for="noteText">Note shown to the customer</label>
        <textarea id="noteText" maxlength="300" placeholder="e.g. Please come 10 minutes early, we are busy on Sundays.">${escapeHtml(booking.adminNote || '')}</textarea>
      </div>
      <button class="btn btn-primary btn-full" type="button" id="noteSave">Save note</button>
    `);

    $('#noteSave').addEventListener('click', async () => {
      try {
        await updateBooking(id, { adminNote: $('#noteText').value.trim() }, 'Note saved.');
        closeModal();
      } catch (error) {
        toast(error.message, 'err');
      }
    });
  }

  function initBookingActions() {
    const handler = async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;

      const { action, id } = button.dataset;

      try {
        if (action === 'confirm') await updateBooking(id, { status: 'confirmed' }, 'Booking confirmed.');
        else if (action === 'decline') await updateBooking(id, { status: 'declined' }, 'Booking declined.');
        else if (action === 'completed') await updateBooking(id, { status: 'completed' }, 'Booking marked as completed.');
        else if (action === 'note') openNoteModal(id);
        else if (action === 'delete') {
          if (!window.confirm('Delete this booking permanently?')) return;
          await api(`/api/admin/bookings/${id}`, { method: 'DELETE' });
          toast('Booking deleted.', 'ok');
          await Promise.all([loadBookings(), loadDashboard()]);
        }
      } catch (error) {
        toast(error.message, 'err');
      }
    };

    $('#bookingsBody').addEventListener('click', handler);
    $('#pendingList').addEventListener('click', handler);
  }

  function initFilters() {
    $('#fDate').addEventListener('change', (event) => {
      state.filters.date = event.target.value;
      loadBookings().catch((error) => toast(error.message, 'err'));
    });

    $('#fStatus').addEventListener('change', (event) => {
      state.filters.status = event.target.value;
      loadBookings().catch((error) => toast(error.message, 'err'));
    });

    let searchTimer = null;
    $('#fSearch').addEventListener('input', (event) => {
      const value = event.target.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filters.q = value;
        loadBookings().catch((error) => toast(error.message, 'err'));
      }, 260);
    });

    $('#clearFilters').addEventListener('click', () => {
      state.filters = { date: '', status: 'all', q: '' };
      $('#fDate').value = '';
      $('#fStatus').value = 'all';
      $('#fSearch').value = '';
      loadBookings().catch((error) => toast(error.message, 'err'));
    });

    $('#reloadBookings').addEventListener('click', () => {
      loadBookings().then(() => toast('Bookings reloaded.', 'ok')).catch((error) => toast(error.message, 'err'));
    });
  }

  /* ---------------------------------------------------------------- offers */

  async function loadOffers() {
    const payload = await api('/api/admin/offers');
    state.offers = payload.offers;

    $('#offersBody').innerHTML = state.offers.length
      ? state.offers.map((offer) => `
          <tr>
            <td><span class="chip">${escapeHtml(offer.badge)}</span></td>
            <td>
              <strong>${escapeHtml(offer.title)}</strong>
              <div class="mini-meta" style="color:var(--dim);font-size:.84rem">${escapeHtml(offer.description)}</div>
            </td>
            <td>${offer.validTo ? escapeHtml(formatDateLabel(offer.validTo)) : 'No end date'}</td>
            <td>${offer.highlight ? 'Yes' : 'No'}</td>
            <td><span class="pill ${offer.active ? 'pill--confirmed' : 'pill--declined'}">${offer.active ? 'live' : 'hidden'}</span></td>
            <td>
              <div class="row-actions">
                <button class="btn btn-quiet btn-sm" data-offer-edit="${offer.id}">Edit</button>
                <button class="btn btn-quiet btn-sm" data-offer-toggle="${offer.id}">${offer.active ? 'Hide' : 'Publish'}</button>
                <button class="btn btn-quiet btn-sm" data-offer-delete="${offer.id}">Delete</button>
              </div>
            </td>
          </tr>`).join('')
      : '<tr class="empty-row"><td colspan="6">No offers yet. Create your first one.</td></tr>';
  }

  function openOfferModal(offer) {
    const isNew = !offer;
    const draft = offer || {
      badge: '', title: '', description: '', detail: '',
      validFrom: todayISO(), validTo: '', highlight: false, active: true,
    };

    openModal(`
      <h3>${isNew ? 'New offer' : 'Edit offer'}</h3>
      <p class="modal-sub">Offers appear on the website home page and in the scrolling banner.</p>

      <div class="form-grid">
        <div class="field">
          <label for="ofBadge">Badge</label>
          <input type="text" id="ofBadge" maxlength="20" value="${escapeHtml(draft.badge)}" placeholder="HAPPY HOURS">
        </div>
        <div class="field">
          <label for="ofTitle">Title</label>
          <input type="text" id="ofTitle" maxlength="120" value="${escapeHtml(draft.title)}" placeholder="Happy Hours">
        </div>
        <div class="field span-2">
          <label for="ofDescription">Short description</label>
          <input type="text" id="ofDescription" maxlength="240" value="${escapeHtml(draft.description)}" placeholder="Flat Rs.50 per hour between 12 PM and 4 PM.">
        </div>
        <div class="field span-2">
          <label for="ofDetail">Fine print</label>
          <input type="text" id="ofDetail" maxlength="200" value="${escapeHtml(draft.detail)}" placeholder="Monday to Friday only · ID required">
        </div>
        <div class="field">
          <label for="ofFrom">Valid from</label>
          <input type="date" id="ofFrom" value="${escapeHtml(draft.validFrom || '')}">
        </div>
        <div class="field">
          <label for="ofTo">Valid till (leave blank for ongoing)</label>
          <input type="date" id="ofTo" value="${escapeHtml(draft.validTo || '')}">
        </div>
        <div class="field span-2 check-row">
          <input type="checkbox" id="ofHighlight" ${draft.highlight ? 'checked' : ''}>
          <label for="ofHighlight" style="margin:0">Feature this offer</label>
        </div>
        <div class="field span-2 check-row">
          <input type="checkbox" id="ofActive" ${draft.active ? 'checked' : ''}>
          <label for="ofActive" style="margin:0">Show on the website</label>
        </div>
      </div>

      <button class="btn btn-primary btn-full" type="button" id="ofSave">${isNew ? 'Create offer' : 'Save changes'}</button>
    `);

    $('#ofSave').addEventListener('click', async () => {
      const body = {
        badge: $('#ofBadge').value.trim(),
        title: $('#ofTitle').value.trim(),
        description: $('#ofDescription').value.trim(),
        detail: $('#ofDetail').value.trim(),
        validFrom: $('#ofFrom').value || todayISO(),
        validTo: $('#ofTo').value || '',
        highlight: $('#ofHighlight').checked,
        active: $('#ofActive').checked,
      };

      if (!body.title) { toast('Please enter a title for the offer.', 'err'); return; }

      try {
        if (isNew) await api('/api/admin/offers', { method: 'POST', body });
        else await api(`/api/admin/offers/${offer.id}`, { method: 'PATCH', body });

        closeModal();
        toast(isNew ? 'Offer created.' : 'Offer updated.', 'ok');
        await loadOffers();
      } catch (error) {
        toast(error.message, 'err');
      }
    });
  }

  function initOffers() {
    $('#newOfferBtn').addEventListener('click', () => openOfferModal(null));

    $('#offersBody').addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-offer-edit]');
      const toggle = event.target.closest('[data-offer-toggle]');
      const remove = event.target.closest('[data-offer-delete]');

      try {
        if (edit) {
          const offer = state.offers.find((item) => item.id === edit.dataset.offerEdit);
          if (offer) openOfferModal(offer);
        } else if (toggle) {
          const offer = state.offers.find((item) => item.id === toggle.dataset.offerToggle);
          if (!offer) return;
          await api(`/api/admin/offers/${offer.id}`, { method: 'PATCH', body: { active: !offer.active } });
          toast(offer.active ? 'Offer hidden from the website.' : 'Offer is now live.', 'ok');
          await loadOffers();
        } else if (remove) {
          if (!window.confirm('Delete this offer?')) return;
          await api(`/api/admin/offers/${remove.dataset.offerDelete}`, { method: 'DELETE' });
          toast('Offer deleted.', 'ok');
          await loadOffers();
        }
      } catch (error) {
        toast(error.message, 'err');
      }
    });
  }

  /* ----------------------------------------------------------- tournaments */

  async function loadTournaments() {
    const payload = await api('/api/admin/tournaments');
    state.tournaments = payload.tournaments;

    $('#tournamentsBody').innerHTML = state.tournaments.length
      ? state.tournaments.map((tournament) => `
          <tr>
            <td>
              <strong>${escapeHtml(tournament.title)}</strong>
              <div class="mini-meta" style="color:var(--dim);font-size:.84rem">${escapeHtml(tournament.mode || '')}</div>
            </td>
            <td>${escapeHtml(tournament.game || '—')}</td>
            <td>${escapeHtml(formatDateLabel(tournament.date))}<br><span class="mini-meta">${escapeHtml(tournament.startTime || '')}</span></td>
            <td>${escapeHtml(tournament.entryLabel || money(tournament.entryFee))}</td>
            <td>${escapeHtml(tournament.takenSlots)} / ${escapeHtml(tournament.totalSlots)}</td>
            <td><span class="pill ${tournament.active ? 'pill--confirmed' : 'pill--declined'}">${tournament.active ? 'live' : 'hidden'}</span></td>
            <td>
              <div class="row-actions">
                <button class="btn btn-quiet btn-sm" data-trn-edit="${tournament.id}">Edit</button>
                <button class="btn btn-quiet btn-sm" data-trn-toggle="${tournament.id}">${tournament.active ? 'Hide' : 'Publish'}</button>
                <button class="btn btn-quiet btn-sm" data-trn-delete="${tournament.id}">Delete</button>
              </div>
            </td>
          </tr>`).join('')
      : '<tr class="empty-row"><td colspan="7">No tournaments yet. Create your first bracket.</td></tr>';
  }

  function openTournamentModal(tournament) {
    const isNew = !tournament;
    const draft = tournament || {
      title: '', game: '', mode: '', date: todayISO(), startTime: '18:00',
      entryFee: 0, entryLabel: '', prizePool: 0, prizeLabel: '',
      totalSlots: 16, platform: '', image: '', details: '', rules: [], active: true,
    };

    openModal(`
      <h3>${isNew ? 'New tournament' : 'Edit tournament'}</h3>
      <p class="modal-sub">Published tournaments show on the website with live slot counts.</p>

      <div class="form-grid">
        <div class="field span-2">
          <label for="tnTitle">Title</label>
          <input type="text" id="tnTitle" maxlength="90" value="${escapeHtml(draft.title)}" placeholder="BGMI Squad Showdown">
        </div>
        <div class="field">
          <label for="tnGame">Game</label>
          <input type="text" id="tnGame" maxlength="40" value="${escapeHtml(draft.game)}" placeholder="BGMI">
        </div>
        <div class="field">
          <label for="tnPlatform">Platform</label>
          <input type="text" id="tnPlatform" maxlength="40" value="${escapeHtml(draft.platform)}" placeholder="Mobile / PC / PlayStation 5">
        </div>
        <div class="field span-2">
          <label for="tnMode">Format</label>
          <input type="text" id="tnMode" maxlength="80" value="${escapeHtml(draft.mode)}" placeholder="Squad · 4 players per team">
        </div>
        <div class="field">
          <label for="tnDate">Date</label>
          <input type="date" id="tnDate" value="${escapeHtml(draft.date || '')}">
        </div>
        <div class="field">
          <label for="tnTime">Start time</label>
          <input type="time" id="tnTime" value="${escapeHtml(draft.startTime || '18:00')}">
        </div>
        <div class="field">
          <label for="tnEntryLabel">Entry fee label</label>
          <input type="text" id="tnEntryLabel" maxlength="60" value="${escapeHtml(draft.entryLabel || '')}" placeholder="Rs.100 per team">
        </div>
        <div class="field">
          <label for="tnEntry">Entry fee (number)</label>
          <input type="number" id="tnEntry" min="0" value="${escapeHtml(draft.entryFee || 0)}">
        </div>
        <div class="field">
          <label for="tnPrizeLabel">Prize pool label</label>
          <input type="text" id="tnPrizeLabel" maxlength="60" value="${escapeHtml(draft.prizeLabel || '')}" placeholder="Rs.5,000 prize pool">
        </div>
        <div class="field">
          <label for="tnPrize">Prize pool (number)</label>
          <input type="number" id="tnPrize" min="0" value="${escapeHtml(draft.prizePool || 0)}">
        </div>
        <div class="field">
          <label for="tnSlots">Total slots</label>
          <input type="number" id="tnSlots" min="1" value="${escapeHtml(draft.totalSlots || 16)}">
        </div>
        <div class="field">
          <label for="tnImage">Banner image URL</label>
          <input type="text" id="tnImage" value="${escapeHtml(draft.image || '')}" placeholder="https://…">
        </div>
        <div class="field span-2">
          <label for="tnDetails">Description</label>
          <textarea id="tnDetails" maxlength="600" placeholder="Three matches, points table decides the winner.">${escapeHtml(draft.details || '')}</textarea>
        </div>
        <div class="field span-2">
          <label for="tnRules">Rules (one per line)</label>
          <textarea id="tnRules" placeholder="Team of 4 + 1 substitute&#10;No emulators">${escapeHtml((draft.rules || []).join('\n'))}</textarea>
        </div>
        <div class="field span-2 check-row">
          <input type="checkbox" id="tnActive" ${draft.active ? 'checked' : ''}>
          <label for="tnActive" style="margin:0">Show on the website</label>
        </div>
      </div>

      <button class="btn btn-primary btn-full" type="button" id="tnSave">${isNew ? 'Create tournament' : 'Save changes'}</button>
    `);

    $('#tnSave').addEventListener('click', async () => {
      const body = {
        title: $('#tnTitle').value.trim(),
        game: $('#tnGame').value.trim(),
        platform: $('#tnPlatform').value.trim(),
        mode: $('#tnMode').value.trim(),
        date: $('#tnDate').value,
        startTime: $('#tnTime').value,
        entryLabel: $('#tnEntryLabel').value.trim(),
        entryFee: Number($('#tnEntry').value) || 0,
        prizeLabel: $('#tnPrizeLabel').value.trim(),
        prizePool: Number($('#tnPrize').value) || 0,
        totalSlots: Number($('#tnSlots').value) || 8,
        image: $('#tnImage').value.trim(),
        details: $('#tnDetails').value.trim(),
        rules: $('#tnRules').value.split('\n').map((line) => line.trim()).filter(Boolean),
        active: $('#tnActive').checked,
      };

      if (!body.title) { toast('Please enter a tournament title.', 'err'); return; }
      if (!body.date) { toast('Please choose a date.', 'err'); return; }

      try {
        if (isNew) await api('/api/admin/tournaments', { method: 'POST', body });
        else await api(`/api/admin/tournaments/${tournament.id}`, { method: 'PATCH', body });

        closeModal();
        toast(isNew ? 'Tournament created.' : 'Tournament updated.', 'ok');
        await loadTournaments();
      } catch (error) {
        toast(error.message, 'err');
      }
    });
  }

  function initTournaments() {
    $('#newTournamentBtn').addEventListener('click', () => openTournamentModal(null));

    $('#tournamentsBody').addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-trn-edit]');
      const toggle = event.target.closest('[data-trn-toggle]');
      const remove = event.target.closest('[data-trn-delete]');

      try {
        if (edit) {
          const tournament = state.tournaments.find((item) => item.id === edit.dataset.trnEdit);
          if (tournament) openTournamentModal(tournament);
        } else if (toggle) {
          const tournament = state.tournaments.find((item) => item.id === toggle.dataset.trnToggle);
          if (!tournament) return;
          await api(`/api/admin/tournaments/${tournament.id}`, { method: 'PATCH', body: { active: !tournament.active } });
          toast(tournament.active ? 'Tournament hidden.' : 'Tournament is now live.', 'ok');
          await loadTournaments();
        } else if (remove) {
          if (!window.confirm('Delete this tournament and all its registrations?')) return;
          await api(`/api/admin/tournaments/${remove.dataset.trnDelete}`, { method: 'DELETE' });
          toast('Tournament deleted.', 'ok');
          await Promise.all([loadTournaments(), loadRegistrations()]);
        }
      } catch (error) {
        toast(error.message, 'err');
      }
    });
  }

  async function loadRegistrations() {
    const payload = await api('/api/admin/registrations');
    state.registrations = payload.registrations;

    $('#registrationsBody').innerHTML = state.registrations.length
      ? state.registrations.map((entry) => `
          <tr>
            <td><strong>${escapeHtml(entry.teamName)}</strong></td>
            <td>${escapeHtml(entry.captainName)}</td>
            <td>${escapeHtml(entry.phone)}</td>
            <td>${escapeHtml(entry.tournamentTitle)}</td>
            <td><span class="pill pill--${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span></td>
            <td>
              <div class="row-actions">
                ${entry.status !== 'confirmed'
                  ? `<button class="btn btn-primary btn-sm" data-reg-status="confirmed" data-id="${entry.id}">Confirm</button>` : ''}
                ${entry.status !== 'cancelled'
                  ? `<button class="btn btn-quiet btn-sm" data-reg-status="cancelled" data-id="${entry.id}">Cancel</button>` : ''}
                <button class="btn btn-quiet btn-sm" data-reg-delete="${entry.id}">Delete</button>
              </div>
            </td>
          </tr>`).join('')
      : '<tr class="empty-row"><td colspan="6">No team registrations yet.</td></tr>';
  }

  function initRegistrations() {
    $('#registrationsBody').addEventListener('click', async (event) => {
      const statusButton = event.target.closest('[data-reg-status]');
      const deleteButton = event.target.closest('[data-reg-delete]');

      try {
        if (statusButton) {
          await api(`/api/admin/registrations/${statusButton.dataset.id}`, {
            method: 'PATCH',
            body: { status: statusButton.dataset.regStatus },
          });
          toast('Registration updated.', 'ok');
          await Promise.all([loadRegistrations(), loadTournaments()]);
        } else if (deleteButton) {
          if (!window.confirm('Remove this team registration?')) return;
          await api(`/api/admin/registrations/${deleteButton.dataset.regDelete}`, { method: 'DELETE' });
          toast('Registration removed.', 'ok');
          await Promise.all([loadRegistrations(), loadTournaments()]);
        }
      } catch (error) {
        toast(error.message, 'err');
      }
    });
  }

  /* -------------------------------------------------------------- settings */

  async function loadSettings() {
    const payload = await api('/api/admin/settings');
    state.settings = payload.settings;

    $('#setOpen').value = payload.settings.hours.open;
    $('#setClose').value = payload.settings.hours.close;
    $('#setAddress').value = payload.settings.contact.address;
    $('#setMap').value = payload.settings.contact.mapQuery;
    $('#setWhatsapp').value = payload.settings.contact.whatsapp.join(', ');
    $('#setUser').value = payload.settings.adminUser;

    $('#dataNote').innerHTML =
      'Every booking, offer and tournament is stored as a JSON file in the ' +
      '<strong>data</strong> folder next to the server. Copy that folder to back up your data. ' +
      'Changes to opening hours and contact details take effect immediately — no restart needed.';
  }

  function initSettings() {
    $('#saveShopBtn').addEventListener('click', async () => {
      try {
        await api('/api/admin/settings', {
          method: 'PATCH',
          body: {
            hours: { open: $('#setOpen').value, close: $('#setClose').value },
            contact: {
              address: $('#setAddress').value.trim(),
              mapQuery: $('#setMap').value.trim(),
              whatsapp: $('#setWhatsapp').value.split(',').map((value) => value.trim()).filter(Boolean),
            },
          },
        });
        toast('Shop settings saved.', 'ok');
        await loadSettings();
      } catch (error) {
        toast(error.message, 'err');
      }
    });

    $('#saveLoginBtn').addEventListener('click', async () => {
      const body = { adminUser: $('#setUser').value.trim() };
      const newPassword = $('#setNew').value;

      if (newPassword) {
        body.newPassword = newPassword;
        body.currentPassword = $('#setCurrent').value;
      }

      try {
        await api('/api/admin/settings', { method: 'PATCH', body });
        $('#setCurrent').value = '';
        $('#setNew').value = '';
        toast(newPassword ? 'Username and password updated.' : 'Username updated.', 'ok');
        await loadSettings();
      } catch (error) {
        toast(error.message, 'err');
      }
    });
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    initModal();
    initAuth();
    initTabs();
    initFilters();
    initBookingActions();
    initOffers();
    initTournaments();
    initRegistrations();
    initSettings();

    $('#refreshDashboard').addEventListener('click', () => {
      loadDashboard().then(() => toast('Dashboard refreshed.', 'ok')).catch((error) => toast(error.message, 'err'));
    });

    checkSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
