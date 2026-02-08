const express = require('express');
const { verifyToken, requireBusiness } = require('../middleware/auth');
const { fetchNews } = require('../services/news');
const { generate } = require('../services/ai');
const { pool } = require('../db/database');
const router = express.Router();

router.use(verifyToken, requireBusiness('nosotros'));

router.post('/news', async (req, res) => {
  try {
    const { scope, query, category, page = 1, pageSize = 8 } = req.body;
    const result = await fetchNews(scope, query, category);

    // Paginate results
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedArticles = result.articles.slice(start, end);

    res.json({
      news: paginatedArticles,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize)
      }
    });
  } catch (e) {
    console.error('Error /api/nosotros/news:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== NEWS VIA IA (fallback when API limit reached) ==========
router.post('/news-ai', async (req, res) => {
  try {
    const { scope, category, page = 1, pageSize = 8 } = req.body;
    const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const todayISO = new Date().toISOString();
    const scopeLabel = scope === 'intl' ? 'internacionales' : scope === 'both' ? 'internacionales y de Mexico' : 'de Mexico';
    const catLabel = category ? ` sobre ${category}` : '';
    const count = Math.max(pageSize * 3, 20); // Generate more articles to support pagination

    const prompt = `Hoy es ${today}. Genera ${count} noticias REALES y ACTUALES ${scopeLabel}${catLabel} que esten ocurriendo hoy o esta semana.

IMPORTANTE: Las noticias deben ser REALES, verificables, de hechos que realmente estan pasando en el mundo. No inventes noticias.

Responde UNICAMENTE con JSON valido, sin texto antes ni despues:
{"news":[{"id":1,"title":"Titulo de la noticia","summary":"Resumen en 1-2 oraciones con datos concretos","source":"Medio que la reporta"}]}

Incluye variedad de temas${category ? '' : ': politica, economia, tecnologia, sociedad'}. Fuentes reales como Reuters, AP, EFE, El Universal, Milenio, etc.`;

    const txt = await generate(prompt, 'Eres un curador de noticias. Solo reportas hechos reales y verificables. Nunca inventas noticias. Tu conocimiento llega hasta hoy.');
    // Parse JSON from response
    const start = txt.indexOf('{');
    const end = txt.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('IA no devolvio formato valido');
    // Clean control characters that break JSON.parse
    const raw = txt.substring(start, end + 1).replace(/[\x00-\x1F\x7F]/g, m => m === '\n' || m === '\r' || m === '\t' ? m : '');
    const parsed = JSON.parse(raw);
    if (!parsed.news || !Array.isArray(parsed.news)) throw new Error('IA no devolvio noticias');

    // Add today's date to all AI-generated news and paginate
    const allNews = parsed.news.map((n, i) => ({
      id: i + 1,
      title: n.title,
      summary: n.summary,
      source: (n.source || 'IA') + ' (via IA)',
      date: todayISO
    }));

    const paginatedStart = (page - 1) * pageSize;
    const paginatedEnd = paginatedStart + pageSize;
    const paginatedNews = allNews.slice(paginatedStart, paginatedEnd);

    res.json({
      news: paginatedNews,
      pagination: {
        page,
        pageSize,
        total: allNews.length,
        totalPages: Math.ceil(allNews.length / pageSize)
      }
    });
  } catch (e) {
    console.error('Error /api/nosotros/news-ai:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const { prompt, system, format_type, input_data } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Se requiere prompt' });
    const result = await generate(prompt, system);

    // Guardar en historial
    if (format_type) {
      await pool.query(
        'INSERT INTO content_history (user_id, business, format_type, input_data, output_text) VALUES ($1, $2, $3, $4, $5)',
        [req.user.id, 'nosotros', format_type, input_data ? JSON.stringify(input_data) : null, result]
      );
    }

    res.json({ result });
  } catch (e) {
    console.error('Error /api/nosotros/generate:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, format_type, status, scheduled_date, scheduled_platform, created_at, LEFT(output_text, 200) as preview FROM content_history WHERE user_id = $1 AND business = $2 ORDER BY created_at DESC LIMIT 50',
      [req.user.id, 'nosotros']
    );
    res.json({ history: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/history/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM content_history WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ item: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/history/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM content_history WHERE id = $1 AND user_id = $2 AND business = $3', [req.params.id, req.user.id, 'nosotros']);
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
      [ids, req.user.id, 'nosotros']
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
