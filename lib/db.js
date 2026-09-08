const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

async function migrate() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      match_key TEXT UNIQUE NOT NULL,
      sport TEXT NOT NULL,
      competition_name TEXT,
      competition_country TEXT,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      kickoff TIMESTAMPTZ,
      state TEXT,
      score_home INTEGER,
      score_away INTEGER,
      provenance JSONB,
      first_seen_at TIMESTAMPTZ DEFAULT now(),
      last_updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

function matchKey(ev) {
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const day = (ev.kickoff || '').slice(0, 10);
  return `${day}|${norm(ev.participants.home.name)}|${norm(ev.participants.away.name)}`;
}

async function saveEvents(events) {
  if (!pool || events.length === 0) return { saved: 0 };
  let saved = 0;
  for (const ev of events) {
    const key = matchKey(ev);
    await pool.query(
      `INSERT INTO events (
        match_key, sport, competition_name, competition_country,
        home_team, away_team, kickoff, state, score_home, score_away, provenance, last_updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
      ON CONFLICT (match_key) DO UPDATE SET
        state = EXCLUDED.state,
        score_home = EXCLUDED.score_home,
        score_away = EXCLUDED.score_away,
        provenance = EXCLUDED.provenance,
        last_updated_at = now()`,
      [
        key, ev.sport, ev.competition?.name || null, ev.competition?.country || null,
        ev.participants.home.name, ev.participants.away.name, ev.kickoff || null, ev.state,
        ev.score?.home ?? null, ev.score?.away ?? null, JSON.stringify(ev.provenance),
      ]
    );
    saved++;
  }
  return { saved };
}

async function listEvents({ from, to } = {}) {
  if (!pool) return [];
  const params = [];
  let where = '';
  if (from) { params.push(from); where += ` AND kickoff >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND kickoff <= $${params.length}`; }
  const res = await pool.query(`SELECT * FROM events WHERE true ${where} ORDER BY kickoff ASC LIMIT 200`, params);
  return res.rows;
}

module.exports = { pool, migrate, saveEvents, listEvents };
