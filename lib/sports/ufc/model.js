function computeFighterScore(f) {
  const wins = f.recordWins || 0;
  const losses = f.recordLosses || 0;
  const draws = f.recordDraws || 0;
  const totalFights = wins + losses + draws;

  const winRateShrunk = (wins + 2.5) / (totalFights + 5);

  const s = f.stats || {};
  const landedPerMin = parseFloat(s.sigStrikesLandedPerMin) || 0;
  const absorbedPerMin = parseFloat(s.sigStrikesAbsorbedPerMin) || 0;
  const strikingNet = landedPerMin - absorbedPerMin;

  const takedownAcc = parseFloat(s.takedownAccuracy) || 0;
  const takedownAvg = parseFloat(s.takedownAvgPer15Min) || 0;
  const takedownDef = parseFloat(s.takedownDefense) || 0;
  const grapplingNet = takedownAcc * takedownAvg + takedownDef;

  const strikeDef = parseFloat(s.sigStrikeDefense) || 0;
  const knockdownAvg = parseFloat(s.knockdownAvg) || 0;
  const decPercent = s.winsByMethod?.dec?.percent ?? 0.5;
  const finishRate = 1 - decPercent;

  const score =
    winRateShrunk * 40 +
    strikingNet * 8 +
    grapplingNet * 6 +
    strikeDef * 10 +
    knockdownAvg * 10 +
    finishRate * 8;

  return { score, totalFights, sufficient: totalFights >= 3 };
}

// Widened scale (was 6, badly saturating past a 20-point gap) and a hard
// clamp — this heuristic has zero real backtested track record yet, so it
// should never be allowed to express near-certainty regardless of the raw math.
function computeProbabilities(scoreA, scoreB) {
  const diff = scoreA - scoreB;
  const raw = 1 / (1 + Math.exp(-diff / 20));
  const clamp = (x) => Math.min(0.9, Math.max(0.1, x));
  const pA = clamp(raw);
  const pct = (x) => Math.round(x * 10000) / 100;
  return { home: pct(pA), away: pct(1 - pA) };
}

module.exports = { computeFighterScore, computeProbabilities };
