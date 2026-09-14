const API_BASE = 'https://api.citoapi.com/api/v1/ufc';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

async function fetchFighter(slug, apiKey) {
  const cached = cache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  const res = await fetch(`${API_BASE}/fighters/${slug}`, { headers: { 'x-api-key': apiKey } });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const json = await res.json();
  if (!json.success || !json.data) throw new Error('fighter_not_found');

  cache.set(slug, { data: json.data, fetchedAt: Date.now() });
  return json.data;
}

module.exports = { fetchFighter };
