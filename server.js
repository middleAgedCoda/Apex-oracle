require('dotenv').config();
const { fetchFinishedMatches, leagueAverages, teamStrength } = require('./lib/analysis/team-strength');
const { computeProbabilities } = require('./lib/analysis/poisson');
const { generateBriefing } = require('./lib/analysis/briefing');
const { findResult, brierScore, leanCorrect } = require('./lib/analysis/replay');
const { buildTicket } = require('./lib/analysis/ticket');
const { pickSuggestions } = require('./lib/analysis/ticket-suggester');
const { MODEL_VERSION, PROMPT_VERSION } = require('./lib/analysis/versions');
const express = require('express');
const path = require('path');
const { gatherEvents } = require('./lib/data-mesh');
const {
  pool, migrate, saveEvents, listEvents,
  saveAnalysis, listAnalyses, getAnalysis, updateAnalysisOutcome,
  saveTicket, listTickets, ledgerStats,
} = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) return res.status(500).json({ ok: false, reason: 'app_secret_not_configured' });
  const provided = req.query.key || req.headers['x-oracle-key'];
  if (provided !== appSecret) return res.status(401).json({ ok: false, reason: 'unauthorized' });
  next();
}
app.use('/api', requireAuth);

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

async function runAnalysis(competition, home, away) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_football_data_key' };

  const matches = await fetchFinishedMatches(competition, apiKey);
  const leagueAvg = leagueAverages(matches);
  if (!leagueAvg) return { ok: false, reason: 'no_finished_matches_yet', competition };

  const homeStrength = teamStrength(matches, home, leagueAvg);
  const awayStrength = teamStrength(matches, away, leagueAvg);
  if (!homeStrength.sufficient || !awayStrength.sufficient) {
    return { ok: false, reason: 'insufficient_sample', detail: { home: homeStrength, away: awayStrength } };
  }

  const lambdaHome = leagueAvg.avgHomeGoals * homeStrength.attackHome * awayStrength.defenseAway;
  const lambdaAway = leagueAvg.avgAwayGoals * awayStrength.attackAway * homeStrength.defenseHome;
  const probabilities = computeProbabilities(lambdaHome, lambdaAway);
  const lambdas = { home: Math.round(lambdaHome * 100) / 100, away: Math.round(lambdaAway * 100) / 100 };

  return {
    ok: true,
    evidence: {
      competition, fixture: { home, away }, leagueAverages: leagueAvg, lambdas, probabilities,
      sampleSizes: { home: homeStrength.homeCount, away: awayStrength.awayCount },
    },
  };
}

app.get('/api/analyze', async (req, res) => {
  const { competition, home, away } = req.query;
  if (!competition || !home || !away) {
    return res.status(400).json({ ok: false, reason: 'missing_params', required: ['competition', 'home', 'away'] });
  }
  const result = await runAnalysis(competition, home, away);
  if (!result.ok) return res.json(result);
  res.json({ ok: true, ...result.evidence });
});

app.get('/api/briefing', async (req, res) => {
  const { competition, home, away } = req.query;
  if (!competition || !home || !away) {
    return res.status(400).json({ ok: false, reason: 'missing_params', required: ['competition', 'home', 'away'] });
  }
  const result = await runAnalysis(competition, home, away);
  if (!result.ok) return res.json(result);

  const briefingResult = await generateBriefing(result.evidence);
  res.json({
    ok: true, evidence: result.evidence,
    briefingSource: briefingResult.ok ? 'ai' : 'fallback',
    briefingIssue: briefingResult.ok ? undefined : briefingResult.reason,
    briefing: briefingResult.briefing,
  });
});

app.get('/api/analyze-and-save', async (req, res) => {
  const { competition, home, away } = req.query;
  if (!competition || !home || !away) {
    return res.status(400).json({ ok: false, reason: 'missing_params', required: ['competition', 'home', 'away'] });
  }
  const result = await runAnalysis(competition, home, away);
  if (!result.ok) return res.json(result);

  const briefingResult = await generateBriefing(result.evidence);
  const { lambdas, probabilities } = result.evidence;

  const saved = await saveAnalysis({
    competition, home, away, lambdas, probabilities,
    briefing: briefingResult.briefing,
    briefingSource: briefingResult.ok ? 'ai' : 'fallback',
    briefingIssue: briefingResult.ok ? null : briefingResult.reason,
    modelVersion: MODEL_VERSION,
    promptVersion: PROMPT_VERSION,
  });

  res.json({ ok: true, analysis: saved });
});

app.get('/api/analyses', async (req, res) => {
  const { status } = req.query;
  const analyses = await listAnalyses({ status });
  res.json({ count: analyses.length, analyses });
});

app.get('/api/analyses/:analysisId', async (req, res) => {
  const analysis = await getAnalysis(req.params.analysisId);
  if (!analysis) return res.status(404).json({ ok: false, reason: 'not_found' });
  res.json({ ok: true, analysis });
});

app.get('/api/analyses/:analysisId/replay', async (req, res) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  const analysis = await getAnalysis(req.params.analysisId);
  if (!analysis) return res.status(404).json({ ok: false, reason: 'not_found' });
  if (!apiKey) return res.json({ ok: false, reason: 'no_football_data_key' });

  try {
    const result = await findResult(analysis.competition, analysis.home_team, analysis.away_team, apiKey);
    if (!result) return res.json({ ok: false, reason: 'match_not_finished_yet' });

    const probabilities = analysis.probabilities;
    const correct = leanCorrect(probabilities, result.actualOutcome);
    const brier = brierScore(probabilities, result.actualOutcome);

    const updated = await updateAnalysisOutcome(analysis.analysis_id, {
      actualScore: { home: result.homeGoals, away: result.awayGoals },
      outcomeCorrect: correct,
      brierScore: brier,
    });

    res.json({ ok: true, analysis: updated, replay: { actualOutcome: result.actualOutcome, leanWasCorrect: correct, brierScore: brier } });
  } catch (err) {
    res.json({ ok: false, reason: err.message });
  }
});

app.get('/api/ledger', async (req, res) => {
  const stats = await ledgerStats();
  res.json(stats);
});

app.get('/api/ticket/build', async (req, res) => {
  const { legs } = req.query;
  if (!legs) return res.status(400).json({ ok: false, reason: 'missing_legs', format: 'analysisId:market,analysisId:market' });

  try {
    const pairs = legs.split(',').map((s) => s.trim().split(':'));
    const analyses = [];
    const markets = [];
    for (const [analysisId, market] of pairs) {
      const analysis = await getAnalysis(analysisId);
      if (!analysis) return res.json({ ok: false, reason: `analysis_not_found:${analysisId}` });
      analyses.push(analysis);
      markets.push(market);
    }

    const result = buildTicket(analyses, markets);
    if (!result.ok) return res.json(result);

    const saved = await saveTicket({ legs: result.legs, combinedProbability: result.combinedProbability });
    res.json({ ok: true, ticket: saved, note: result.note });
  } catch (err) {
    res.json({ ok: false, reason: err.message });
  }
});

app.get('/api/ticket/suggest', async (req, res) => {
  const pending = await listAnalyses({ status: 'pending' });
  if (!pending.length) return res.json({ ok: false, reason: 'no_pending_analyses' });
  const suggestions = pickSuggestions(pending);
  res.json({ ok: true, suggestions });
});

app.get('/api/tickets', async (req, res) => {
  const tickets = await listTickets();
  res.json({ count: tickets.length, tickets });
});

app.get('/api/providers/football-data/competitions', async (req, res) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return res.json({ ok: false, reason: 'no_api_key' });
  try {
    const r = await fetch('https://api.football-data.org/v4/competitions', { headers: { 'X-Auth-Token': apiKey } });
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

app.get('/api/events/mesh', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const competition = req.query.competition;
  const result = await gatherEvents(date, competition ? [competition] : undefined);
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
