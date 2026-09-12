function leagueAverages(games) {
  if (games.length === 0) return null;
  let homeSum = 0, awaySum = 0;
  const diffs = [];
  for (const g of games) {
    homeSum += g.home_team_score;
    awaySum += g.visitor_team_score;
    diffs.push(g.home_team_score - g.visitor_team_score);
  }
  const n = games.length;
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / n;
  const variance = diffs.reduce((a, d) => a + Math.pow(d - meanDiff, 2), 0) / n;
  return { avgHomePoints: homeSum / n, avgAwayPoints: awaySum / n, diffStdDev: Math.sqrt(variance) };
}

function teamStrength(games, teamId, league) {
  let homeScored = 0, homeAllowed = 0, homeCount = 0;
  let awayScored = 0, awayAllowed = 0, awayCount = 0;
  for (const g of games) {
    if (g.home_team.id === teamId) {
      homeScored += g.home_team_score; homeAllowed += g.visitor_team_score; homeCount++;
    } else if (g.visitor_team.id === teamId) {
      awayScored += g.visitor_team_score; awayAllowed += g.home_team_score; awayCount++;
    }
  }
  if (homeCount < 3 || awayCount < 3) return { sufficient: false, homeCount, awayCount };
  return {
    sufficient: true, homeCount, awayCount,
    attackHome: (homeScored / homeCount) / league.avgHomePoints,
    defenseHome: (homeAllowed / homeCount) / league.avgAwayPoints,
    attackAway: (awayScored / awayCount) / league.avgAwayPoints,
    defenseAway: (awayAllowed / awayCount) / league.avgHomePoints,
  };
}

// Standard normal CDF, Abramowitz-Stegun approximation — basketball margins
// are well-approximated by a normal distribution, unlike soccer's low-scoring Poisson shape.
function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

function computeProbabilities(expectedHome, expectedAway, diffStdDev) {
  const meanDiff = expectedHome - expectedAway;
  const sd = diffStdDev > 0 ? diffStdDev : 12; // fallback: typical NBA margin spread
  const homeWinProb = 1 - normalCdf(-meanDiff / sd);
  const pct = (x) => Math.round(x * 10000) / 100;
  return { home: pct(homeWinProb), away: pct(1 - homeWinProb) };
}

module.exports = { leagueAverages, teamStrength, computeProbabilities };
