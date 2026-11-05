/* ==========================================================================
   Bro Code Gaming Zone — payment lookup page (/pay)
   Enter a booking code to see the exact amount and a scannable UPI QR.
   ========================================================================== */

(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);

  const pad = (value) => String(value).padStart(2, '0');

  function formatMoney(amount) {
    return `Rs.${Number(amount || 0).toLocaleString('en-IN')}`;
  }

  function formatTimeLabel(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return String(value || '');

    const total = Number(match[1]) * 60 + Number(match[2]);
    const hours24 = Math.floor(total / 60) % 24;
    const minutes = total % 60;
    const suffix = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

    return minutes === 0 ? `${hours12} ${suffix}` : `${hours12}:${pad(minutes)} ${suffix}`;
  }

  let toastTimer = null;

  function toast(message, tone = '') {
    const node = $('#toast');
    if (!node) return;

    node.textContent = message;
    node.className = `toast show ${tone}`.trim();

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = 'toast'; }, 3400);
  }

  async function api(path) {
    const response = await fetch(path, { headers: { 'Content-Type': 'application/json' } });

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

  /* ------------------------------------------------------------------ state */

  const state = { cafe: null, pay: {} };

  const STATUS_LABELS = {
    pending: 'Awaiting confirmation',
    confirmed: 'Confirmed',
    completed: 'Completed',
    declined: 'Declined',
    cancelled: 'Cancelled',
  };

  const STATUS_COLOURS = {
    pending: 'var(--warn)',
    confirmed: 'var(--ok)',
    completed: 'var(--info)',
    declined: 'var(--red)',
    cancelled: 'var(--dim)',
  };

  function showError(message) {
    const box = $('#payError');
    if (!box) return;

    if (!message) {
      box.classList.remove('show');
      box.textContent = '';
      return;
    }

    box.textContent = message;
    box.classList.add('show');
  }

  /* ---------------------------------------------------------------- UPI bits */

  function whatsappLink(message) {
    const numbers = (state.cafe && state.cafe.contact && state.cafe.contact.whatsapp) || [];
    return `https://wa.me/${numbers[0] || ''}?text=${encodeURIComponent(message)}`;
  }

  function upiPayLink(amount, note) {
    const pay = state.pay || {};
    if (!pay.upiId) return '';

    const params = new URLSearchParams({
      pa: pay.upiId,
      pn: pay.payeeName || (state.cafe && state.cafe.name) || 'Gaming Cafe',
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

  /* ---------------------------------------------------------------- rendering */

  function renderBooking(booking, dateLabel, startLabel) {
    const result = $('#payResult');
    const status = String(booking.status || 'pending');
    const payable = status === 'pending' || status === 'confirmed';

    $('#payHeading').textContent = `Booking ${booking.code}`;

    const chip = $('#payStatus');
    chip.textContent = STATUS_LABELS[status] || status;
    chip.style.color = STATUS_COLOURS[status] || 'var(--warn)';

    const amount = Number(booking.quotedTotal) || 0;
    const lines = [
      ['Station', booking.stationLabel],
      ['Date', dateLabel],
      ['Time', `${startLabel} – ${formatTimeLabel(booking.end)}`],
      ['Players', String(booking.players)],
      ['Amount due', formatMoney(amount)],
    ];
    if (booking.adminNote) lines.push(['Note from us', booking.adminNote]);

    $('#payLines').innerHTML = lines.map(([label, value]) => `
      <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');

    const panel = $('.pay-panel');

    if (!payable) {
      if (panel) panel.hidden = true;
      result.hidden = false;
      toast(`This booking is ${(STATUS_LABELS[status] || status).toLowerCase()}.`, 'err');
      return;
    }

    if (!state.pay.upiId) {
      if (panel) panel.hidden = true;
      result.hidden = false;
      return;
    }

    if (panel) panel.hidden = false;

    const link = upiPayLink(amount, `Bro Code booking ${booking.code}`);

    $('#payQr').src = qrImageUrl(link, 240);
    $('#payQr').alt = `Scan to pay ${formatMoney(amount)} to ${state.pay.upiId}`;
    $('#payAmount').textContent = formatMoney(amount);
    $('#payUpiId').textContent = state.pay.upiId;
    $('#payNote').textContent = state.pay.note || '';
    $('#payApp').href = link;
    $('#payWhatsapp').href = whatsappLink(
      `Hi Bro Code Gaming Zone! I have paid ${formatMoney(amount)} for booking ` +
      `${booking.code} to ${state.pay.upiId}. Sharing the payment screenshot now.`,
    );

    result.hidden = false;
  }

  /* ------------------------------------------------------------------ actions */

  async function lookup() {
    const input = $('#payCode');
    const button = $('#payLookup');
    const code = String(input.value || '').trim().toUpperCase();

    if (code.length < 3) {
      showError('Please enter your booking code, for example BC-4F7Q.');
      input.focus();
      return;
    }

    showError('');
    button.disabled = true;
    button.textContent = 'Looking it up…';

    try {
      const payload = await api(`/api/bookings/${encodeURIComponent(code)}`);
      input.value = payload.booking.code;
      renderBooking(payload.booking, payload.dateLabel, payload.startLabel);
      $('#payResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      $('#payResult').hidden = true;
      showError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Show my amount';
    }
  }

  function initCopy() {
    $('#payCopy').addEventListener('click', async () => {
      const value = $('#payUpiId').textContent.trim();
      if (!value || value === '—') return;

      try {
        await navigator.clipboard.writeText(value);
        toast('UPI ID copied.', 'ok');
      } catch (error) {
        toast(`UPI ID: ${value}`, '');
      }
    });
  }

  /* -------------------------------------------------------------------- boot */

  async function boot() {
    try {
      const site = await api('/api/site');
      state.cafe = site.cafe;
      state.pay = (site.cafe && site.cafe.payments) || {};
    } catch (error) {
      toast('Could not reach the booking server. Please refresh the page.', 'err');
    }

    initCopy();

    $('#payLookup').addEventListener('click', lookup);

    $('#payCode').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        lookup();
      }
    });

    $('#payAgain').addEventListener('click', () => {
      $('#payResult').hidden = true;
      showError('');
      $('#payCode').value = '';
      $('#payCode').focus();
      $('#payCode').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    const preset = new URLSearchParams(window.location.search).get('code');
    if (preset) {
      $('#payCode').value = preset.trim().toUpperCase();
      lookup();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
