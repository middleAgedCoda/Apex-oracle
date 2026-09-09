// Combines saved analyses into an accumulator. Assumes leg outcomes are
// independent — real fixtures can be correlated, so treat the combined
// number as an optimistic upper bound, not an exact one.

function extractLegProbability(analysis, market) {
  const probs = analysis.probabilities;
  const map = {
    home: probs.home, draw: probs.draw, away: probs.away,
    over25: probs.over25, under25: probs.under25,
    btts: probs.btts, bttsno: probs.bttsNo,
  };
  return map[market.toLowerCase()] ?? null;
}

function buildTicket(analyses, markets) {
  const legs = [];
  let combined = 1;

  for (let i = 0; i < analyses.length; i++) {
    const analysis = analyses[i];
    const market = markets[i];
    const probability = extractLegProbability(analysis, market);
    if (probability === null) return { ok: false, reason: `unknown_market:${market}`, legs: [] };

    legs.push({
      analysisId: analysis.analysis_id,
      fixture: `${analysis.home_team} vs ${analysis.away_team}`,
      market, probability,
    });
    combined *= probability / 100;
  }

  return {
    ok: true, legs,
    combinedProbability: Math.round(combined * 10000) / 100,
    note: 'Combined probability assumes each leg is independent. Real fixtures can be correlated, so treat this as an optimistic upper bound, not an exact figure — each added leg multiplies the risk down fast.',
  };
}

module.exports = { buildTicket };
