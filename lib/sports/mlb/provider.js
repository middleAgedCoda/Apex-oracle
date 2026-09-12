const API_BASE = 'https://api.balldontlie.io/mlb/v1';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
let cache = { season: null, games: [], fetchedAt: 0 };

async function fetchSeasonGames(season, apiKey) {
  if (cache.season === season && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.games;

  let games = [];
  let cursor = null;
  do {
    const url = new URL(`${API_BASE}/games`);
    url.searchParams.set('seasons[]', season);
    url.searchParams.set('per_page', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url.toString(), { headers: { Authorization: apiKey } });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = await res.json();

    // Regular-season, completed games only — spring training and postseason
    // games would distort a team's real run-scoring rate.
    const finished = (data.data || [])
      .filter((g) => g.status_state === 'final' && g.postseason === false && g.season_type !== 'spring_training')
      .map((g) => ({
        homeTeamId: g.home_team.id, awayTeamId: g.away_team.id,
        homeTeamName: g.home_team_name, awayTeamName: g.away_team_name,
        homeScore: g.home_team_data?.runs, awayScore: g.away_team_data?.runs,
      }))
      .filter((g) => g.homeScore != null && g.awayScore != null);
    games = games.concat(finished);
    cursor = data.meta?.next_cursor || null;
    if (cursor) await new Promise((r) => setTimeout(r, 13000));
  } while (cursor);

  cache = { season, games, fetchedAt: Date.now() };
  return games;
}

module.exports = { fetchSeasonGames };
