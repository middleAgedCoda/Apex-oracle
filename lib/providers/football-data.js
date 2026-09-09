const { emptyCapabilities } = require('./types');
const API_BASE = 'https://api.football-data.org/v4';
const CACHE_TTL_MS = 45 * 60 * 1000;
const cache = new Map();

const capabilities = { ...emptyCapabilities(), fixtures: true, teams: true, standings: true };
const DEFAULT_COMPETITIONS = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'CL', 'BSA'];

async function fetchEvents(date, competitions) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return { provider: 'football-data', ok: false, reason: 'no_api_key', events: [] };

  const list = competitions && competitions.length ? competitions : DEFAULT_COMPETITIONS;
  const results = await Promise.all(list.map((code) => fetchCompetition(code, date, apiKey)));

  const events = [];
  const failedCompetitions = [];
  for (const r of results) {
    if (r.ok) events.push(...r.events);
    else failedCompetitions.push({ code: r.code, reason: r.reason });
  }

  const ok = results.some((r) => r.ok);
  return { provider: 'football-data', ok, reason: ok ? undefined : 'all_competitions_failed', events, failedCompetitions };
}

async function fetchCompetition(code, date, apiKey) {
  const cacheKey = `${code}:${date}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return { ok: true, code, events: cached.events };

  try {
    const url = `${API_BASE}/competitions/${code}/matches?dateFrom=${date}&dateTo=${date}`;
    const res = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
    if (!res.ok) return { ok: false, code, reason: `http_${res.status}`, events: [] };
    const data = await res.json();
    const events = (data.matches || []).map(normalizeMatch);
    cache.set(cacheKey, { events, fetchedAt: Date.now() });
    return { ok: true, code, events };
  } catch (err) {
    return { ok: false, code, reason: err.message, events: [] };
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
