const { fetchFinishedMatches, leagueAverages, teamStrength } = require('./team-strength');
const { computeProbabilities } = require('./poisson');
const { getPendingAnalysisFor, saveAnalysis } = require('../db');

const LEAGUES = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'BSA'];
const API_BASE = 'https://api.football-data.org/v4';

async function fetchUpcomingFixtures(code, apiKey, days) {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const url = `${API_BASE}/competitions/${code}/matches?dateFrom=${from}&dateTo=${to}&status=SCHEDULED`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.matches || [];
}

async function analyzeForScan(code, home, away, apiKey) {
  let { matches, seasonYear } = await fetchFinishedMatches(code, apiKey);
  let leagueAvg = leagueAverages(matches);
  let homeStrength = leagueAvg ? teamStrength(matches, home, leagueAvg) : { sufficient: false };
  let awayStrength = leagueAvg ? teamStrength(matches, away, leagueAvg) : { sufficient: false };
  let usedPriorSeason = false;

  if ((!leagueAvg || !homeStrength.sufficient || !awayStrength.sufficient) && seasonYear) {
    try {
      const prior = await fetchFinishedMatches(code, apiKey, String(Number(seasonYear) - 1));
      const combined = matches.concat(prior.matches);
      const combinedAvg = leagueAverages(combined);
      if (combinedAvg) {
        const ch = teamStrength(combined, home, combinedAvg);
        const ca = teamStrength(combined, away, combinedAvg);
        if (ch.sufficient && ca.sufficient) {
          matches = combined; leagueAvg = combinedAvg; homeStrength = ch; awayStrength = ca; usedPriorSeason = true;
        }
      }
    } catch { /* treated as insufficient below */ }
  }

  if (!leagueAvg || !homeStrength.sufficient || !awayStrength.sufficient) return null;

  const lambdaHome = leagueAvg.avgHomeGoals * homeStrength.attackHome * awayStrength.defenseAway;
  const lambdaAway = leagueAvg.avgAwayGoals * awayStrength.attackAway * homeStrength.defenseHome;
  const probabilities = computeProbabilities(lambdaHome, lambdaAway);
  const lambdas = { home: Math.round(lambdaHome * 100) / 100, away: Math.round(lambdaAway * 100) / 100 };
  return { lambdas, probabilities, usedPriorSeason };
}

async function runAutonomousScan({ days = 7, modelVersion, promptVersion }) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_football_data_key' };

  const results = { scanned: 0, saved: 0, skipped: 0, byLeague: {} };

  for (const code of LEAGUES) {
    const fixtures = await fetchUpcomingFixtures(code, apiKey, days);
    results.byLeague[code] = { fixtures: fixtures.length, saved: 0 };

    for (const m of fixtures) {
      const home = m.homeTeam?.name;
      const away = m.awayTeam?.name;
      if (!home || !away) continue;
      results.scanned++;

      const existing = await getPendingAnalysisFor(code, home, away);
      if (existing) { results.skipped++; continue; }

      const analysis = await analyzeForScan(code, home, away, apiKey);
      if (!analysis) { results.skipped++; continue; }

      // AI narrative deferred during bulk scans to stay fast and inside
      // free-tier rate limits — generated on demand when a fixture is opened.
      const placeholderBriefing = {
        modelLean: 'Not yet generated — open this analysis to generate the full briefing.',
        situation: 'Deterministic probabilities only. AI narrative deferred during bulk scan.',
        primarySignal: `Expected goals: ${home} ${analysis.lambdas.home} vs ${away} ${analysis.lambdas.away}.`,
        biggestRisk: 'Not yet generated.',
        conclusion: 'Not yet generated.',
        driversFor: [],
        counterfactual: { conditions: [], likelihood: 'unknown', whatToWatch: 'Not yet generated.' },
        decisionQuestion: 'Open this fixture to generate a full Oracle Briefing.',
      };

      await saveAnalysis({
        competition: code, home, away,
        lambdas: analysis.lambdas, probabilities: analysis.probabilities,
        briefing: placeholderBriefing, briefingSource: 'deferred', briefingIssue: null,
        modelVersion, promptVersion, usedPriorSeason: analysis.usedPriorSeason,
      });
      results.saved++;
      results.byLeague[code].saved++;
    }
  }

  return { ok: true, ...results };
}

module.exports = { runAutonomousScan };
