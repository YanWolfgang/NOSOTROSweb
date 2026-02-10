const express = require('express');
const { verifyToken, requireBusiness, requirePermission } = require('../middleware/auth');
const { fetchGoogleNewsRss } = require('../services/googleNewsRss');
const { generate } = require('../services/ai');
const { pool } = require('../db/database');
const router = express.Router();

router.use(verifyToken, requireBusiness('nosotros'));

// ========== NEWS VIA GOOGLE NEWS RSS ==========
router.post('/news', requirePermission('nosotros', 'ver'), async (req, res) => {
  try {
    const { scope, category, page = 1, pageSize = 8 } = req.body;

    // Fetch from Google News RSS
    const articles = await fetchGoogleNewsRss(scope, category);

    // Paginate
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedNews = articles.slice(start, end);

    res.json({
      news: paginatedNews.map((a, i) => ({
        id: start + i + 1,
        title: a.title,
        summary: a.summary,
        source: a.source,
        date: a.date
      })),
      pagination: {
        page,
        pageSize,
        total: articles.length,
        totalPages: Math.ceil(articles.length / pageSize)
      }
    });
  } catch (e) {
    console.error('Error /api/nosotros/news:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== NEWS VIA IA (now also uses Google News RSS) ==========
router.post('/news-ai', requirePermission('nosotros', 'ver'), async (req, res) => {
  try {
    const { scope, category, page = 1, pageSize = 8 } = req.body;

    // Same as /news - both use Google News RSS
    const articles = await fetchGoogleNewsRss(scope, category);

    // Paginate
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedNews = articles.slice(start, end);

    res.json({
      news: paginatedNews.map((a, i) => ({
        id: start + i + 1,
        title: a.title,
        summary: a.summary,
        source: a.source,
        date: a.date
      })),
      pagination: {
        page,
        pageSize,
        total: articles.length,
        totalPages: Math.ceil(articles.length / pageSize)
      }
    });
  } catch (e) {
    console.error('Error /api/nosotros/news-ai:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/generate', requirePermission('nosotros', 'crear'), async (req, res) => {
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

router.get('/history', requirePermission('nosotros', 'ver'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(10000, Math.max(1, parseInt(req.query.pageSize) || 10));
    const filterUser = req.query.user_id || null;
    const offset = (page - 1) * pageSize;

    let where = 'ch.business = $1';
    const params = ['nosotros'];
    let idx = 2;
    if (filterUser) { where += ` AND ch.user_id = $${idx++}`; params.push(filterUser); }

    const countRes = await pool.query(`SELECT COUNT(*)::int as total FROM content_history ch WHERE ${where}`, params);
    const total = countRes.rows[0].total;

    params.push(pageSize, offset);
    const { rows } = await pool.query(
      `SELECT ch.id, ch.format_type, ch.status, ch.scheduled_date, ch.scheduled_platform, ch.created_at,
              LEFT(ch.output_text, 200) as preview, u.name as user_name, ch.user_id
       FROM content_history ch LEFT JOIN users u ON ch.user_id = u.id
       WHERE ${where} ORDER BY ch.created_at DESC LIMIT $${idx++} OFFSET $${idx}`, params
    );

    const usersRes = await pool.query(
      `SELECT DISTINCT u.id, u.name FROM content_history ch JOIN users u ON ch.user_id = u.id WHERE ch.business = 'nosotros' ORDER BY u.name`
    );

    res.json({ history: rows, users: usersRes.rows, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/history/:id', requirePermission('nosotros', 'ver'), async (req, res) => {
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

router.delete('/history/:id', requirePermission('nosotros', 'editar'), async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const q = isAdmin
      ? 'DELETE FROM content_history WHERE id = $1 AND business = $2'
      : 'DELETE FROM content_history WHERE id = $1 AND user_id = $2 AND business = $3';
    const p = isAdmin ? [req.params.id, 'nosotros'] : [req.params.id, req.user.id, 'nosotros'];
    const { rowCount } = await pool.query(q, p);
    if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/history/bulk-delete', requirePermission('nosotros', 'editar'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Se requiere array de ids' });
    const isAdmin = req.user.role === 'admin';
    const q = isAdmin
      ? 'DELETE FROM content_history WHERE id = ANY($1::int[]) AND business = $2'
      : 'DELETE FROM content_history WHERE id = ANY($1::int[]) AND user_id = $2 AND business = $3';
    const p = isAdmin ? [ids, 'nosotros'] : [ids, req.user.id, 'nosotros'];
    const { rowCount } = await pool.query(q, p);
    res.json({ ok: true, deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
