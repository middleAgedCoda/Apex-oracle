function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonPmf(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

const MAX_GOALS = 10;

function computeProbabilities(lambdaHome, lambdaAway) {
  let home = 0, draw = 0, away = 0, over25 = 0, btts = 0;

  for (let h = 0; h <= MAX_GOALS; h++) {
    const pHome = poissonPmf(h, lambdaHome);
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = pHome * poissonPmf(a, lambdaAway);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
      if (h + a > 2) over25 += p;
      if (h >= 1 && a >= 1) btts += p;
    }
  }

  const pct = (x) => Math.round(x * 10000) / 100;
  return {
    home: pct(home), draw: pct(draw), away: pct(away),
    over25: pct(over25), under25: pct(1 - over25),
    btts: pct(btts), bttsNo: pct(1 - btts),
  };
}

module.exports = { computeProbabilities, poissonPmf };
