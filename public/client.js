(() => {
  const feedEl = document.getElementById('feed');
  const subtitleEl = document.getElementById('subtitle');
  const presenceEl = document.getElementById('presence');
  const mapEl = document.getElementById('map');
  const rankEl = document.getElementById('rank');
  const placeEl = document.getElementById('place');
  const pphEl = document.getElementById('pph');
  const zonesNowEl = document.getElementById('zonesNow');
  const pointsEl = document.getElementById('points');
  const pointsThisRoundEl = document.getElementById('pointsThisRound');
  const takenEl = document.getElementById('taken');
  const uniqueEl = document.getElementById('unique');

  const FEED_MAX = 4;
  const items = [];

  // Map state
  let cfg = { showMap: false, showCoords: false, map: { tileUrl: '', attribution: '', zoom: 14 }, tracking: '', trackingLC: '' };
  let map, playerMarker, zoneLayer;
  let lastZonesFetchAt = 0;

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
        const isLoss = prev && prev === cfg.tracking;
        const line = assisted.length > 0
          ? `${curr} assisted by ${assisted.join(', ')} took ${z}`
          : isLoss
            ? `Lost ${z} to ${curr}`
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
  }function setStats(s) {
    subtitleEl.textContent = s?.name ? `Tracking ${s.name}` : 'Tracking…';
    rankEl.textContent = s?.rank ?? '-';
    placeEl.textContent = s?.place ?? '-';
    pphEl.textContent = s?.pointsPerHour ?? '-';
    zonesNowEl.textContent = (Array.isArray(s?.zones) ? s.zones.length : (Number.isFinite(s?.zonesNow) ? s.zonesNow : '-'));
    pointsEl.textContent = s?.totalPoints ?? '-';
    pointsThisRoundEl.textContent = s?.points ?? '-';
    takenEl.textContent = s?.taken ?? '-';
    uniqueEl.textContent = s?.uniqueZonesTaken ?? '-';
  }

  function ensureMap() {
    if (!cfg.showMap || map) return;
    if (!window.L) return;
    mapEl.style.display = 'block';
    map = L.map('map', { zoomControl: false, attributionControl: true });
    L.tileLayer(cfg.map.tileUrl, { attribution: cfg.map.attribution }).addTo(map);
    zoneLayer = L.layerGroup().addTo(map);
  }

  async function loadZones(lat, lng) {
    const now = Date.now();
    if (now - lastZonesFetchAt < 5000) return;
    lastZonesFetchAt = now;
    try {
      const resp = await fetch(`/api/zones?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
      const json = await resp.json();
      if (!json || !Array.isArray(json.zones)) return;
      renderZones(json.zones);
    } catch {}
  }

  function renderZones(zones) {
    if (!zoneLayer) return;
    zoneLayer.clearLayers();
    for (const z of zones) {
      if (!Number.isFinite(z.latitude) || !Number.isFinite(z.longitude)) continue;

    // Determine owner name from possible shapes
    const ownerName = (
      z.currentOwner?.name ||
      z.owner?.name ||
      z.ownerName ||
      ''
    );
    const isMine = ownerName && cfg.trackingLC && ownerName.toLowerCase() === cfg.trackingLC;
    const isUnowned = !ownerName;

    // Colors: mine = green, others = red, unowned = yellow
    let stroke, fill;
    if (isUnowned) {
      stroke = '#f9a825';
      fill = '#fdd835';
    } else if (isMine) {
      stroke = '#2e7d32';
      fill = '#66bb6a';
    } else {
      stroke = '#c62828';
      fill = '#ef5350';
    }

      const m = L.circleMarker([z.latitude, z.longitude], {
        radius: 10,
        color: stroke,
        weight: 2,
        fillColor: fill,
        fillOpacity: 0.7
      });
      const name = z.name || 'Zone';
      const pph = z.pointsPerHour != null ? `PPH: ${z.pointsPerHour}` : '';
      const owner = ownerName ? `Owner: ${ownerName}` : '';
      const parts = [name, pph, owner].filter(Boolean);
      m.bindTooltip(parts.join(' — '), { direction: 'top' });
      zoneLayer.addLayer(m);
    }
  }

  function centerMap(lat, lng) {
    ensureMap();
    if (!map) return;

    // Create a custom icon for the player marker
    const playerIcon = L.icon({
      iconUrl: 'https://turfgame.com/images/menutitlemarker_active.png',iconSize: [22, 36],
      iconAnchor: [11, 36], // bottom-center anchor (feet)
      tooltipAnchor: [0, -14],
      className: 'player-marker'
    });

    if (!playerMarker) {
      playerMarker = L.marker([lat, lng], { icon: playerIcon })
        .addTo(map)
        .bindTooltip('You', { direction: 'top' });
    } else {
      playerMarker.setLatLng([lat, lng]);
    }
    if (!map._zoom) {
      map.setView([lat, lng], cfg.map.zoom || 14);
    } else {
      map.panTo([lat, lng], { animate: true });
    }
  }

  function setPresence(p) {
    if (!p) return;
    if (p.online) {
      let loc = '';
      if (cfg.showCoords && p.latitude && p.longitude) {
        loc = ` @ ${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}`;
      }
      presenceEl.innerHTML = `Status: <span style="color:#81c784">online<\/span>${loc}`;

      if (cfg.showMap && p.latitude && p.longitude) {
        centerMap(p.latitude, p.longitude);
        loadZones(p.latitude, p.longitude);
      }
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
      try {
        const data = JSON.parse(e.data);
        cfg = {
          showMap: !!data.showMap,
          showCoords: !!data.showCoords,
          map: data.map || cfg.map,
          tracking: data.tracking || '',
          trackingLC: (data.tracking || '').toLowerCase()
        };
        if (cfg.showMap) ensureMap();
      } catch {}
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
