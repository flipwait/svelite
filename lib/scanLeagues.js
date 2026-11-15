/**
 * Single source of truth for "All sports" scans across venues.
 * UI sport ids → what each venue expands to.
 */
const SCAN_LEAGUES = [
  'mlb', 'nfl', 'nba', 'nhl', 'cfb', 'cbb', 'wnba',
  'ufc', 'atp', 'wta', 'soccer', 'esports',
];

/** Polymarket gateway league slugs (flat list used by fetchAllSportsEvents) */
const POLYMARKET_LEAGUES = [
  'nba', 'wnba', 'ufc', 'mlb', 'cfb', 'cbb', 'nfl', 'nhl',
  'epl', 'mls', 'lal', 'bun', 'sea', 'ucl', 'uefa', 'fwc',
  'atp', 'wta', 'lol', 'cs2', 'dota2', 'valorant', 'cod',
];

const POLY_ESPORTS = ['lol', 'cs2', 'dota2', 'valorant', 'cod'];
const POLY_SOCCER = ['epl', 'mls', 'lal', 'bun', 'sea', 'ucl', 'uefa', 'fwc', 'flc'];

/** Kalshi SERIES_BY_LEAGUE keys that exist and should run on All */
const KALSHI_SCAN_LEAGUES = [
  'mlb', 'nfl', 'nba', 'nhl', 'cfb', 'cbb', 'wnba',
  'ufc', 'atp', 'wta', 'esports',
];

/** Novig league query codes when scanning one sport; null/all = open catalog */
const NOVIG_LEAGUE_MAP = {
  nfl: 'NFL', nba: 'NBA', mlb: 'MLB', nhl: 'NHL',
  cfb: 'NCAAF', ncaaf: 'NCAAF', cbb: 'NCAAB', ncaab: 'NCAAB',
  wnba: 'WNBA', soccer: 'SOCCER', epl: 'EPL', ufc: 'UFC',
  atp: 'ATP', wta: 'WTA',
};

function isAllLeague(lg) {
  const s = String(lg || '').toLowerCase().trim();
  return !s || s === 'all';
}

module.exports = {
  SCAN_LEAGUES,
  POLYMARKET_LEAGUES,
  POLY_ESPORTS,
  POLY_SOCCER,
  KALSHI_SCAN_LEAGUES,
  NOVIG_LEAGUE_MAP,
  isAllLeague,
};
