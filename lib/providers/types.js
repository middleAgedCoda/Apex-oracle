// Shared shape for every provider adapter — no build step needed, plain JS + comments.
function emptyCapabilities() {
  return {
    fixtures: false, teams: false, standings: false, statistics: false,
    liveState: false, events: false, xg: false, injuries: false, lineups: false,
  };
}
module.exports = { emptyCapabilities };
