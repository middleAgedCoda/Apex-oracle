const { buildTicket } = require('./ticket');

const SIZE_TIERS = [
  { label: 'Conservative', count: 2 },
  { label: 'Balanced', count: 3 },
  { label: 'Aggressive', count: 4 },
  { label: 'Ambitious', count: 5 },
  { label: 'Bold', count: 6 },
  { label: 'High Volume', count: 8 },
  { label: 'Extreme', count: 10 },
  { label: 'Reckless', count: 12 },
  { label: 'Maximum Overdrive', count: 15 },
];

function pickSuggestions(analyses) {
  const ranked = analyses.map((a) => {
    const entries = Object.entries(a.probabilities);
    entries.sort((x, y) => y[1] - x[1]);
    const [market, probability] = entries[0];
    return { analysis: a, market, probability };
  }).sort((x, y) => y.probability - x.probability);

  const suggestions = [];
  for (const { label, count } of SIZE_TIERS) {
    if (ranked.length < count) continue;
    const picks = ranked.slice(0, count);
    const built = buildTicket(picks.map((p) => p.analysis), picks.map((p) => p.market));
    if (built.ok) suggestions.push({ label, ...built });
  }
  return suggestions;
}

module.exports = { pickSuggestions };
