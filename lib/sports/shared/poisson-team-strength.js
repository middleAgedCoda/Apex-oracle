function leagueAverages(games) {
  if (games.length === 0) return null;
  let homeSum = 0, awaySum = 0;
  for (const g of games) { homeSum += g.homeScore; awaySum += g.awayScore; }
  const n = games.length;
  return { avgHomeScore: homeSum / n, avgAwayScore: awaySum / n, sampleSize: n };
}

function teamStrength(games, teamId, league) {
  let homeScored = 0, homeAllowed = 0, homeCount = 0;
  let awayScored = 0, awayAllowed = 0, awayCount = 0;
  for (const g of games) {
    if (g.homeTeamId === teamId) { homeScored += g.homeScore; homeAllowed += g.awayScore; homeCount++; }
    else if (g.awayTeamId === teamId) { awayScored += g.awayScore; awayAllowed += g.homeScore; awayCount++; }
  }
  if (homeCount < 3 || awayCount < 3) return { sufficient: false, homeCount, awayCount };
  return {
    sufficient: true, homeCount, awayCount,
    attackHome: (homeScored / homeCount) / league.avgHomeScore,
    defenseHome: (homeAllowed / homeCount) / league.avgAwayScore,
    attackAway: (awayScored / awayCount) / league.avgAwayScore,
    defenseAway: (awayAllowed / awayCount) / league.avgHomeScore,
  };
}

module.exports = { leagueAverages, teamStrength };
