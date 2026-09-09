require('dotenv').config();
const { fetchFinishedMatches, leagueAverages, teamStrength } = require('./lib/analysis/team-strength');
const { computeProbabilities } = require('./lib/analysis/poisson');
const { generateBriefing } = require('./lib/analysis/briefing');
const express = require('express');
const path = require('path');
const { gatherEvents } = require('./lib/data-mesh');
const { pool, migrate, saveEvents, listEvents } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.get('/api/analyze', async (req, res) => {
  const { competition, home, away } = req.query;
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  if (!competition || !home || !away) {
    return res.status(400).json({ ok: false, reason: 'missing_params', required: ['competition', 'home', 'away'] });
  }
  if (!apiKey) return res.json({ ok: false, reason: 'no_api_key' });

  try {
    const matches = await fetchFinishedMatches(competition, apiKey);
    const leagueAvg = leagueAverages(matches);
    if (!leagueAvg) return res.json({ ok: false, reason: 'no_finished_matches_yet', competition });

    const homeStrength = teamStrength(matches, home, leagueAvg);
    const awayStrength = teamStrength(matches, away, leagueAvg);

    if (!homeStrength.sufficient || !awayStrength.sufficient) {
      return res.json({
        ok: false, reason: 'insufficient_sample',
        detail: { home: homeStrength, away: awayStrength },
        note: 'Need at least 3 home and 3 away matches each with recorded scores. Early season — try again once more matchdays are played.',
      });
    }

    const lambdaHome = leagueAvg.avgHomeGoals * homeStrength.attackHome * awayStrength.defenseAway;
    const lambdaAway = leagueAvg.avgAwayGoals * awayStrength.attackAway * homeStrength.defenseHome;
    const probabilities = computeProbabilities(lambdaHome, lambdaAway);

    res.json({
      ok: true, competition, fixture: { home, away },
      leagueAverages: leagueAvg,
      lambdas: { home: Math.round(lambdaHome * 100) / 100, away: Math.round(lambdaAway * 100) / 100 },
      probabilities,
      sampleSizes: { home: homeStrength.homeCount, away: awayStrength.awayCount },
    });
  } catch (err) {
    res.json({ ok: false, reason: err.message });
  }
});

app.get('/api/briefing', async (req, res) => {
  const { competition, home, away } = req.query;
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  if (!competition || !home || !away) {
    return res.status(400).json({ ok: false, reason: 'missing_params', required: ['competition', 'home', 'away'] });
  }
  if (!apiKey) return res.json({ ok: false, reason: 'no_football_data_key' });

  try {
    const matches = await fetchFinishedMatches(competition, apiKey);
    const leagueAvg = leagueAverages(matches);
    if (!leagueAvg) return res.json({ ok: false, reason: 'no_finished_matches_yet', competition });

    const homeStrength = teamStrength(matches, home, leagueAvg);
    const awayStrength = teamStrength(matches, away, leagueAvg);

    if (!homeStrength.sufficient || !awayStrength.sufficient) {
      return res.json({ ok: false, reason: 'insufficient_sample', detail: { home: homeStrength, away: awayStrength } });
    }

    const lambdaHome = leagueAvg.avgHomeGoals * homeStrength.attackHome * awayStrength.defenseAway;
    const lambdaAway = leagueAvg.avgAwayGoals * awayStrength.attackAway * homeStrength.defenseHome;
    const probabilities = computeProbabilities(lambdaHome, lambdaAway);

    const evidence = {
      competition, fixture: { home, away },
      leagueAverages: leagueAvg,
      lambdas: { home: Math.round(lambdaHome * 100) / 100, away: Math.round(lambdaAway * 100) / 100 },
      probabilities,
      sampleSizes: { home: homeStrength.homeCount, away: awayStrength.awayCount },
    };

    const result = await generateBriefing(evidence);

    res.json({
      ok: true,
      evidence,
      briefingSource: result.ok ? 'ai' : 'fallback',
      briefingIssue: result.ok ? undefined : result.reason,
      briefing: result.briefing,
    });
  } catch (err) {
    res.json({ ok: false, reason: err.message });
  }
});

app.get('/api/providers/football-data/competitions', async (req, res) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return res.json({ ok: false, reason: 'no_api_key' });
  try {
    const r = await fetch('https://api.football-data.org/v4/competitions', {
      headers: { 'X-Auth-Token': apiKey }
    });
    const data = await r.json();
    const summary = (data.competitions || []).map(c => ({ code: c.code, name: c.name, plan: c.plan }));
    res.json({ ok: r.ok, status: r.status, competitions: summary });
  } catch (err) {
    res.json({ ok: false, reason: err.message });
  }
});

app.get('/api/providers/football-data/teams', async (req, res) => {
  const { competition } = req.query;
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return res.json({ ok: false, reason: 'no_api_key' });
  if (!competition) return res.json({ ok: false, reason: 'missing_competition_param' });

  try {
    const url = `https://api.football-data.org/v4/competitions/${competition}/teams`;
    const r = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
    const data = await r.json();
    const names = (data.teams || []).map(t => t.name);
    res.json({ ok: r.ok, competition, teams: names });
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
  const persisted = await saveEvents(result.events);
  res.json({ ...result, persisted });
});

app.get('/api/events', async (req, res) => {
  const { from, to } = req.query;
  const events = await listEvents({ from, to });
  res.json({ count: events.length, events });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await migrate();
  app.listen(PORT, () => console.log(`Apex Oracle listening on port ${PORT}`));
}

start();
