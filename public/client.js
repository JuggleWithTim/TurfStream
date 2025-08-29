(() => {
  const feedEl = document.getElementById('feed');
  const subtitleEl = document.getElementById('subtitle');
  const presenceEl = document.getElementById('presence');

  const rankEl = document.getElementById('rank');
  const placeEl = document.getElementById('place');
  const pphEl = document.getElementById('pph');
  const pointsEl = document.getElementById('points');
  const takenEl = document.getElementById('taken');
  const uniqueEl = document.getElementById('unique');

  const FEED_MAX = 12;
  const items = [];

  function addFeedItems(newItems) {
    // append newest first
    for (const it of newItems) {
      const li = document.createElement('li');
      const time = it.time ? formatTime(it.time) : '';
      if (it.type === 'takeover') {
        const z = it.zone?.name || 'Unknown zone';
        const curr = it.currentOwner?.name || '';
        const prev = it.previousOwner?.name || '';
        const assisted = Array.isArray(it.assists) ? it.assists.map(a => a?.name).filter(Boolean) : [];
        const line = assisted.length > 0
          ? `${curr} assisted by ${assisted.join(', ')} took ${z}`
          : `${curr} took ${z}${prev ? ` from ${prev}` : ''}`;
        li.innerHTML = `<span class="tag takeover">takeover<\/span>${line} <span class="muted">(${time})<\/span>`;
      } else if (it.type === 'medal') {
        const who = it.user?.name || '';
        const medalId = it.medal;
        li.innerHTML = `<span class="tag medal">medal<\/span>${who} earned medal #${medalId} <span class="muted">(${time})<\/span>`;
      } else if (it.type === 'chat') {
        const who = it.sender?.name || '';
        const msg = it.message || '';
        li.innerHTML = `<span class="tag chat">chat<\/span>${who}: ${escapeHTML(msg)} <span class="muted">(${time})<\/span>`;
      } else {
        continue;
      }
      items.unshift(li);
    }
    while (items.length > FEED_MAX) items.pop();
    renderFeed();
  }

  function renderFeed() {
    feedEl.innerHTML = '';
    for (const li of items) feedEl.appendChild(li);
  }

  function setStats(s) {
    subtitleEl.textContent = s?.name ? `Tracking ${s.name}` : 'Tracking…';
    rankEl.textContent = s?.rank ?? '-';
    placeEl.textContent = s?.place ?? '-';
    pphEl.textContent = s?.pointsPerHour ?? '-';
    pointsEl.textContent = s?.points ?? '-';
    takenEl.textContent = s?.taken ?? '-';
    uniqueEl.textContent = s?.uniqueZonesTaken ?? '-';
  }

  function setPresence(p) {
    if (!p) return;
    if (p.online) {
      let loc = '';
      if (p.latitude && p.longitude) {
        loc = ` @ ${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}`;
      }
      presenceEl.innerHTML = `Status: <span style="color:#81c784">online<\/span>${loc}`;
    } else {
      presenceEl.innerHTML = `Status: <span class="muted">offline<\/span>`;
    }
  }

  function formatTime(turfTime) {
    // Turf times look like 2013-08-27T12:11:14+0000
    // Show HH:MM
    const iso = turfTime.replace(/(\+\d{2})(\d{2})$/, '$1:$2').replace('+0000', 'Z');
    const d = new Date(iso);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
    }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
    ));
  }

  function initSSE() {
    const es = new EventSource('/stream');
    es.addEventListener('hello', (e) => {
      // Optional handshake
      // console.log('hello', e.data);
    });
    es.addEventListener('feed', (e) => {
      try {
        const data = JSON.parse(e.data);
        addFeedItems(data);
      } catch {}
    });
    es.addEventListener('stats', (e) => {
      try {
        const data = JSON.parse(e.data);
        setStats(data);
      } catch {}
    });
    es.addEventListener('location', (e) => {
      try {
        const data = JSON.parse(e.data);
        setPresence(data);
      } catch {}
    });
    es.onerror = () => {
      // Keep trying; EventSource auto-reconnects
    };
  }

  initSSE();
})();
