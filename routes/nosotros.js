const express = require('express');
const { verifyToken, requireBusiness } = require('../middleware/auth');
const { fetchNews } = require('../services/news');
const { generate } = require('../services/ai');
const { pool } = require('../db/database');
const router = express.Router();

router.use(verifyToken, requireBusiness('nosotros'));

router.post('/news', async (req, res) => {
  try {
    const { scope, query, category } = req.body;
    const news = await fetchNews(scope, query, category);
    res.json({ news });
  } catch (e) {
    console.error('Error /api/nosotros/news:', e.message);
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
