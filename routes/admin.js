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
  const id = req.params.id;
  if (id == req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Delete dependent records that lack ON DELETE CASCADE
    await client.query('DELETE FROM content_history WHERE user_id = $1', [id]);
    await client.query('DELETE FROM ai_conversations WHERE user_id = $1', [id]);
    // Now delete the user (remaining FKs have CASCADE or SET NULL)
    const { rowCount } = await client.query('DELETE FROM users WHERE id = $1', [id]);
    await client.query('COMMIT');
    if (rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario eliminado' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
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
    // Add STYLY task stats per user
    const tasksByUser = {};
    const taskRows = await pool.query(
      `SELECT ta.user_id, t.estado
       FROM styly_task_asignados ta
       JOIN styly_tasks t ON ta.task_id = t.id`
    ).catch(() => ({ rows: [] }));
    taskRows.rows.forEach(r => {
      if (!tasksByUser[r.user_id]) tasksByUser[r.user_id] = { total: 0, completed: 0, byStatus: {} };
      tasksByUser[r.user_id].total++;
      const st = r.estado || 'Pendiente';
      tasksByUser[r.user_id].byStatus[st] = (tasksByUser[r.user_id].byStatus[st] || 0) + 1;
      if (st === 'Completada') tasksByUser[r.user_id].completed++;
    });

    // Merge task stats into team rows
    rows.forEach(r => {
      const ts = tasksByUser[r.id] || { total: 0, completed: 0, byStatus: {} };
      r.tasks_total = ts.total;
      r.tasks_completed = ts.completed;
      r.tasks_pending = ts.total - ts.completed;
      r.tasks_completion = ts.total > 0 ? Math.round((ts.completed / ts.total) * 100) : 0;
      r.tasks_by_status = ts.byStatus;
    });

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

// ========== CONTENT ACTIVITY FEED ==========
router.get('/content-activity', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const business = req.query.business || null;
    const userId = req.query.user_id || null;

    let where = '';
    const params = [];
    let idx = 1;
    if (business) { where += ` AND ch.business = $${idx++}`; params.push(business); }
    if (userId) { where += ` AND ch.user_id = $${idx++}`; params.push(userId); }
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT ch.id, ch.business, ch.format_type, ch.status, ch.created_at,
              ch.scheduled_date, ch.scheduled_platform,
              LEFT(ch.output_text, 150) as preview,
              u.id as user_id, u.name as user_name, u.role as user_role
       FROM content_history ch
       LEFT JOIN users u ON ch.user_id = u.id
       WHERE 1=1 ${where}
       ORDER BY ch.created_at DESC
       LIMIT $${idx}`, params
    );

    // Group by user for summary
    const byUser = {};
    for (const r of rows) {
      const name = r.user_name || 'Desconocido';
      if (!byUser[name]) byUser[name] = { user_id: r.user_id, role: r.user_role, total: 0, byBusiness: {} };
      byUser[name].total++;
      byUser[name].byBusiness[r.business] = (byUser[name].byBusiness[r.business] || 0) + 1;
    }

    res.json({ activity: rows, byUser });
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
