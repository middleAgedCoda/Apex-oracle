require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { gatherEvents } = require('./lib/data-mesh');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  const health = { status: 'ok', time: new Date().toISOString(), database: 'not_configured' };
  if (pool) {
    try {
      await pool.query('SELECT 1');
      health.database = 'connected';
    } catch (err) {
      health.database = 'error';
      health.databaseError = err.message;
    }
  }
  res.json(health);
});

app.get('/api/providers/football-data/competitions', async (req, res) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return res.json({ ok: false, reason: 'no_api_key' });

  try {
    const r = await fetch('https://api.football-data.org/v4/competitions', {
      headers: { 'X-Auth-Token': apiKey }
    });
    const data = await r.json();
    const summary = (data.competitions || []).map(c => ({
      code: c.code, name: c.name, plan: c.plan
    }));
    res.json({ ok: r.ok, status: r.status, competitions: summary });
  } catch (err) {
    res.json({ ok: false, reason: err.message });
  }
});

app.get('/api/providers/football-data/pl-check', async (req, res) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return res.json({ ok: false, reason: 'no_api_key' });

  try {
    const url = 'https://api.football-data.org/v4/competitions/PL/matches?dateFrom=2026-09-08&dateTo=2026-09-20';
    const r = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
    const data = await r.json();
    res.json({ ok: r.ok, status: r.status, count: data.matches?.length ?? 0, raw: data });
  } catch (err) {
    res.json({ ok: false, reason: err.message });
  }
});

app.get('/api/events/mesh', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const result = await gatherEvents(date);
  res.json(result);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Apex Oracle listening on port ${PORT}`));
