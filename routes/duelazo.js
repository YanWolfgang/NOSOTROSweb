const express = require('express');
const { verifyToken, requireBusiness } = require('../middleware/auth');
const { generate } = require('../services/ai');
const { pool } = require('../db/database');
const router = express.Router();

router.use(verifyToken, requireBusiness('duelazo'));

const SPORTS_KEY = process.env.API_SPORTS_KEY;
const NEWS_KEY = process.env.NEWSAPI_KEY;
const DUELAZO_SYS = 'Eres el equipo de contenido de DUELAZO, una casa de apuestas deportivas mexicana. Tono deportivo profesional pero accesible. Usa datos reales y momios cuando estén disponibles. Genera hype y emoción sin ser irresponsable. Siempre incluye CTA hacia la plataforma de Duelazo. Contenido para IG, TikTok, Twitter/X y Facebook.';
const API_HEADERS = { 'x-apisports-key': SPORTS_KEY };

const SPORT_CFG = {
  football: {
    base: 'https://v3.football.api-sports.io',
    fixtures: '/fixtures',
    odds: '/odds',
    parse(resp) {
      return (resp || []).map(f => ({
        id: f.fixture.id, date: f.fixture.date,
        status: f.fixture.status.short, statusLong: f.fixture.status.long,
        home: { name: f.teams.home.name, logo: f.teams.home.logo, goals: f.goals.home },
        away: { name: f.teams.away.name, logo: f.teams.away.logo, goals: f.goals.away },
        league: { id: f.league.id, name: f.league.name, logo: f.league.logo, country: f.league.country }
      }));
    }
  },
  basketball: {
    base: 'https://v1.basketball.api-sports.io',
    fixtures: '/games',
    odds: '/odds',
    parse(resp) {
      return (resp || []).map(g => ({
        id: g.id, date: g.date,
        status: g.status?.short || '', statusLong: g.status?.long || g.status?.short || '',
        home: { name: g.teams?.home?.name, logo: g.teams?.home?.logo, goals: g.scores?.home?.total },
        away: { name: g.teams?.away?.name, logo: g.teams?.away?.logo, goals: g.scores?.away?.total },
        league: { id: g.league?.id, name: g.league?.name, logo: g.league?.logo, country: g.country?.name || '' }
      }));
    }
  },
  'american-football': {
    base: 'https://v1.american-football.api-sports.io',
    fixtures: '/games',
    odds: '/odds',
    parse(resp) {
      return (resp || []).map(g => ({
        id: g.game?.id, date: g.game?.date?.date || g.game?.date,
        status: g.game?.status?.short || '', statusLong: g.game?.status?.long || '',
        home: { name: g.teams?.home?.name, logo: g.teams?.home?.logo, goals: g.scores?.home?.total },
        away: { name: g.teams?.away?.name, logo: g.teams?.away?.logo, goals: g.scores?.away?.total },
        league: { id: g.league?.id, name: g.league?.name, logo: g.league?.logo, country: g.league?.country?.name || '' }
      }));
    }
  },
  baseball: {
    base: 'https://v1.baseball.api-sports.io',
    fixtures: '/games',
    odds: '/odds',
    parse(resp) {
      return (resp || []).map(g => ({
        id: g.id, date: g.date,
        status: g.status?.short || '', statusLong: g.status?.long || '',
        home: { name: g.teams?.home?.name, logo: g.teams?.home?.logo, goals: g.scores?.home?.total },
        away: { name: g.teams?.away?.name, logo: g.teams?.away?.logo, goals: g.scores?.away?.total },
        league: { id: g.league?.id, name: g.league?.name, logo: g.league?.logo, country: g.country?.name || '' }
      }));
    }
  },
  mma: {
    base: 'https://v1.mma.api-sports.io',
    fixtures: '/fights',
    odds: null,
    parse(resp) {
      return (resp || []).map(f => ({
        id: f.id, date: f.date,
        status: f.status?.short || '', statusLong: f.status?.long || '',
        home: { name: f.fighters?.first?.name, logo: f.fighters?.first?.logo || '', goals: f.fighters?.first?.won ? 'W' : null },
        away: { name: f.fighters?.second?.name, logo: f.fighters?.second?.logo || '', goals: f.fighters?.second?.won ? 'W' : null },
        league: { id: f.league?.id, name: f.league?.name, logo: f.league?.logo || '', country: '' }
      }));
    }
  },
  'formula-1': {
    base: 'https://v1.formula-1.api-sports.io',
    fixtures: '/races',
    odds: null,
    parse(resp) {
      return (resp || []).map(r => ({
        id: r.id, date: r.date,
        status: r.status || '', statusLong: r.status || '',
        home: { name: r.competition?.name || r.type || 'Race', logo: r.competition?.logo || '', goals: null },
        away: { name: r.circuit?.name || '', logo: r.circuit?.image || '', goals: null },
        league: { id: r.season, name: 'Formula 1', logo: '', country: r.competition?.location?.country || '' }
      }));
    }
  }
};

// Noticias deportivas
router.post('/news', async (req, res) => {
  try {
    const r = await fetch(`https://newsapi.org/v2/everything?q=fútbol OR deportes OR liga mx OR NBA OR NFL&language=es&sortBy=publishedAt&pageSize=15&apiKey=${NEWS_KEY}`);
    const d = await r.json();
    const news = (d.articles || [])
      .filter(a => a.title && a.title !== '[Removed]' && a.description && a.description !== '[Removed]')
      .slice(0, 8)
      .map((a, i) => ({
        id: i + 1,
        title: (a.title || '').replace(/\s*-\s*[^-]*$/, ''),
        summary: (a.description || '').slice(0, 200),
        source: a.source?.name || 'Fuente desconocida'
      }));
    res.json({ news });
  } catch (e) {
    console.error('Error duelazo/news:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Partidos multi-deporte
router.get('/fixtures', async (req, res) => {
  try {
    const { sport, date, league, status } = req.query;
    const cfg = SPORT_CFG[sport] || SPORT_CFG.football;
    const d = date || new Date().toISOString().slice(0, 10);
    let url = `${cfg.base}${cfg.fixtures}?date=${d}&timezone=America/Mexico_City`;
    if (league) url += `&league=${league}`;
    if (status) url += `&status=${status}`;
    const r = await fetch(url, { headers: API_HEADERS });
    const data = await r.json();
    const fixtures = cfg.parse(data.response);
    res.json({ fixtures, sport: sport || 'football' });
  } catch (e) {
    console.error('Error duelazo/fixtures:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Momios multi-deporte
router.get('/odds/:fixtureId', async (req, res) => {
  try {
    const sport = req.query.sport || 'football';
    const cfg = SPORT_CFG[sport] || SPORT_CFG.football;
    if (!cfg.odds) return res.json({ odds: [] });
    const r = await fetch(`${cfg.base}${cfg.odds}?${sport === 'football' ? 'fixture' : 'game'}=${req.params.fixtureId}`, {
      headers: API_HEADERS
    });
    const data = await r.json();
    const odds = (data.response || []).slice(0, 1).flatMap(o =>
      (o.bookmakers || []).slice(0, 3).map(bk => ({
        bookmaker: bk.name,
        bets: (bk.bets || []).slice(0, 5).map(b => ({
          name: b.name,
          values: b.values.map(v => ({ value: v.value, odd: v.odd }))
        }))
      }))
    );
    res.json({ odds });
  } catch (e) {
    console.error('Error duelazo/odds:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Tabla de posiciones
router.get('/standings', async (req, res) => {
  try {
    const { league, season } = req.query;
    if (!league || !season) return res.status(400).json({ error: 'league y season requeridos' });
    const r = await fetch(`https://v3.football.api-sports.io/standings?league=${league}&season=${season}`, {
      headers: { 'x-apisports-key': SPORTS_KEY }
    });
    const data = await r.json();
    const standings = (data.response || []).flatMap(l =>
      (l.league?.standings || []).flat().map(t => ({
        rank: t.rank, team: t.team.name, logo: t.team.logo,
        points: t.points, played: t.all.played,
        win: t.all.win, draw: t.all.draw, lose: t.all.lose,
        goalsFor: t.all.goals.for, goalsAgainst: t.all.goals.against
      }))
    );
    res.json({ standings });
  } catch (e) {
    console.error('Error duelazo/standings:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Generar contenido deportivo
router.post('/generate', async (req, res) => {
  try {
    const { prompt, format_type, input_data } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Se requiere prompt' });
    const result = await generate(prompt, DUELAZO_SYS);
    if (format_type) {
      await pool.query(
        'INSERT INTO content_history (user_id, business, format_type, input_data, output_text) VALUES ($1, $2, $3, $4, $5)',
        [req.user.id, 'duelazo', format_type, input_data ? JSON.stringify(input_data) : null, result]
      );
    }
    res.json({ result });
  } catch (e) {
    console.error('Error duelazo/generate:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Historial
router.get('/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, format_type, status, created_at, LEFT(output_text, 200) as preview FROM content_history WHERE user_id = $1 AND business = $2 ORDER BY created_at DESC LIMIT 50',
      [req.user.id, 'duelazo']
    );
    res.json({ history: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/history/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM content_history WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ item: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/history/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM content_history WHERE id = $1 AND user_id = $2 AND business = $3', [req.params.id, req.user.id, 'duelazo']);
    if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/history/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Se requiere array de ids' });
    const { rowCount } = await pool.query(
      'DELETE FROM content_history WHERE id = ANY($1::int[]) AND user_id = $2 AND business = $3',
      [ids, req.user.id, 'duelazo']
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
