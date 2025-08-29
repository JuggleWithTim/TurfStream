import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Config
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRACK_USERNAME = (process.env.TURF_USERNAME || 'jugglewithtim').trim();
const PORT = Number(process.env.PORT || 3000);
const API_BASE = process.env.API_BASE || 'https://api.turfgame.com/v5';
const SHOW_COORDS = (() => {
  const v = (process.env.SHOW_COORDS || 'false').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
})();

const FEED_POLL_MS = Number(process.env.FEED_POLL_MS || 5000);
const STATS_POLL_MS = Number(process.env.STATS_POLL_MS || 15000);
const LOCATION_POLL_MS = Number(process.env.LOCATION_POLL_MS || 20000);

// Simple server-sent events registry
const clients = new Set();

// State
let lastAfterDate = null; // Use API-returned time string
let knownUserId = null;

// Helpers
function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of clients) {
    sendSSE(res, event, data);
  }
}

// Use the time returned by API directly for afterDate.
// The API expects "2013-08-27T12:11:14+0000" style. Keep as-is.
function encodeAfterDateParam(timeStr) {
  return encodeURIComponent(timeStr);
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    // Let Node handle gzip automatically
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} for ${url}: ${txt}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Pollers with naive backoff on 429 or network errors
function createPoller(fn, intervalMs) {
  let nextDelay = intervalMs;
  let timer = null;
  const run = async () => {
    try {
      await fn();
      nextDelay = intervalMs; // reset backoff on success
    } catch (err) {
      // Simple backoff: double up to 60s on errors or 429
      if (err && (err.status === 429)) {
        nextDelay = Math.min(nextDelay * 2, 60000);
      } else {
        nextDelay = Math.min(nextDelay * 2, 60000);
      }
      // Optional: log to console for diagnostics
      console.warn(`[poller] ${fn.name} error: ${err?.message || err}`);
    } finally {
      timer = setTimeout(run, nextDelay);
    }
  };
  run();
  return () => clearTimeout(timer);
}

// Filter feed items to those involving USERNAME
function filterFeedForUser(items) {
  const nameLC = TRACK_USERNAME.toLowerCase();
  return (items || []).filter((it) => {
    try {
      const type = it?.type;
      if (type === 'takeover') {
        const prev = it?.previousOwner?.name?.toLowerCase();
        const curr = it?.currentOwner?.name?.toLowerCase();
        const assists = Array.isArray(it?.assists) ? it.assists : [];
        const assisted = assists.some(a => a?.name?.toLowerCase?.() === nameLC);
        return (
          prev === nameLC ||
          curr === nameLC ||
          assisted
        );
      }
      if (type === 'medal') {
        return it?.user?.name?.toLowerCase() === nameLC;
      }
      if (type === 'chat') {
        return it?.sender?.name?.toLowerCase() === nameLC;
      }
      // Ignore 'zone' and other feed types
      return false;
    } catch {
      return false;
    }
  });
}

// Poll /v5/feeds for new items
async function pollFeeds() {
  const types = 'takeover+medal+chat';
  const qs = lastAfterDate ? `?afterDate=${encodeAfterDateParam(lastAfterDate)}` : '';
  const url = `${API_BASE}/feeds/${types}${qs}`;
  const feed = await fetchJSON(url);

  if (Array.isArray(feed) && feed.length > 0) {
    // Update the lastAfterDate to the max time returned (use raw string)
    // We keep comparison simple: leverage lexicographic compare if lengths are equal.
    // Alternatively, just pick the last item’s time assuming API returns descending by time.
    // Spec says list is ordered by time descending, so first item is newest.
    const newest = feed[0]?.time;
    if (newest) lastAfterDate = newest;
  }

  const mine = filterFeedForUser(feed);
  if (mine.length > 0) {
    broadcast('feed', mine);
  }
}

// Poll /v5/users for user stats
async function pollStats() {
  const url = `${API_BASE}/users`;
  const body = JSON.stringify([{ name: TRACK_USERNAME }]);
  const data = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (!Array.isArray(data) || data.length === 0) return;

  const user = data[0];
  if (user?.id && !knownUserId) {
    knownUserId = user.id;
  }
  broadcast('stats', {
    id: user?.id,
    name: user?.name,
    country: user?.country,
    region: user?.region,
    blocktime: user?.blocktime, // seconds
    rank: user?.rank,
    place: user?.place,
    pointsPerHour: user?.pointsPerHour,
    points: user?.points, // current round points
    totalPoints: user?.totalPoints,
    taken: user?.taken,
    uniqueZonesTaken: user?.uniqueZonesTaken
  });
}

// Poll /v5/users/location (optional presence)
async function pollLocation() {
  if (!knownUserId) return;
  const url = `${API_BASE}/users/location`;
  const data = await fetchJSON(url);
  if (!Array.isArray(data)) return;
  const me = data.find(u => u?.id === knownUserId);
  if (me) {
    const payload = {
      online: true,
      id: me.id,
      name: me.name
    };
    if (SHOW_COORDS) {
      payload.latitude = me.latitude;
      payload.longitude = me.longitude;
    }
    broadcast('location', payload);
  } else {
    broadcast('location', {
      online: false,
      id: knownUserId,
      name: TRACK_USERNAME
    });
  }
}

// Web server
const app = express();

// Serve static overlay assets
app.use(express.static(path.join(__dirname, '..', 'public')));

// SSE endpoint
app.get('/stream', (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Add to client set
  clients.add(res);

  // On disconnect
  req.on('close', () => {
    clients.delete(res);
    res.end();
  });

  // Optionally send a hello event
  sendSSE(res, 'hello', { message: 'connected', tracking: TRACK_USERNAME });
});

// Start pollers
createPoller(pollFeeds, FEED_POLL_MS);
createPoller(pollStats, STATS_POLL_MS);
createPoller(pollLocation, LOCATION_POLL_MS);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Turf overlay server running on http://localhost:${PORT}`);
  console.log(`Tracking user: ${TRACK_USERNAME}`);
});
