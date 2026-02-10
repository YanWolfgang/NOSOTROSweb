const express = require('express');
const { verifyToken, requireBusiness, requirePermission } = require('../middleware/auth');
const { generate } = require('../services/ai');
const { pool } = require('../db/database');
const router = express.Router();

router.use(verifyToken, requireBusiness('spacebox'));

const SPACEBOX_SYS = 'Eres el equipo de marketing de SPACEBOX, empresa de renta de mini bodegas en México. Tono profesional y confiable. Público: personas y empresas que necesitan espacio extra de almacenamiento. Beneficios clave que siempre debes mencionar: seguridad 24/7 con cámaras, acceso con código personal a cualquier hora, diferentes tamaños de bodega, instalaciones limpias y secas, seguro incluido. Siempre incluir CTA para cotizar o rentar con referencia a "link en bio". Genera contenido para Instagram (feed, reels, stories). Usa emojis con moderación. Incluye hashtags relevantes.';

const FORMAT_PROMPTS = {
  video: `Genera un guión para reel de Instagram (30-60 seg) de SPACEBOX mini bodegas con este formato exacto:

HOOK (3 seg):
[texto del hook impactante]

DESARROLLO (20 seg):
[indicaciones visuales entre corchetes]
[texto de narración]

CTA (5 seg):
[indicación visual]
[texto CTA con referencia a link en bio]

COPY INSTAGRAM (500 chars max):
[copy con emojis moderados y CTA "link en bio"]

HASHTAGS:
[hashtags relevantes]`,

  carrusel: `Genera un carrusel informativo de Instagram (4-5 slides) de SPACEBOX mini bodegas con este formato exacto:

SLIDE 1 — Hook:
[título impactante]

SLIDE 2:
[título + texto informativo]

SLIDE 3:
[título + texto informativo]

SLIDE 4:
[título + texto informativo]

SLIDE 5 — CTA:
[CTA visual + texto con referencia a link en bio]

COPY INSTAGRAM:
[copy con CTA]

HASHTAGS:
[hashtags relevantes]`,

  promocional: `Genera un post promocional de Instagram para SPACEBOX mini bodegas con este formato exacto:

TEXTO PRINCIPAL (para diseño):
[texto grande/título de la promo]

TEXTO SECUNDARIO:
[detalles de la promoción/oferta]

COPY INSTAGRAM:
[copy con urgencia y CTA "link en bio"]

HASHTAGS:
[hashtags relevantes]`,

  estacional: `Genera un post estacional de Instagram para SPACEBOX mini bodegas con este formato exacto:

TEXTO PRINCIPAL:
[texto con referencia a la temporada actual]

COPY INSTAGRAM:
[copy estacional con CTA "link en bio"]

HASHTAGS:
[hashtags estacionales relevantes]`,

  confianza: `Genera un post de confianza/seguridad de Instagram para SPACEBOX mini bodegas con este formato exacto:

TEXTO PRINCIPAL:
[dato de seguridad/confianza impactante]

COPY INSTAGRAM:
[copy con bullets de beneficios (seguridad 24/7, cámaras, código personal, seguro incluido) + CTA "link en bio"]

HASHTAGS:
[hashtags relevantes]`
};

// ========== GENERATE ==========
router.post('/generate', requirePermission('spacebox', 'crear'), async (req, res) => {
  try {
    const { format, topic, context, previousContent, editInstructions } = req.body;
    if (!format && !previousContent) return res.status(400).json({ error: 'Se requiere formato o contenido previo' });

    let prompt;
    if (previousContent && editInstructions) {
      prompt = `Contenido original:\n${previousContent}\n\nEl usuario quiere estos cambios:\n${editInstructions}\n\nGenera una nueva versión aplicando SOLO los cambios solicitados. Mantén el mismo formato y estructura.`;
    } else {
      const base = FORMAT_PROMPTS[format] || FORMAT_PROMPTS.video;
      const topicStr = topic ? `\nTema/contexto: ${topic}` : '';
      const ctxStr = context ? `\nContexto adicional: ${context}` : '';
      prompt = `${base}${topicStr}${ctxStr}`;
    }

    const content = await generate(prompt, SPACEBOX_SYS);

    // Save to history
    const { rows } = await pool.query(
      'INSERT INTO content_history (user_id, business, format_type, input_data, output_text) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.user.id, 'spacebox', format || 'edit', JSON.stringify({ topic, context, editInstructions }), content]
    );

    res.json({ content, format, id: rows[0].id });
  } catch (e) {
    console.error('Error spacebox/generate:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== IDEAS ==========
router.get('/ideas', requirePermission('spacebox', 'ver'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ideas WHERE business = $1 ORDER BY created_at DESC LIMIT 100',
      ['spacebox']
    );
    res.json({ ideas: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ideas/generate', requirePermission('spacebox', 'crear'), async (req, res) => {
  try {
    // Get existing ideas from last 3 months to avoid repeats
    const { rows: existing } = await pool.query(
      "SELECT idea_text, format FROM ideas WHERE business = 'spacebox' AND created_at > NOW() - INTERVAL '3 months'"
    );
    const usedList = existing.map(i => `- ${i.idea_text} (${i.format})`).join('\n') || 'Ninguna';

    const now = new Date();
    const mes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][now.getMonth()];
    const año = now.getFullYear();

    const prompt = `Genera 4 ideas de contenido para Instagram de SPACEBOX (mini bodegas en México). Una idea por semana del mes. Cada idea debe ser diferente en formato y tema. Formatos disponibles: video (Video Promocional reel 30-60seg), carrusel (Carrusel Informativo 4-5 slides educativos), promocional (Post Promocional oferta/descuento), estacional (Post Estacional según temporada actual), confianza (Post de Confianza seguridad/testimonios). Estamos en ${mes} ${año}. NO repitas estos temas ya usados:\n${usedList}\n\nResponde SOLO con JSON válido:\n{"ideas":[{"idea":"descripción de la idea","format":"video|carrusel|promocional|estacional|confianza","season_relevance":"relevancia estacional si aplica o null"}]}`;

    const txt = await generate(prompt, SPACEBOX_SYS);
    // Parse JSON from response
    const start = txt.indexOf('{');
    const end = txt.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No se pudo parsear respuesta de ideas');
    const parsed = JSON.parse(txt.substring(start, end + 1));
    if (!parsed.ideas || !Array.isArray(parsed.ideas)) throw new Error('Formato de ideas inválido');

    const savedIdeas = [];
    for (const idea of parsed.ideas.slice(0, 4)) {
      const { rows } = await pool.query(
        'INSERT INTO ideas (business, idea_text, format, season_relevance) VALUES ($1, $2, $3, $4) RETURNING *',
        ['spacebox', idea.idea, idea.format, idea.season_relevance || null]
      );
      savedIdeas.push(rows[0]);
    }

    res.json({ ideas: savedIdeas });
  } catch (e) {
    console.error('Error spacebox/ideas/generate:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put('/ideas/:id', requirePermission('spacebox', 'editar'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['used', 'discarded'].includes(status)) return res.status(400).json({ error: 'Status debe ser used o discarded' });
    const extra = status === 'used' ? ', used_at = NOW()' : '';
    const { rows } = await pool.query(
      `UPDATE ideas SET status = $1${extra} WHERE id = $2 AND business = 'spacebox' RETURNING *`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Idea no encontrada' });
    res.json({ idea: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== HISTORY ==========
router.get('/history', requirePermission('spacebox', 'ver'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ch.id, ch.format_type, ch.status, ch.scheduled_date, ch.scheduled_platform, ch.notes, ch.created_at,
              LEFT(ch.output_text, 200) as preview, u.name as user_name
       FROM content_history ch LEFT JOIN users u ON ch.user_id = u.id
       WHERE ch.business = $1 ORDER BY ch.created_at DESC LIMIT 100`,
      ['spacebox']
    );
    res.json({ history: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/history/:id', requirePermission('spacebox', 'ver'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ch.*, u.name as user_name FROM content_history ch LEFT JOIN users u ON ch.user_id = u.id WHERE ch.id = $1 AND ch.business = 'spacebox'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ item: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/history/:id', requirePermission('spacebox', 'editar'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM content_history WHERE id = $1 AND user_id = $2 AND business = $3', [req.params.id, req.user.id, 'spacebox']);
    if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/history/bulk-delete', requirePermission('spacebox', 'editar'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Se requiere array de ids' });
    const { rowCount } = await pool.query(
      'DELETE FROM content_history WHERE id = ANY($1::int[]) AND user_id = $2 AND business = $3',
      [ids, req.user.id, 'spacebox']
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== CALENDAR ==========
router.get('/calendar', requirePermission('spacebox', 'ver'), async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start y end requeridos (YYYY-MM-DD)' });
    const { rows } = await pool.query(
      `SELECT id, format_type, status, scheduled_date, scheduled_platform, notes, LEFT(output_text, 100) as preview
       FROM content_history
       WHERE business = 'spacebox' AND status = 'approved' AND scheduled_date >= $1 AND scheduled_date <= $2
       ORDER BY scheduled_date ASC`,
      [start, end + ' 23:59:59']
    );
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== APPROVE ==========
router.post('/approve', requirePermission('spacebox', 'editar'), async (req, res) => {
  try {
    const { content_id, scheduled_date, scheduled_time, scheduled_platform, notes } = req.body;
    if (!content_id || !scheduled_date) return res.status(400).json({ error: 'content_id y scheduled_date requeridos' });
    const dt = scheduled_time ? `${scheduled_date} ${scheduled_time}` : scheduled_date;
    const { rows } = await pool.query(
      `UPDATE content_history SET status = 'approved', scheduled_date = $1, scheduled_platform = $2, notes = $3
       WHERE id = $4 AND business = 'spacebox' RETURNING *`,
      [dt, scheduled_platform || 'instagram', notes || null, content_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Contenido no encontrado' });
    res.json({ item: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
