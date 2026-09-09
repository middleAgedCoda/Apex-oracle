const API_BASE = 'https://api.football-data.org/v4';
const CACHE_TTL_MS = 45 * 60 * 1000;
const cache = new Map();

async function fetchFinishedMatches(competitionCode, apiKey) {
  const cached = cache.get(competitionCode);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${API_BASE}/competitions/${competitionCode}/matches?status=FINISHED`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const data = await res.json();
  const matches = data.matches || [];
  cache.set(competitionCode, { data: matches, fetchedAt: Date.now() });
  return matches;
}

function leagueAverages(matches) {
  let homeGoals = 0, awayGoals = 0, count = 0;
  for (const m of matches) {
    if (m.score?.fullTime?.home == null) continue;
    homeGoals += m.score.fullTime.home;
    awayGoals += m.score.fullTime.away;
    count++;
  }
  if (count === 0) return null;
  return { avgHomeGoals: homeGoals / count, avgAwayGoals: awayGoals / count, sampleSize: count };
}

function teamStrength(matches, teamName, leagueAvg) {
  let homeScored = 0, homeConceded = 0, homeCount = 0;
  let awayScored = 0, awayConceded = 0, awayCount = 0;

  for (const m of matches) {
    if (m.score?.fullTime?.home == null) continue;
    if (m.homeTeam?.name === teamName) {
      homeScored += m.score.fullTime.home;
      homeConceded += m.score.fullTime.away;
      homeCount++;
    } else if (m.awayTeam?.name === teamName) {
      awayScored += m.score.fullTime.away;
      awayConceded += m.score.fullTime.home;
      awayCount++;
    }
  }

  if (homeCount < 3 || awayCount < 3) return { sufficient: false, homeCount, awayCount };

  return {
    sufficient: true, homeCount, awayCount,
    attackHome: (homeScored / homeCount) / leagueAvg.avgHomeGoals,
    defenseHome: (homeConceded / homeCount) / leagueAvg.avgAwayGoals,
    attackAway: (awayScored / awayCount) / leagueAvg.avgAwayGoals,
    defenseAway: (awayConceded / awayCount) / leagueAvg.avgHomeGoals,
  };
}

module.exports = { fetchFinishedMatches, leagueAverages, teamStrength };
