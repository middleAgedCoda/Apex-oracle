const BANNED_WORDS = ['guaranteed', 'lock', 'sure win', 'must bet', 'easy money', 'risk-free', "can't lose"];

async function callGemini(apiKey, instructions) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: instructions }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });
}

async function generateBriefing(evidence) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_api_key', briefing: fallbackBriefing(evidence) };

  const instructions = `You are the reasoning layer for Apex Oracle, a private sports-analytics tool. You never invent statistics — you only interpret the evidence JSON you're given. You never state or imply certainty. You must NEVER use these words or close variants: ${BANNED_WORDS.join(', ')}. Respond with ONLY a JSON object matching this exact shape:
{
  "modelLean": string (which side the numbers favor, stated as a probability, not a pick),
  "situation": string (2-3 sentences on context),
  "primarySignal": string (the single strongest piece of evidence),
  "biggestRisk": string (what could make this lean wrong),
  "conclusion": string (probabilistic, calm, 1-2 sentences),
  "driversFor": [string, string, string],
  "counterfactual": { "conditions": [string, string, string], "likelihood": string, "whatToWatch": string },
  "decisionQuestion": string (open-ended, challenges the user's assumptions, never tells them what to do)
}

Evidence:
${JSON.stringify(evidence, null, 2)}`;

  try {
    let res = await callGemini(apiKey, instructions);
    if (res.status >= 500 && res.status < 600) {
      await new Promise((r) => setTimeout(r, 900));
      res = await callGemini(apiKey, instructions);
    }
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, briefing: fallbackBriefing(evidence) };

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return { ok: false, reason: 'empty_response', briefing: fallbackBriefing(evidence) };

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'invalid_json', briefing: fallbackBriefing(evidence) };
    }

    const violation = findBannedWord(parsed);
    if (violation) return { ok: false, reason: `banned_language:${violation}`, briefing: fallbackBriefing(evidence) };

    return { ok: true, briefing: parsed };
  } catch (err) {
    return { ok: false, reason: err.message, briefing: fallbackBriefing(evidence) };
  }
}

function findBannedWord(obj) {
  const text = JSON.stringify(obj).toLowerCase();
  for (const word of BANNED_WORDS) {
    if (text.includes(word.toLowerCase())) return word;
  }
  return null;
}

function fallbackBriefing(evidence) {
  const { probabilities, fixture, lambdas } = evidence;
  const favored = probabilities.home > probabilities.away
    ? `${fixture.home} (${probabilities.home}%)`
    : `${fixture.away} (${probabilities.away}%)`;

  return {
    modelLean: `The model assigns the higher probability to ${favored}, with a draw at ${probabilities.draw}%.`,
    situation: 'Automated fallback narrative — the AI reasoning layer was unavailable, so this is generated directly from the deterministic model output.',
    primarySignal: `Expected goals: ${fixture.home} ${lambdas.home} vs ${fixture.away} ${lambdas.away}.`,
    biggestRisk: 'Football is low-scoring with high single-match variance; any of the three outcomes remains plausible.',
    conclusion: `Probabilities: Home ${probabilities.home}%, Draw ${probabilities.draw}%, Away ${probabilities.away}%.`,
    driversFor: [],
    counterfactual: { conditions: [], likelihood: 'unknown', whatToWatch: 'Fallback narrative — no counterfactual generated.' },
    decisionQuestion: 'What evidence would need to change for you to see this fixture differently?',
  };
}

module.exports = { generateBriefing };
