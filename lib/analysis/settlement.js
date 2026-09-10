function marketHit(actualScore, market) {
  const { home, away } = actualScore;
  switch ((market || '').toLowerCase()) {
    case 'home': return home > away;
    case 'draw': return home === away;
    case 'away': return away > home;
    case 'over25': return (home + away) > 2;
    case 'under25': return (home + away) <= 2;
    case 'btts': return home >= 1 && away >= 1;
    case 'bttsno': return !(home >= 1 && away >= 1);
    default: return null;
  }
}

module.exports = { marketHit };
