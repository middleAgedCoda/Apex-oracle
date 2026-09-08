const { emptyCapabilities } = require('./types');
const API_BASE = 'https://api.sportmonks.com/v3/football';

// Free/trial Sportmonks plans often restrict league coverage. Kept conservative —
// flip fields to true once /api/providers/health confirms real coverage.
const capabilities = { ...emptyCapabilities(), fixtures: true, teams: true };

async function fetchEvents(date) {
  const apiKey = process.env.SPORTMONKS_API_KEY;
  if (!apiKey) return { provider: 'sportmonks', ok: false, reason: 'no_api_key', events: [] };

  try {
    const url = `${API_BASE}/fixtures/date/${date}?api_token=${apiKey}&include=participants`;
    const res = await fetch(url);
    if (!res.ok) return { provider: 'sportmonks', ok: false, reason: `http_${res.status}`, events: [] };

    const data = await res.json();
    const events = (data.data || []).map(normalizeFixture).filter(Boolean);
    return { provider: 'sportmonks', ok: true, events };
  } catch (err) {
    return { provider: 'sportmonks', ok: false, reason: err.message, events: [] };
  }
}

function normalizeFixture(f) {
  const participants = f.participants || [];
  const home = participants.find((p) => p.meta?.location === 'home');
  const away = participants.find((p) => p.meta?.location === 'away');
  if (!home || !away) return null;

  return {
    sourceId: String(f.id),
    sport: 'football',
    competition: { name: f.name || 'Unknown' },
    participants: {
      home: { name: home.name, shortName: home.short_code },
      away: { name: away.name, shortName: away.short_code },
    },
    kickoff: f.starting_at,
    state: 'unknown',
    score: null,
    provenance: {
      provider: 'sportmonks', retrievedAt: new Date().toISOString(),
      fieldsProvided: ['competition', 'participants', 'kickoff'],
      fieldsMissing: ['state', 'score', 'xg', 'injuries', 'lineups', 'statistics'],
    },
  };
}

module.exports = { name: 'sportmonks', capabilities, fetchEvents };
