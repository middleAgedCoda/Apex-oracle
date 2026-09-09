const { fetchFinishedMatches } = require('./team-strength');

function brierScore(probabilities, actualOutcome) {
  const p = { home: probabilities.home / 100, draw: probabilities.draw / 100, away: probabilities.away / 100 };
  const actual = { home: 0, draw: 0, away: 0 };
  actual[actualOutcome] = 1;
  return (
    Math.pow(p.home - actual.home, 2) +
    Math.pow(p.draw - actual.draw, 2) +
    Math.pow(p.away - actual.away, 2)
  );
}

async function findResult(competition, home, away, apiKey) {
  const matches = await fetchFinishedMatches(competition, apiKey);
  const match = matches.find((m) => m.homeTeam?.name === home && m.awayTeam?.name === away);
  if (!match || match.score?.fullTime?.home == null) return null;

  const { home: hg, away: ag } = match.score.fullTime;
  const actualOutcome = hg > ag ? 'home' : hg === ag ? 'draw' : 'away';
  return { homeGoals: hg, awayGoals: ag, actualOutcome };
}

function leanCorrect(probabilities, actualOutcome) {
  const lean = probabilities.home >= probabilities.draw && probabilities.home >= probabilities.away
    ? 'home' : probabilities.draw >= probabilities.away ? 'draw' : 'away';
  return lean === actualOutcome;
}

module.exports = { findResult, brierScore, leanCorrect };
