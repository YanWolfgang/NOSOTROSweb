const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { generate } = require('../services/ai');
const { pool } = require('../db/database');
const router = express.Router();

router.use(verifyToken);

// ========== HELPERS ==========
function weekStart() {
  const d = new Date(); d.setHours(0,0,0,0);
  const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff); return d.toISOString();
}

// ========== POST /ask — Main AI endpoint ==========
router.post('/ask', async (req, res) => {
  try {
    const { question, business, conversation_id } = req.body;
    if (!question) return res.status(400).json({ error: 'Se requiere pregunta' });

    const ws = weekStart();
    const isAdmin = req.user.role === 'admin';

    // Gather real DB context
    const context = {};

    // Content by business this week
    const cbRes = await pool.query(
      `SELECT business, COUNT(*) as total,
              COUNT(CASE WHEN status='approved' THEN 1 END) as approved,
              COUNT(CASE WHEN status='draft' THEN 1 END) as drafts
       FROM content_history WHERE created_at >= $1 GROUP BY business`, [ws]
    );
    context.contentByBusiness = cbRes.rows;

    // Upcoming 7 days
    const upRes = await pool.query(
      `SELECT business, format_type, scheduled_date, scheduled_platform
       FROM content_history
       WHERE status='approved' AND scheduled_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
       ORDER BY scheduled_date`
    );
    context.upcoming = upRes.rows;

    // Pending ideas
    const idRes = await pool.query(
      `SELECT business, COUNT(*) as count FROM ideas WHERE status='new' GROUP BY business`
    );
    context.pendingIdeas = idRes.rows;

    // User activity (admin sees all, editor sees self)
    if (isAdmin) {
      const uRes = await pool.query(
        `SELECT u.name, u.role, u.businesses,
                COUNT(ch.id) as total_generated,
                COUNT(CASE WHEN ch.status='approved' THEN 1 END) as total_approved,
                MAX(ch.created_at) as last_activity
         FROM users u
         LEFT JOIN content_history ch ON u.id = ch.user_id AND ch.created_at >= $1
         WHERE u.status = 'active'
         GROUP BY u.id, u.name, u.role, u.businesses`, [ws]
      );
      context.users = uRes.rows;
    } else {
      const uRes = await pool.query(
        `SELECT COUNT(*) as total_generated,
                COUNT(CASE WHEN status='approved' THEN 1 END) as total_approved,
                MAX(created_at) as last_activity
         FROM content_history WHERE user_id = $1 AND created_at >= $2`, [req.user.id, ws]
      );
      context.myStats = uRes.rows[0];
    }

    // Business-specific detail
    if (business && business !== 'general') {
      const bdRes = await pool.query(
        `SELECT format_type, COUNT(*) as count,
                COUNT(CASE WHEN status='approved' THEN 1 END) as approved
         FROM content_history WHERE business=$1 AND created_at >= $2
         GROUP BY format_type`, [business, ws]
      );
      context.businessDetail = bdRes.rows;
    }

    // Styly tasks data (for task-related questions)
    try {
      const tasksRes = await pool.query(
        `SELECT t.task_id, t.titulo, t.descripcion, t.prioridad, t.estado, t.seccion, t.created_at, t.updated_at,
                p.nombre as proyecto_nombre
         FROM styly_tasks t LEFT JOIN styly_projects p ON t.proyecto_id = p.id
         ORDER BY t.prioridad DESC, t.task_id ASC`
      );
      const asigRes = await pool.query(
        `SELECT ta.task_id, u.name FROM styly_task_asignados ta JOIN users u ON ta.user_id = u.id`
      );
      const asigMap = {};
      asigRes.rows.forEach(a => {
        if (!asigMap[a.task_id]) asigMap[a.task_id] = [];
        asigMap[a.task_id].push(a.name);
      });
      const allTasks = tasksRes.rows;
      context.stylyTasks = {
        total: allTasks.length,
        byStatus: {
          pendiente: allTasks.filter(t => (t.estado || '').toLowerCase() === 'pendiente').length,
          enProgreso: allTasks.filter(t => (t.estado || '').toLowerCase() === 'en progreso').length,
          completada: allTasks.filter(t => (t.estado || '').toLowerCase() === 'completada').length
        },
        byPriority: {
          alta: allTasks.filter(t => (t.prioridad || '').toLowerCase() === 'alta').length,
          media: allTasks.filter(t => (t.prioridad || '').toLowerCase() === 'media').length,
          baja: allTasks.filter(t => (t.prioridad || '').toLowerCase() === 'baja').length
        },
        byUser: {},
        byProject: {},
        highPriorityPending: allTasks.filter(t => (t.prioridad || '').toLowerCase() === 'alta' && (t.estado || '').toLowerCase() === 'pendiente').map(t => ({ id: t.task_id, desc: t.titulo, section: t.seccion, assigned: (asigMap[t.id]||[]).join(', '), project: t.proyecto_nombre })),
        allTasks: allTasks.map(t => ({ id: t.task_id, desc: t.titulo, section: t.seccion, priority: t.prioridad, assigned: (asigMap[t.id]||[]).join(', '), status: t.estado, project: t.proyecto_nombre }))
      };
      // Aggregate by user
      allTasks.forEach(t => {
        const users = asigMap[t.id] || ['Sin asignar'];
        users.forEach(u => {
          if (!context.stylyTasks.byUser[u]) context.stylyTasks.byUser[u] = { total: 0, pendiente: 0, completada: 0 };
          context.stylyTasks.byUser[u].total++;
          if ((t.estado || '').toLowerCase() === 'pendiente') context.stylyTasks.byUser[u].pendiente++;
          if ((t.estado || '').toLowerCase() === 'completada') context.stylyTasks.byUser[u].completada++;
        });
      });
      // Aggregate by project
      allTasks.forEach(t => {
        const p = t.proyecto_nombre || 'Sin proyecto';
        if (!context.stylyTasks.byProject[p]) context.stylyTasks.byProject[p] = { total: 0, pendiente: 0, completada: 0 };
        context.stylyTasks.byProject[p].total++;
        if ((t.estado || '').toLowerCase() === 'pendiente') context.stylyTasks.byProject[p].pendiente++;
        if ((t.estado || '').toLowerCase() === 'completada') context.stylyTasks.byProject[p].completada++;
      });
    } catch (_) { /* styly_tasks table may not exist yet */ }

    const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const systemPrompt = `Eres el asistente de IA de Panel Central, una plataforma de gestion de contenido para 4 negocios: NOSOTROS (medio digital), DUELAZO (apuestas deportivas), SPACEBOX (mini bodegas) y STYLY (software de gestion para belleza/bienestar).

Tu trabajo es analizar datos REALES de la plataforma y dar respuestas utiles, concretas y accionables. NO inventes datos. Solo usa la informacion que te proporciono.

Tambien tienes acceso a las tareas de desarrollo de STYLY (software de gestion para belleza/bienestar). Puedes analizar el estado de las tareas, identificar bottlenecks, sugerir prioridades, y dar recomendaciones sobre asignaciones y progreso del equipo de desarrollo.

Hoy es ${today}.

DATOS REALES DE LA PLATAFORMA ESTA SEMANA:
${JSON.stringify(context, null, 2)}

Responde en espanol, de forma concisa y con datos concretos. Si detectas problemas (baja actividad, huecos en calendario, desbalance), mencionalos proactivamente. Usa emojis moderadamente para claridad. Si no hay datos suficientes, dilo honestamente.`;

    const answer = await generate(question, systemPrompt);

    // Save to conversation if provided
    if (conversation_id) {
      await pool.query(
        `UPDATE ai_conversations SET messages = messages || $1::jsonb WHERE id = $2 AND user_id = $3`,
        [JSON.stringify([
          { role: 'user', content: question, ts: new Date().toISOString() },
          { role: 'assistant', content: answer, ts: new Date().toISOString() }
        ]), conversation_id, req.user.id]
      );
    }

    res.json({ answer, context_summary: { businesses: context.contentByBusiness.length, upcoming: context.upcoming.length } });
  } catch (e) {
    console.error('AI ask error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== CONVERSATIONS CRUD ==========
router.get('/conversations', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, business, title, created_at, expires_at, jsonb_array_length(messages) as msg_count
       FROM ai_conversations WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`, [req.user.id]
    );
    res.json({ conversations: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    res.json({ conversation: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/conversations', async (req, res) => {
  try {
    const { title, business } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO ai_conversations (user_id, business, title) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, business || 'general', title || 'Nueva conversacion']
    );
    res.json({ conversation: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== DOWNLOAD CONVERSATION ==========
router.get('/conversations/:id/download', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    const c = rows[0];
    const msgs = (c.messages || []).map(m =>
      `[${m.role === 'user' ? 'TU' : 'IA'}] ${m.ts || ''}: ${m.content}`
    ).join('\n\n');
    const txt = `Panel Central — Conversacion con IA\nFecha: ${new Date(c.created_at).toLocaleString('es-MX')}\nNegocio: ${c.business}\nExpira: ${new Date(c.expires_at).toLocaleString('es-MX')}\n${'='.repeat(50)}\n\n${msgs}`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${c.id}.txt"`);
    res.send(txt);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== WEEKLY REPORT ==========
router.post('/weekly-report', async (req, res) => {
  try {
    const ws = weekStart();

    // Content stats by business
    const bizStats = await pool.query(
      `SELECT business, COUNT(*) as total,
              COUNT(CASE WHEN status='approved' THEN 1 END) as approved,
              COUNT(CASE WHEN status='draft' THEN 1 END) as drafts
       FROM content_history WHERE created_at >= $1 GROUP BY business`, [ws]
    );

    // User stats
    const userStats = await pool.query(
      `SELECT u.name, u.role,
              COUNT(ch.id) as generated,
              COUNT(CASE WHEN ch.status='approved' THEN 1 END) as approved,
              MAX(ch.created_at) as last_activity
       FROM users u
       LEFT JOIN content_history ch ON u.id = ch.user_id AND ch.created_at >= $1
       WHERE u.status = 'active'
       GROUP BY u.id, u.name, u.role
       ORDER BY COUNT(ch.id) DESC`, [ws]
    );

    // Upcoming content
    const upcoming = await pool.query(
      `SELECT business, format_type, scheduled_date, scheduled_platform
       FROM content_history
       WHERE status='approved' AND scheduled_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
       ORDER BY scheduled_date`
    );

    // Format usage
    const formats = await pool.query(
      `SELECT business, format_type, COUNT(*) as times
       FROM content_history WHERE created_at >= $1
       GROUP BY business, format_type ORDER BY business, times DESC`, [ws]
    );

    // Pending ideas
    const ideas = await pool.query(
      `SELECT business, COUNT(*) as count FROM ideas WHERE status='new' GROUP BY business`
    );

    // Styly tasks
    let stylyTaskData = {};
    try {
      const tasksQ = await pool.query(
        `SELECT t.task_id, t.titulo, t.prioridad, t.estado, p.nombre as proyecto_nombre
         FROM styly_tasks t LEFT JOIN styly_projects p ON t.proyecto_id = p.id`
      );
      const allT = tasksQ.rows;
      stylyTaskData = {
        total: allT.length,
        pendiente: allT.filter(t => (t.estado || '').toLowerCase() === 'pendiente').length,
        enProgreso: allT.filter(t => (t.estado || '').toLowerCase() === 'en progreso').length,
        completada: allT.filter(t => (t.estado || '').toLowerCase() === 'completada').length,
        altaPrioridad: allT.filter(t => (t.prioridad || '').toLowerCase() === 'alta' && (t.estado || '').toLowerCase() === 'pendiente').map(t => t.task_id + ': ' + t.titulo).slice(0, 10)
      };
    } catch (_) {}

    const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const reportPrompt = `Genera un reporte ejecutivo semanal de Panel Central. Hoy es ${today}.

DATOS REALES:
- Contenido por negocio: ${JSON.stringify(bizStats.rows)}
- Rendimiento por empleado: ${JSON.stringify(userStats.rows)}
- Contenido agendado proximos 7 dias: ${JSON.stringify(upcoming.rows)}
- Formatos usados: ${JSON.stringify(formats.rows)}
- Ideas pendientes: ${JSON.stringify(ideas.rows)}
- Tareas de desarrollo STYLY: ${JSON.stringify(stylyTaskData)}

Incluye estas secciones:
1. RESUMEN EJECUTIVO (3-4 lineas con lo mas importante)
2. RENDIMIENTO POR NEGOCIO (tabla con generado/aprobado/agendado)
3. RENDIMIENTO POR EMPLEADO (ranking con ratio aprobacion)
4. HUECOS Y OPORTUNIDADES (negocios sin agendar, formatos sin usar, inactividad)
5. ESTADO DE TAREAS STYLY (progreso general, tareas criticas pendientes, bottlenecks)
6. RECOMENDACIONES PARA PROXIMA SEMANA (3-5 acciones concretas)

Usa formato limpio con emojis para secciones. Se conciso pero completo. Si no hay datos suficientes, indicalo.`;

    const report = await generate(reportPrompt, 'Eres un analista de contenido que genera reportes ejecutivos basados en datos reales. Nunca inventes datos.');
    res.json({ report });
  } catch (e) {
    console.error('Weekly report error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== SUGGESTIONS ==========
router.get('/suggestions', async (req, res) => {
  try {
    const suggestions = [];
    const ws = weekStart();
    const isAdmin = req.user.role === 'admin';
    const now = new Date();
    const dayOfWeek = now.getDay();

    // Monday = planning
    if (dayOfWeek === 1) {
      suggestions.push({ icon: '📅', text: 'Planear el contenido de esta semana', question: 'Ayudame a planear el contenido para esta semana en todos los negocios' });
    }

    // Check businesses without scheduled content
    const sched = await pool.query(
      `SELECT DISTINCT business FROM content_history
       WHERE status='approved' AND scheduled_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'`
    );
    const scheduledBiz = sched.rows.map(r => r.business);
    const allBiz = ['nosotros', 'duelazo', 'spacebox', 'styly'];
    const missing = allBiz.filter(b => !scheduledBiz.includes(b));
    if (missing.length) {
      suggestions.push({ icon: '⚠️', text: `${missing.join(', ')} sin contenido agendado esta semana`, question: `Los negocios ${missing.join(', ')} no tienen contenido agendado para esta semana. Que recomiendas?` });
    }

    // Check inactive users (admin only)
    if (isAdmin) {
      const inactive = await pool.query(
        `SELECT u.name FROM users u
         LEFT JOIN content_history ch ON u.id = ch.user_id AND ch.created_at >= NOW() - INTERVAL '2 days'
         WHERE u.status = 'active' AND ch.id IS NULL`
      );
      if (inactive.rows.length) {
        const names = inactive.rows.map(r => r.name).join(', ');
        suggestions.push({ icon: '👤', text: `${names} sin actividad reciente`, question: `Quienes no han generado contenido en los ultimos dias y que podemos hacer?` });
      }
    }

    // Pending ideas
    const ideasRes = await pool.query(
      `SELECT business, COUNT(*) as count FROM ideas WHERE status='new' GROUP BY business`
    );
    if (ideasRes.rows.length) {
      const total = ideasRes.rows.reduce((s, r) => s + parseInt(r.count), 0);
      suggestions.push({ icon: '💡', text: `${total} ideas pendientes por usar`, question: 'Que ideas pendientes tenemos y cuales deberiamos priorizar?' });
    }

    // Styly tasks suggestions
    try {
      const taskRes = await pool.query(
        `SELECT estado, prioridad FROM styly_tasks`
      );
      const allTasks = taskRes.rows;
      const pendingTasks = allTasks.filter(t => (t.estado || '').toLowerCase() === 'pendiente');
      const highPri = pendingTasks.filter(t => (t.prioridad || '').toLowerCase() === 'alta');
      if (highPri.length > 0) {
        suggestions.push({ icon: '⚠️', text: `${highPri.length} tareas urgentes de Styly pendientes`, question: `Hay ${highPri.length} tareas de alta prioridad pendientes en Styly. Cuales son y que recomiendas priorizar?` });
      }
      if (pendingTasks.length > 10) {
        suggestions.push({ icon: '✅', text: `${pendingTasks.length} tareas Styly sin completar`, question: `Como van las tareas de desarrollo de Styly? Dame un analisis de bottlenecks y recomendaciones para el equipo` });
      }
    } catch (_) {}

    // Weekly report suggestion (always available)
    suggestions.push({ icon: '📊', text: 'Generar reporte semanal', question: 'Dame un reporte completo de como va la semana en todos los negocios' });

    res.json({ suggestions: suggestions.slice(0, 6) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
