const { emptyCapabilities } = require('./types');
const API_BASE = 'https://api.football-data.org/v4';

const capabilities = { ...emptyCapabilities(), fixtures: true, teams: true, standings: true };

async function fetchEvents(date) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return { provider: 'football-data', ok: false, reason: 'no_api_key', events: [] };

  try {
    const url = `${API_BASE}/matches?dateFrom=${date}&dateTo=${date}`;
    const res = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
    if (!res.ok) return { provider: 'football-data', ok: false, reason: `http_${res.status}`, events: [] };

    const data = await res.json();
    const events = (data.matches || []).map(normalizeMatch);
    return { provider: 'football-data', ok: true, events };
  } catch (err) {
    return { provider: 'football-data', ok: false, reason: err.message, events: [] };
  }
}

function normalizeMatch(m) {
  return {
    sourceId: String(m.id),
    sport: 'football',
    competition: { name: m.competition?.name || 'Unknown', country: m.area?.name },
    participants: {
      home: { name: m.homeTeam?.name || 'Unknown', shortName: m.homeTeam?.shortName },
      away: { name: m.awayTeam?.name || 'Unknown', shortName: m.awayTeam?.shortName },
    },
    kickoff: m.utcDate,
    state: mapStatus(m.status),
    score: m.score?.fullTime ? { home: m.score.fullTime.home, away: m.score.fullTime.away } : null,
    provenance: {
      provider: 'football-data', retrievedAt: new Date().toISOString(),
      fieldsProvided: ['competition', 'participants', 'kickoff', 'state', 'score'],
      fieldsMissing: ['xg', 'injuries', 'lineups', 'statistics'],
    },
  };
}

function mapStatus(status) {
  const map = { SCHEDULED: 'scheduled', TIMED: 'scheduled', IN_PLAY: 'live', PAUSED: 'live',
    FINISHED: 'finished', POSTPONED: 'postponed', SUSPENDED: 'suspended', CANCELLED: 'cancelled' };
  return map[status] || 'unknown';
}

module.exports = { name: 'football-data', capabilities, fetchEvents };
