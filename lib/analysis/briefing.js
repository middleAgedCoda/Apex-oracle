const BANNED_WORDS = ['guaranteed', 'lock', 'sure win', 'must bet', 'easy money', 'risk-free', "can't lose"];

function buildInstructions(evidence, avoidWord) {
  const seasonNote = evidence.usedPriorSeason
    ? '\n\nNote: this analysis blends last season\'s results with the current season because the current season alone had too few matches. Mention this blending explicitly in the Situation, and treat the smaller current-season sample as a contributing factor in Biggest Risk.'
    : '';
  const avoidNote = avoidWord
    ? `\n\nIMPORTANT: your previous attempt used the forbidden word "${avoidWord}". Do not use it or any close variant this time.`
    : '';
  return `You are the reasoning layer for Apex Oracle, a private sports-analytics tool. You never invent statistics — you only interpret the evidence JSON you're given. You never state or imply certainty. You must NEVER use these words or close variants: ${BANNED_WORDS.join(', ')}. Respond with ONLY a JSON object, no markdown code fences, no commentary before or after, matching this exact shape:
{
  "modelLean": string (which side the numbers favor, stated as a probability, not a pick),
  "situation": string (2-3 sentences on context),
  "primarySignal": string (the single strongest piece of evidence),
  "biggestRisk": string (what could make this lean wrong),
  "conclusion": string (probabilistic, calm, 1-2 sentences),
  "driversFor": [string, string, string],
  "counterfactual": { "conditions": [string, string, string], "likelihood": string, "whatToWatch": string },
  "decisionQuestion": string (open-ended, challenges the user's assumptions, never tells them what to do)
}${seasonNote}${avoidNote}

Evidence:
${JSON.stringify(evidence, null, 2)}`;
}

async function callGemini(apiKey, instructions) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: instructions }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });
  if (!res.ok) return { ok: false, reason: `http_${res.status}` };
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return raw ? { ok: true, raw } : { ok: false, reason: 'empty_response' };
}

async function callNvidia(apiKey, instructions) {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'nvidia/llama-3.1-nemotron-70b-instruct',
      messages: [{ role: 'user', content: instructions }],
      temperature: 0.4,
    }),
  });
  if (!res.ok) return { ok: false, reason: `http_${res.status}` };
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  return raw ? { ok: true, raw } : { ok: false, reason: 'empty_response' };
}

function extractJson(raw) {
  return raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
}

function findBannedWord(text) {
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word.toLowerCase())) return word;
  }
  return null;
}

async function attemptProvider(callFn, apiKey, evidence, providerName) {
  let avoidWord = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const instructions = buildInstructions(evidence, avoidWord);
    let result;
    for (let retry = 0; retry < 2; retry++) {
      result = await callFn(apiKey, instructions);
      if (result.ok) break;
      const status = Number((result.reason || '').replace('http_', ''));
      if (!(status >= 500 && status < 600)) break;
      await new Promise((r) => setTimeout(r, 700 * (retry + 1)));
    }
    if (!result.ok) return { ok: false, reason: `${providerName}_${result.reason}` };

    let parsed;
    try { parsed = JSON.parse(extractJson(result.raw)); }
    catch { return { ok: false, reason: `${providerName}_invalid_json` }; }

    const violation = findBannedWord(JSON.stringify(parsed));
    if (!violation) return { ok: true, briefing: parsed };
    avoidWord = violation;
  }
  return { ok: false, reason: `${providerName}_banned_language:${avoidWord}` };
}

async function generateBriefing(evidence) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;

  if (geminiKey) {
    const result = await attemptProvider(callGemini, geminiKey, evidence, 'gemini');
    if (result.ok) return result;
    if (nvidiaKey) {
      const backup = await attemptProvider(callNvidia, nvidiaKey, evidence, 'nvidia');
      if (backup.ok) return backup;
      return { ok: false, reason: `${result.reason}|${backup.reason}`, briefing: fallbackBriefing(evidence) };
    }
    return { ok: false, reason: result.reason, briefing: fallbackBriefing(evidence) };
  }

  if (nvidiaKey) {
    const backup = await attemptProvider(callNvidia, nvidiaKey, evidence, 'nvidia');
    if (backup.ok) return backup;
    return { ok: false, reason: backup.reason, briefing: fallbackBriefing(evidence) };
  }

  return { ok: false, reason: 'no_api_key', briefing: fallbackBriefing(evidence) };
}

function fallbackBriefing(evidence) {
  const { probabilities, fixture, lambdas, usedPriorSeason } = evidence;
  const favored = probabilities.home > probabilities.away
    ? `${fixture.home} (${probabilities.home}%)`
    : `${fixture.away} (${probabilities.away}%)`;

  return {
    modelLean: `The model assigns the higher probability to ${favored}, with a draw at ${probabilities.draw}%.`,
    situation: `Automated fallback narrative — the AI reasoning layer was unavailable, so this is generated directly from the deterministic model output.${usedPriorSeason ? ' This analysis blends prior-season results due to a small current-season sample.' : ''}`,
    primarySignal: `Expected goals: ${fixture.home} ${lambdas.home} vs ${fixture.away} ${lambdas.away}.`,
    biggestRisk: 'Football is low-scoring with high single-match variance; any of the three outcomes remains plausible.',
    conclusion: `Probabilities: Home ${probabilities.home}%, Draw ${probabilities.draw}%, Away ${probabilities.away}%.`,
    driversFor: [],
    counterfactual: { conditions: [], likelihood: 'unknown', whatToWatch: 'Fallback narrative — no counterfactual generated.' },
    decisionQuestion: 'What evidence would need to change for you to see this fixture differently?',
  };
}

module.exports = { generateBriefing };
