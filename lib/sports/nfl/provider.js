const API_BASE = 'https://api.balldontlie.io/nfl/v1';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
let cache = { season: null, games: [], fetchedAt: 0 };

async function fetchPage(url, apiKey, attempt = 0) {
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 20000));
    return fetchPage(url, apiKey, attempt + 1);
  }
  if (!res.ok) throw new Error(`http_${res.status}`);
  return res.json();
}

async function fetchSeasonGames(season, apiKey) {
  if (cache.season === season && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.games;

  let games = [];
  let cursor = null;
  do {
    const url = new URL(`${API_BASE}/games`);
    url.searchParams.set('seasons[]', season);
    url.searchParams.set('per_page', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const data = await fetchPage(url.toString(), apiKey);

    const finished = (data.data || [])
      .filter((g) => g.status_state === 'final')
      .map((g) => ({
        homeTeamId: g.home_team.id, awayTeamId: g.visitor_team.id,
        homeTeamName: g.home_team.full_name, awayTeamName: g.visitor_team.full_name,
        homeScore: g.home_team_score, awayScore: g.visitor_team_score,
      }));
    games = games.concat(finished);
    cursor = data.meta?.next_cursor || null;
    if (cursor) await new Promise((r) => setTimeout(r, 16000));
  } while (cursor);

  cache = { season, games, fetchedAt: Date.now() };
  return games;
}

module.exports = { fetchSeasonGames };
