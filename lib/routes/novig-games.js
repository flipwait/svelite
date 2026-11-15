/**
 * GET /api/novig-games
 * Query: league, marketType, mode, keyId, pem (or use env NOVIG_KEY_ID / NOVIG_PEM / NOVIG_ENV)
 * Prefer server env vars; client may pass keys for personal deploy only (logged carefully).
 */
const { listNovigGames } = require('../novig');
const { buildSignal } = require('../score');

function rankOptsFromQuery(q, venue) {
  const o = { venue: venue || '', book: venue || '' };
  if (q.goodEdgePp != null && q.goodEdgePp !== '') o.goodEdgePp = Number(q.goodEdgePp);
  if (q.eliteEdgePp != null && q.eliteEdgePp !== '') o.eliteEdgePp = Number(q.eliteEdgePp);
  if (q.goodEv != null && q.goodEv !== '') o.goodEv = Number(q.goodEv);
  if (q.eliteEv != null && q.eliteEv !== '') o.eliteEv = Number(q.eliteEv);
  if (q.strict != null) o.strictTruth = q.strict !== '0';
  if (q.allowMarketGood != null) o.allowMarketGood = q.allowMarketGood === '1';
  return o;
}


function pickKeys(req) {
  const q = req.query || {};
  const keyId = q.keyId || q.novigKeyId || process.env.NOVIG_KEY_ID || '';
  const pem = q.pem || q.novigPem || process.env.NOVIG_PEM || '';
  const env = q.env || q.novigEnv || process.env.NOVIG_ENV || 'paper';
  return { keyId: String(keyId).trim(), pem: String(pem).trim(), env: String(env).trim() };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const q = req.query || {};
    const league = String(q.league || q.sport || 'all').toLowerCase();
    const marketType = String(q.marketType || 'all').toLowerCase();
    const mode = String(q.mode || 'all').toLowerCase();
    const { keyId, pem, env } = pickKeys(req);

    if (!keyId || !pem) {
      return res.status(200).json({
        ok: false,
        source: 'novig',
        error: 'missing_keys',
        hint: 'Add Novig Key ID + private key PEM in Settings (or Vercel env NOVIG_KEY_ID / NOVIG_PEM). Start on Paper: paper.novig.com → Profile → Novig API.',
        games: [],
        summary: { total: 0, elite: 0, good: 0, live: 0, upcoming: 0 },
      });
    }

    const listed = await listNovigGames({
      keyId,
      pem,
      env,
      league: league === 'all' ? null : league,
      // Single sport: deeper catalog for pregame + live edge hunting
      limit: league === 'all' ? 100 : 160,
    });
    const raw = listed.games || [];
    const host = listed.host;
    const count = listed.count;
    const catalogMeta = listed.catalogMeta || null;

    let games = raw.map((g) => {
      try {
        const yes = g.yesPrice != null ? Number(g.yesPrice) : (g.yes != null ? Number(g.yes) : null);
        const no = g.noPrice != null ? Number(g.noPrice) : (g.no != null ? Number(g.no) : null);
        const yesU = yes != null && yes > 1.5 ? yes / 100 : yes;
        const noU = no != null && no > 1.5 ? no / 100 : no;
        const scored = buildSignal({
          id: g.id || g.marketId,
          question: g.title || g.eventTitle,
          title: g.title || g.eventTitle,
          eventTitle: g.eventTitle || g.title,
          yesPrice: yesU,
          noPrice: noU,
          volume: g.volume || 0,
          liquidity: g.liquidity || 0,
          league: g.league,
          marketType: g.marketType || 'moneyline',
          line: g.line,
          spreadLine: g.spreadLine,
          totalLine: g.totalLine,
          live: !!g.live,
          venue: 'novig',
          formQuality: (scored && scored.formQuality) || g.formQuality || null,
          formNote: (scored && scored.formNote) || g.formNote || null,
          source: 'novig',
          url: g.url || g.marketUrl,
          startTime: g.startTime,
          home: g.home,
          away: g.away,
        }, Object.assign(rankOptsFromQuery(q, 'novig'), { strictTruth: false, allowMarketGood: true }));
        return Object.assign({}, g, scored || {}, {
          venue: 'novig',
          source: 'novig',
          eventTitle: g.eventTitle || scored.eventTitle,
          startTime: g.startTime || scored.startTime,
        });
      } catch (_) {
        return Object.assign({}, g, { rank: g.rank || 'Pass', venue: 'novig' });
      }
    });

    // ESPN team names + form (async, soonest games, higher quota for single sport)
    try {
      const { matchupForEvent } = require('../espn');
      const formLimit = league === 'all' ? 10 : 18;
      const seenTitles = new Set();
      const formJobs = [];
      const sorted = games.slice().sort((a, b) => {
        const ta = new Date(a.startTime || 0).getTime() || 0;
        const tb = new Date(b.startTime || 0).getTime() || 0;
        return ta - tb;
      });
      for (const g of sorted) {
        const title = g.eventTitle || g.title || '';
        if (!title || seenTitles.has(title)) continue;
        seenTitles.add(title);
        formJobs.push(g);
        if (formJobs.length >= formLimit) break;
      }
      const formByTitle = {};
      await Promise.all(
        formJobs.map(async (g) => {
          try {
            const mu = await matchupForEvent(g.league || 'nfl', g.eventTitle || g.title || '');
            if (mu) formByTitle[g.eventTitle || g.title] = mu;
          } catch (_) {}
        })
      );
      games = games.map((g) => {
        try {
          const mu = formByTitle[g.eventTitle || g.title];
          if (!mu) return g;
          if (mu.home) g.home = mu.home;
          if (mu.away) g.away = mu.away;
          if (mu.home && mu.away) {
            g.eventTitle = mu.away + ' @ ' + mu.home;
            g.title = g.eventTitle + (g.marketType && g.marketType !== 'moneyline' ? ' · ' + g.marketType : '');
          }
          if (mu.startTime && !g.startTime) g.startTime = mu.startTime;
          if (mu.formHint) g.formNote = mu.formHint;
          if (mu.homeL10 || mu.awayL10) {
            g.homeL10 = mu.homeL10;
            g.awayL10 = mu.awayL10;
            g.hasForm = true;
          }
          g.espnMatched = true;
          // Refresh live from start if still open
          if (g.startTime && !g.ended) {
            const t = new Date(g.startTime).getTime();
            const now = Date.now();
            if (Number.isFinite(t) && now >= t - 2 * 60000 && now <= t + 5 * 3600000) g.live = true;
          }
        } catch (_) {}
        return g;
      });
      // Re-score after form attach with matchup + tunable gates
      const rOpts = rankOptsFromQuery(q, 'novig');
      games = games.map((g) => {
        try {
          const yes = g.yesPrice != null ? Number(g.yesPrice) : null;
          const no = g.noPrice != null ? Number(g.noPrice) : null;
          const yesU = yes != null && yes > 1.5 ? yes / 100 : yes;
          const noU = no != null && no > 1.5 ? no / 100 : no;
          const matchup = {
            hasForm: !!g.hasForm,
            homeL10: g.homeL10,
            awayL10: g.awayL10,
            detail: g.formNote || null,
            home: g.home,
            away: g.away,
          };
          const scored = buildSignal({
            id: g.id,
            question: g.title || g.eventTitle,
            title: g.title || g.eventTitle,
            eventTitle: g.eventTitle || g.title,
            yesPrice: yesU,
            noPrice: noU,
            volume: g.volume || 0,
            league: g.league,
            marketType: g.marketType || 'moneyline',
            line: g.line,
            spreadLine: g.spreadLine,
            totalLine: g.totalLine,
            live: !!g.live,
            venue: 'novig',
            source: 'novig',
            matchup: g.hasForm ? matchup : null,
            hasForm: !!g.hasForm,
            home: g.home,
            away: g.away,
            startTime: g.startTime,
            url: g.url,
          }, rOpts);
          return Object.assign({}, g, scored || {}, { venue: 'novig', source: 'novig', hasForm: g.hasForm || scored.hasForm });
        } catch (_) { return g; }
      });
    } catch (eEspn) { /* ESPN optional */ }

    if (marketType && marketType !== 'all') {
      games = games.filter((g) => {
        const mt = String(g.marketType || '').toLowerCase();
        if (marketType === 'moneyline' || marketType === 'ml') return mt === 'moneyline' || mt === 'ml';
        if (marketType === 'spread' || marketType === 'spreads') return mt.indexOf('spread') >= 0;
        if (marketType === 'total' || marketType === 'totals' || marketType === 'ou') {
          return mt === 'total' || mt.indexOf('total') >= 0;
        }
        if (marketType === 'team_total') return mt === 'team_total';
        if (marketType.indexOf('player') >= 0) return mt.indexOf('player') >= 0 || mt.indexOf('prop') >= 0;
        return mt === marketType || mt.indexOf(marketType) >= 0;
      });
    }

    // Mode: pregame / live / both (edge hunting)
    if (mode === 'upcoming' || mode === 'pregame') {
      games = games.filter((g) => !g.live && !g.ended);
    } else if (mode === 'live') {
      games = games.filter((g) => g.live && !g.ended);
    }

    // Rank filter soft
    // Novig often has no form yet → ranks are Pass. Keep board visible unless elite-only requested.
    const rankF = String(q.rank || 'all').toLowerCase();
    if (rankF === 'elite' || rankF === 'elite_only') {
      const elite = games.filter((g) => /elite|potd|super/i.test(String(g.rank || '')));
      if (elite.length) games = elite;
    } else if (rankF === 'good' || rankF === 'good+elite' || rankF === 'goodelite') {
      const good = games.filter((g) => /good|elite|potd|super/i.test(String(g.rank || '')));
      // Only apply if we still have rows; else keep all so sport isn't blank
      if (good.length) games = good;
    }

    // Single sport: allow larger board for edge hunting
    const maxOut = league === 'all' ? 100 : 180;
    games = games.slice(0, maxOut);
    const fetchedAt = new Date().toISOString();
    games.forEach((g) => {
      g.fetchedAt = g.fetchedAt || fetchedAt;
      g.priceAt = g.priceAt || fetchedAt;
      g.venue = 'novig';
    });
    // Sort live first then start time
    games.sort((a, b) => {
      if (!!a.live !== !!b.live) return a.live ? -1 : 1;
      return new Date(a.startTime || 0) - new Date(b.startTime || 0);
    });

    return res.status(200).json({
      ok: true,
      source: 'novig',
      host,
      env,
      league,
      marketType,
      mode,
      catalogCount: count,
      catalogMeta: catalogMeta || null,
      fetchAttempt: listed.attempt || null,
      hint: raw.length ? undefined : 'Catalog empty for this env. Confirm Production keys, or try Paper. Rank filters may hide Pass lines — use All ranks / QC mode.',
      updatedAt: fetchedAt,
      summary: {
        total: games.length,
        live: games.filter((g) => g.live).length,
        upcoming: games.filter((g) => !g.live && !g.ended).length,
        elite: games.filter((g) => String(g.rank || '').toLowerCase() === 'elite').length,
        good: games.filter((g) => String(g.rank || '').toLowerCase() === 'good').length,
      },
      games,
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      source: 'novig',
      error: e.message || String(e),
      code: e.code || null,
      status: e.status || null,
      hint:
        e.code === 'NO_KEYS'
          ? 'Save Novig keys in Settings. Paper keys from paper.novig.com work for testing.'
          : 'Check key ID, PEM format, and Paper vs Production env. Signature scheme must match docs.novig.com.',
      games: [],
      summary: { total: 0, elite: 0, good: 0, live: 0, upcoming: 0 },
    });
  }
};
