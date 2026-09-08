const { emptyCapabilities } = require('./types');
const capabilities = { ...emptyCapabilities(), fixtures: true };
async function fetchEvents() {
  return { provider: 'balldontlie', ok: false, reason: 'not_wired_yet', events: [] };
}
module.exports = { name: 'balldontlie', capabilities, fetchEvents };
