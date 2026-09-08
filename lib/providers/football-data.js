const { emptyCapabilities } = require('./types');
const API_BASE = 'https://api.football-data.org/v4';

const capabilities = { ...emptyCapabilities(), fixtures: true, teams: true, standings: true };

// Queried one competition at a time — the global /matches endpoint with
// comma-separated competitions silently only honored the first code on
// this free-tier account. Kept to 7 to stay well under the 10 req/min cap.
const COMPETITIONS = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'CL', 'BSA'];

async function fetchEvents(date) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return { provider: 'football-data', ok: false, reason: 'no_api_key', events: [] };

  const results = await Promise.all(COMPETITIONS.map((code) => fetchCompetition(code, date, apiKey)));

  const events = [];
  const failedCompetitions = [];
  for (const r of results) {
    if (r.ok) events.push(...r.events);
    else failedCompetitions.push({ code: r.code, reason: r.reason });
  }

  const ok = results.some((r) => r.ok);
  return {
    provider: 'football-data',
    ok,
    reason: ok ? undefined : 'all_competitions_failed',
    events,
    failedCompetitions,
  };
}

async function fetchCompetition(code, date, apiKey) {
  try {
    const url = `${API_BASE}/competitions/${code}/matches?dateFrom=${date}&dateTo=${date}`;
    const res = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
    if (!res.ok) return { ok: false, code, reason: `http_${res.status}`, events: [] };
    const data = await res.json();
    return { ok: true, code, events: (data.matches || []).map(normalizeMatch) };
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
