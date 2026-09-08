const footballData = require('./providers/football-data');
const sportmonks = require('./providers/sportmonks');

const PROVIDERS = [footballData, sportmonks];

async function gatherEvents(date) {
  const results = await Promise.all(PROVIDERS.map((p) => p.fetchEvents(date)));
  const merged = mergeEvents(results);
  return {
    date,
    providerResults: results.map((r) => ({ provider: r.provider, ok: r.ok, reason: r.reason, count: r.events.length })),
    events: merged,
  };
}

// Naive first pass: match by date + normalized team names. A real fixture-ID
// crosswalk between providers is a follow-up, not implemented here.
function mergeEvents(results) {
  const buckets = new Map();
  for (const result of results) {
    if (!result.ok) continue;
    for (const ev of result.events) {
      const key = matchKey(ev);
      if (!buckets.has(key)) {
        buckets.set(key, { ...ev, provenance: [ev.provenance] });
      } else {
        const existing = buckets.get(key);
        existing.provenance.push(ev.provenance);
        if (!existing.score && ev.score) existing.score = ev.score;
        if (existing.state === 'unknown' && ev.state !== 'unknown') existing.state = ev.state;
      }
    }
  }
  return Array.from(buckets.values());
}

function matchKey(ev) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const day = (ev.kickoff || '').slice(0, 10);
  return `${day}|${norm(ev.participants.home.name)}|${norm(ev.participants.away.name)}`;
}

module.exports = { gatherEvents };
