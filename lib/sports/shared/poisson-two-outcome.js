function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function poissonPmf(k, lambda) { return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k); }

const MAX_RUNS = 20;

function computeProbabilities(lambdaHome, lambdaAway) {
  let home = 0, away = 0, tie = 0;
  for (let h = 0; h <= MAX_RUNS; h++) {
    const pHome = poissonPmf(h, lambdaHome);
    for (let a = 0; a <= MAX_RUNS; a++) {
      const p = pHome * poissonPmf(a, lambdaAway);
      if (h > a) home += p;
      else if (h < a) away += p;
      else tie += p;
    }
  }
  // Baseball always resolves (extra innings) — redistribute the small
  // modeled tie probability rather than pretend ties are a real outcome.
  home += tie * (home / (home + away));
  away += tie * (away / (home + away));
  const pct = (x) => Math.round(x * 10000) / 100;
  return { home: pct(home), away: pct(away) };
}

module.exports = { computeProbabilities };
