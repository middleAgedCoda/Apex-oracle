const { buildTicket } = require('./ticket');

function pickSuggestions(analyses) {
  const ranked = analyses.map((a) => {
    const entries = Object.entries(a.probabilities);
    entries.sort((x, y) => y[1] - x[1]);
    const [market, probability] = entries[0];
    return { analysis: a, market, probability };
  }).sort((x, y) => y.probability - x.probability);

  const sizes = [
    { label: 'Conservative', count: 2 },
    { label: 'Balanced', count: 3 },
    { label: 'Aggressive', count: 4 },
  ];

  const suggestions = [];
  for (const { label, count } of sizes) {
    if (ranked.length < count) continue;
    const picks = ranked.slice(0, count);
    const built = buildTicket(picks.map((p) => p.analysis), picks.map((p) => p.market));
    if (built.ok) suggestions.push({ label, ...built });
  }
  return suggestions;
}

module.exports = { pickSuggestions };
