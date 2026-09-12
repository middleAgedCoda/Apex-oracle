const MIN_SAMPLE_TO_APPLY = 50;
const CLAMP_MIN = 0.7;
const CLAMP_MAX = 1.3;

function sampleBand(n) {
  if (n >= 100) return 'meaningful';
  if (n >= 50) return 'emerging';
  if (n >= 20) return 'early';
  return 'insufficient';
}

function computeCalibration(completedAnalyses) {
  const n = completedAnalyses.length;
  if (n === 0) return null;

  let predHomeSum = 0, predAwaySum = 0, actualHomeSum = 0, actualAwaySum = 0;
  for (const a of completedAnalyses) {
    predHomeSum += Number(a.lambdas.home);
    predAwaySum += Number(a.lambdas.away);
    actualHomeSum += Number(a.actual_score.home);
    actualAwaySum += Number(a.actual_score.away);
  }

  const clamp = (x) => Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, x));
  const rawHome = predHomeSum > 0 ? actualHomeSum / predHomeSum : 1;
  const rawAway = predAwaySum > 0 ? actualAwaySum / predAwaySum : 1;

  return {
    sampleSize: n,
    band: sampleBand(n),
    homeMultiplier: Math.round(clamp(rawHome) * 10000) / 10000,
    awayMultiplier: Math.round(clamp(rawAway) * 10000) / 10000,
  };
}

module.exports = { computeCalibration, sampleBand, MIN_SAMPLE_TO_APPLY };
