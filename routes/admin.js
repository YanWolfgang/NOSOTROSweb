const express = require('express');
const { pool } = require('../db/database');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get('/users', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email, role, businesses, permissions, status, created_at FROM users ORDER BY created_at DESC');
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { status, businesses, role, permissions } = req.body;
    const sets = [], vals = [];
    let idx = 1;
    if (status) { sets.push(`status = $${idx++}`); vals.push(status); }
    if (businesses) { sets.push(`businesses = $${idx++}`); vals.push(JSON.stringify(businesses)); }
    if (role) { sets.push(`role = $${idx++}`); vals.push(role); }
    if (permissions) {
      sets.push(`permissions = $${idx++}`); vals.push(JSON.stringify(permissions));
      // Auto-sync businesses from permissions keys
      const derivedBiz = Object.keys(permissions).filter(k => permissions[k] && permissions[k].length > 0);
      sets.push(`businesses = $${idx++}`); vals.push(JSON.stringify(derivedBiz));
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, name, email, role, businesses, permissions, status`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Usuario eliminado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== INTELLIGENCE ENDPOINTS ==========

function weekStart() {
  const d = new Date(); d.setHours(0,0,0,0);
  const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff); return d.toISOString();
}

function prevWeekStart() {
  const d = new Date(weekStart());
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

// GET /api/admin/team-stats
router.get('/team-stats', async (req, res) => {
  try {
    const ws = weekStart();
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.role, u.businesses,
              COUNT(ch.id)::int as generated,
              COUNT(CASE WHEN ch.status='approved' THEN 1 END)::int as approved,
              COUNT(CASE WHEN ch.status='draft' THEN 1 END)::int as drafts,
              MAX(ch.created_at) as last_activity,
              COALESCE(
                (SELECT json_agg(DISTINCT ch2.business) FROM content_history ch2 WHERE ch2.user_id = u.id AND ch2.created_at >= $1),
                '[]'
              ) as active_businesses,
              COALESCE(
                (SELECT json_object_agg(ch3.business, ch3.cnt) FROM (
                  SELECT business, COUNT(*)::int as cnt FROM content_history WHERE user_id = u.id AND created_at >= $1 GROUP BY business
                ) ch3),
                '{}'
              ) as by_business
       FROM users u
       LEFT JOIN content_history ch ON u.id = ch.user_id AND ch.created_at >= $1
       WHERE u.status = 'active'
       GROUP BY u.id
       ORDER BY COUNT(ch.id) DESC`, [ws]
    );
    res.json({ team: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/business-stats
router.get('/business-stats', async (req, res) => {
  try {
    const ws = weekStart();
    const pws = prevWeekStart();

    const thisWeek = await pool.query(
      `SELECT business, COUNT(*)::int as total,
              COUNT(CASE WHEN status='approved' THEN 1 END)::int as approved,
              COUNT(CASE WHEN status='draft' THEN 1 END)::int as drafts
       FROM content_history WHERE created_at >= $1 GROUP BY business`, [ws]
    );

    const lastWeek = await pool.query(
      `SELECT COUNT(*)::int as total FROM content_history WHERE created_at >= $1 AND created_at < $2`, [pws, ws]
    );

    const pendingApproval = await pool.query(
      `SELECT business, COUNT(*)::int as count FROM content_history WHERE status='draft' GROUP BY business`
    );

    const totalThisWeek = thisWeek.rows.reduce((s, r) => s + r.total, 0);
    const totalLastWeek = lastWeek.rows[0]?.total || 0;
    const weekChange = totalLastWeek > 0 ? Math.round(((totalThisWeek - totalLastWeek) / totalLastWeek) * 100) : 0;

    res.json({
      businesses: thisWeek.rows,
      totalThisWeek,
      totalLastWeek,
      weekChange,
      pendingApproval: pendingApproval.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/upcoming-content
router.get('/upcoming-content', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT business, format_type, scheduled_date, scheduled_platform,
              LEFT(output_text, 80) as preview
       FROM content_history
       WHERE status='approved' AND scheduled_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
       ORDER BY scheduled_date`
    );
    res.json({ items: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/format-usage
router.get('/format-usage', async (req, res) => {
  try {
    const ws = weekStart();
    const { rows } = await pool.query(
      `SELECT business, format_type, COUNT(*)::int as times_used
       FROM content_history WHERE created_at >= $1
       GROUP BY business, format_type ORDER BY business, times_used DESC`, [ws]
    );

    // All known formats per business
    const allFormats = {
      nosotros: ['nota_periodistica','opinion','entrevista','reportaje','cronica','resena','perfil','fact_check'],
      duelazo: ['prediccion','analisis','apuesta_valor','parlay','preview','cronica_vivo','datos','opinion'],
      spacebox: ['video','carrusel','promocional','estacional','confianza'],
      styly: ['reel_educativo','carrusel_valor','caso_exito','post_feature','inspiracional','reclutamiento','exito_afiliadas','capacitacion']
    };

    const usage = {};
    for (const biz of Object.keys(allFormats)) {
      const used = rows.filter(r => r.business === biz);
      const usedFormats = used.map(r => r.format_type);
      usage[biz] = {
        used: used,
        unused: allFormats[biz].filter(f => !usedFormats.includes(f))
      };
    }

    res.json({ usage });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/trends
router.get('/trends', async (req, res) => {
  try {
    const trends = [];
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dayOfWeek = now.getDay();

    // Duelazo: check fixtures today
    try {
      const SPORTS_KEY = process.env.API_SPORTS_KEY;
      if (SPORTS_KEY) {
        const today = now.toISOString().slice(0, 10);
        const fr = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
          headers: { 'x-apisports-key': SPORTS_KEY }
        });
        const fd = await fr.json();
        const count = fd.results || 0;
        if (count > 0) {
          trends.push({ business: 'duelazo', icon: '⚽', text: `${count} partidos de futbol hoy — ideal para contenido en vivo`, action: '/duelazo.html' });
        }
      }
    } catch (_) {}

    // Nosotros: trending news
    try {
      const NEWS_KEY = process.env.NEWSAPI_KEY;
      if (NEWS_KEY) {
        const nr = await fetch(`https://newsapi.org/v2/everything?domains=eluniversal.com.mx,proceso.com.mx,expansion.mx&pageSize=3&sortBy=publishedAt&apiKey=${NEWS_KEY}`);
        const nd = await nr.json();
        if (nd.articles?.length) {
          trends.push({ business: 'nosotros', icon: '📰', text: `Trending: "${nd.articles[0].title?.slice(0, 60)}..."`, action: '/nosotros.html' });
        }
      }
    } catch (_) {}

    // Spacebox: seasonal
    const seasons = {
      1: 'Enero: mudanzas post-fiestas, ideal para promos de renta',
      2: 'San Valentin: promos especiales para parejas que se mudan juntas',
      3: 'Primavera: limpieza de closet, ideal para almacenaje temporal',
      5: 'Dia de las Madres: promo regalos + almacenaje',
      6: 'Verano: vacaciones, guardado de muebles',
      9: 'Regreso a clases: almacenaje de articulos temporales',
      11: 'Buen Fin: promos de renta con descuento',
      12: 'Navidad: almacenaje de decoraciones y mudanzas'
    };
    if (seasons[month]) {
      trends.push({ business: 'spacebox', icon: '📦', text: seasons[month], action: '/spacebox.html' });
    }

    // Styly: business cycle
    if (day <= 5) {
      trends.push({ business: 'styly', icon: '💻', text: 'Inicio de mes: contenido sobre presupuestos y metas de negocio', action: '/styly.html' });
    } else if (dayOfWeek === 1) {
      trends.push({ business: 'styly', icon: '💻', text: 'Lunes: ideal para contenido de planning semanal y motivacion', action: '/styly.html' });
    }

    res.json({ trends });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== STYLY USER PERMISSIONS ==========
router.get('/styly/permissions/:userId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT styly_modules FROM users WHERE id = $1',
      [req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const modules = rows[0].styly_modules || [];
    res.json({ modules });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/styly/permissions/:userId', async (req, res) => {
  try {
    const { modules } = req.body;
    if (!Array.isArray(modules)) return res.status(400).json({ error: 'modules debe ser un array' });

    const { rows } = await pool.query(
      'UPDATE users SET styly_modules = $1 WHERE id = $2 RETURNING id, name, styly_modules',
      [JSON.stringify(modules), req.params.userId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true, modules: rows[0].styly_modules });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
