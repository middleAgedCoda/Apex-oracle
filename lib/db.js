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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS analyses (
      id SERIAL PRIMARY KEY,
      analysis_id TEXT UNIQUE NOT NULL,
      competition TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      lambdas JSONB,
      probabilities JSONB,
      briefing JSONB,
      briefing_source TEXT,
      model_version TEXT,
      prompt_version TEXT,
      status TEXT DEFAULT 'pending',
      actual_score JSONB,
      outcome_correct BOOLEAN,
      brier_score NUMERIC,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE analyses ADD COLUMN IF NOT EXISTS model_version TEXT;`);
  await pool.query(`ALTER TABLE analyses ADD COLUMN IF NOT EXISTS prompt_version TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      ticket_id TEXT UNIQUE NOT NULL,
      legs JSONB NOT NULL,
      combined_probability NUMERIC NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
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

function genId(prefix) {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000000 + Math.random() * 9000000);
  return `${prefix}-${year}-${rand}`;
}

async function saveAnalysis({ competition, home, away, lambdas, probabilities, briefing, briefingSource, modelVersion, promptVersion }) {
  if (!pool) return null;
  const analysisId = genId('AO');
  const res = await pool.query(
    `INSERT INTO analyses (analysis_id, competition, home_team, away_team, lambdas, probabilities, briefing, briefing_source, model_version, prompt_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [analysisId, competition, home, away, JSON.stringify(lambdas), JSON.stringify(probabilities), JSON.stringify(briefing), briefingSource, modelVersion, promptVersion]
  );
  return res.rows[0];
}

async function listAnalyses({ status } = {}) {
  if (!pool) return [];
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE status = $1`; }
  const res = await pool.query(`SELECT * FROM analyses ${where} ORDER BY created_at DESC LIMIT 100`, params);
  return res.rows;
}

async function getAnalysis(analysisId) {
  if (!pool) return null;
  const res = await pool.query(`SELECT * FROM analyses WHERE analysis_id = $1`, [analysisId]);
  return res.rows[0] || null;
}

async function updateAnalysisOutcome(analysisId, { actualScore, outcomeCorrect, brierScore }) {
  if (!pool) return null;
  const res = await pool.query(
    `UPDATE analyses SET status = 'completed', actual_score = $2, outcome_correct = $3, brier_score = $4, updated_at = now()
     WHERE analysis_id = $1 RETURNING *`,
    [analysisId, JSON.stringify(actualScore), outcomeCorrect, brierScore]
  );
  return res.rows[0] || null;
}

async function saveTicket({ legs, combinedProbability }) {
  if (!pool) return null;
  const ticketId = genId('TICKET');
  const res = await pool.query(
    `INSERT INTO tickets (ticket_id, legs, combined_probability) VALUES ($1,$2,$3) RETURNING *`,
    [ticketId, JSON.stringify(legs), combinedProbability]
  );
  return res.rows[0];
}

async function listTickets() {
  if (!pool) return [];
  const res = await pool.query(`SELECT * FROM tickets ORDER BY created_at DESC LIMIT 100`);
  return res.rows;
}

async function ledgerStats() {
  if (!pool) return null;
  const res = await pool.query(`SELECT competition, outcome_correct, brier_score FROM analyses WHERE status = 'completed'`);
  const rows = res.rows;
  const total = rows.length;
  const correct = rows.filter((r) => r.outcome_correct).length;
  const avgBrier = total ? rows.reduce((s, r) => s + Number(r.brier_score || 0), 0) / total : null;

  const byCompetition = {};
  for (const r of rows) {
    if (!byCompetition[r.competition]) byCompetition[r.competition] = { total: 0, correct: 0 };
    byCompetition[r.competition].total++;
    if (r.outcome_correct) byCompetition[r.competition].correct++;
  }

  let sampleBand = 'insufficient';
  if (total >= 100) sampleBand = 'meaningful';
  else if (total >= 50) sampleBand = 'emerging';
  else if (total >= 20) sampleBand = 'early';

  return {
    totalCompleted: total,
    accuracy: total ? Math.round((correct / total) * 10000) / 100 : null,
    averageBrierScore: avgBrier !== null ? Math.round(avgBrier * 10000) / 10000 : null,
    sampleBand,
    byCompetition,
  };
}

module.exports = {
  pool, migrate, saveEvents, listEvents,
  saveAnalysis, listAnalyses, getAnalysis, updateAnalysisOutcome,
  saveTicket, listTickets, ledgerStats,
};
