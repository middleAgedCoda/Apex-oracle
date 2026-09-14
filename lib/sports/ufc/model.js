// Heuristic composite score, not a fitted statistical model — MMA has no
// equivalent to "expected goals," so this weights several real skill
// dimensions transparently rather than faking a distribution that doesn't apply.

function computeFighterScore(f) {
  const wins = f.recordWins || 0;
  const losses = f.recordLosses || 0;
  const draws = f.recordDraws || 0;
  const totalFights = wins + losses + draws;

  // Shrink win rate toward 50/50 for fighters with few fights — a 3-0
  // prospect should not outrank a proven 20-5 veteran on record alone.
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

function computeProbabilities(scoreA, scoreB) {
  const diff = scoreA - scoreB;
  const pA = 1 / (1 + Math.exp(-diff / 6));
  const pct = (x) => Math.round(x * 10000) / 100;
  return { home: pct(pA), away: pct(1 - pA) };
}

module.exports = { computeFighterScore, computeProbabilities };
