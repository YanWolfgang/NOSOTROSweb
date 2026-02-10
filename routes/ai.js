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

    // STYLY Task Manager Context - Comprehensive aggregation
    let stylyContext = null;
    try {
      const stylyTasksRes = await pool.query(`
        SELECT
          t.id, t.task_id, t.titulo, t.estado, t.prioridad,
          t.fecha_vencimiento, t.progreso,
          p.nombre as proyecto, p.color as proyecto_color,
          ARRAY_AGG(DISTINCT u.name) FILTER (WHERE u.name IS NOT NULL) as asignados
        FROM styly_tasks t
        LEFT JOIN styly_projects p ON t.proyecto_id = p.id
        LEFT JOIN styly_task_asignados ta ON t.id = ta.task_id
        LEFT JOIN users u ON ta.user_id = u.id
        GROUP BY t.id, p.nombre, p.color
        ORDER BY t.id DESC
      `);

      if (stylyTasksRes.rows.length > 0) {
        const tasks = stylyTasksRes.rows;
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.estado === 'Completada').length;
        const today = new Date();

        // Calculate overdue tasks
        const overdueTasks = tasks.filter(t =>
          t.fecha_vencimiento &&
          new Date(t.fecha_vencimiento) < today &&
          t.estado !== 'Completada'
        );

        // Workload by assignee
        const workloadMap = {};
        tasks.forEach(task => {
          if (task.asignados && task.estado !== 'Completada') {
            task.asignados.forEach(assignee => {
              workloadMap[assignee] = (workloadMap[assignee] || 0) + 1;
            });
          }
        });

        // High priority incomplete tasks
        const highPriorityTasks = tasks.filter(t =>
          t.prioridad === 'Alta' && t.estado !== 'Completada'
        );

        // Unassigned tasks
        const unassignedTasks = tasks.filter(t =>
          (!t.asignados || t.asignados.length === 0) && t.estado !== 'Completada'
        );

        // Tasks by project
        const byProject = {};
        tasks.forEach(t => {
          const proj = t.proyecto || 'Sin proyecto';
          if (!byProject[proj]) byProject[proj] = { total: 0, completada: 0, pendiente: 0, enProgreso: 0 };
          byProject[proj].total++;
          if (t.estado === 'Completada') byProject[proj].completada++;
          if (t.estado === 'Pendiente') byProject[proj].pendiente++;
          if (t.estado === 'En Progreso') byProject[proj].enProgreso++;
        });

        stylyContext = {
          total_tasks: totalTasks,
          completed: completedTasks,
          pending: tasks.filter(t => t.estado === 'Pendiente').length,
          in_progress: tasks.filter(t => t.estado === 'En Progreso').length,
          completion_rate: Math.round((completedTasks / totalTasks) * 100),
          overdue_count: overdueTasks.length,
          overdue_tasks: overdueTasks.slice(0, 5).map(t => ({
            id: t.task_id,
            titulo: t.titulo,
            proyecto: t.proyecto,
            dias_vencido: Math.floor((today - new Date(t.fecha_vencimiento)) / (1000 * 60 * 60 * 24))
          })),
          high_priority_count: highPriorityTasks.length,
          high_priority: highPriorityTasks.slice(0, 5).map(t => ({
            id: t.task_id,
            titulo: t.titulo,
            proyecto: t.proyecto
          })),
          unassigned_count: unassignedTasks.length,
          unassigned: unassignedTasks.slice(0, 5).map(t => ({
            id: t.task_id,
            titulo: t.titulo,
            proyecto: t.proyecto
          })),
          workload: Object.entries(workloadMap).map(([name, count]) => ({
            assignee: name,
            active_tasks: count
          })),
          by_project: byProject
        };
        context.stylyTasks = stylyContext;
      }
    } catch (e) {
      console.error('Error cargando contexto STYLY:', e.message);
    }

    const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const systemPrompt = `Eres el asistente de IA de Panel Central, una plataforma integral de gestion para 4 negocios:
- NOSOTROS: Plataforma de contenido digital con IA
- DUELAZO: Contenido deportivo y apuestas
- SPACEBOX: Mini bodegas y almacenaje
- STYLY: Software de gestion para belleza y bienestar (incluye task manager de desarrollo)

TAREA PRINCIPAL:
Analizar datos REALES de la plataforma y dar respuestas utiles, concretas y accionables. NUNCA inventes datos. Solo usa informacion que te proporciono.

CAPACIDADES ESPECIALES:
- Generar ideas y contenido para redes sociales
- Analizar metricas de negocio y trends
- Gestionar y analizar tareas de desarrollo STYLY
- Proporcionar insights sobre productividad, deadlines y cargas de trabajo
- Identificar bottlenecks y sugerir prioridades de desarrollo
- Dar recomendaciones sobre asignaciones y progreso del equipo

Hoy es ${today}.

DATOS REALES DE LA PLATAFORMA:
${JSON.stringify(context, null, 2)}

INSTRUCCIONES:
1. USA SOLO datos reales proporcionados arriba
2. Para STYLY: analiza tareas vencidas, prioridades, cargas de trabajo, progreso por proyecto
3. Si hay tareas vencidas o sin asignar, mencionalas proactivamente
4. Si detectas problemas (desbalance de carga, baja tasa de completitud, muchas tareas pendientes), sugiere acciones concretas
5. Se conciso pero completo
6. Incluye numeros especificos cuando analices datos
7. Usa emojis moderadamente para claridad
8. Si no hay datos suficientes, dilo honestamente
9. IMPORTANTE: Tu SOLO puedes analizar datos y dar recomendaciones. NO puedes ejecutar acciones como cambiar prioridades, asignar tareas, mover tareas, etc. Si el usuario te pide ejecutar una accion (cambiar, asignar, distribuir, mover, editar tareas), responde: "Para ejecutar ese comando, escribelo directamente empezando con el verbo de accion. Ejemplo: 'Cambia prioridad a Alta en tareas pendientes' o 'Asigna tareas del proyecto X a Emilio'. El sistema de comandos lo ejecutara automaticamente."
10. NUNCA digas "listo, ya lo hice" o "he cambiado" porque tu NO ejecutas acciones, solo analizas datos.`;

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

// ========== POST /process-command — AI Command Parser ==========
router.post('/process-command', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Comando requerido' });

    // 1. Gather compact context
    const [usersR, projR, summaryR, unassignedR, byProjectR] = await Promise.all([
      pool.query("SELECT id, name FROM users WHERE activo IS NOT false OR activo IS NULL ORDER BY name"),
      pool.query("SELECT id, nombre FROM styly_projects ORDER BY order_index"),
      pool.query("SELECT estado, prioridad, COUNT(*)::int as count FROM styly_tasks GROUP BY estado, prioridad"),
      pool.query(`SELECT COUNT(*)::int as count FROM styly_tasks WHERE estado != 'Completada' AND id NOT IN (SELECT DISTINCT task_id FROM styly_task_asignados)`),
      pool.query("SELECT p.nombre, t.estado, COUNT(*)::int as count FROM styly_tasks t JOIN styly_projects p ON t.proyecto_id=p.id GROUP BY p.nombre, t.estado")
    ]);

    const context = {
      users: usersR.rows,
      projects: projR.rows,
      taskSummary: summaryR.rows,
      byProject: byProjectR.rows,
      unassigned: unassignedR.rows[0]?.count || 0
    };

    // 2. System prompt for command parsing
    const systemPrompt = `Eres un parser de comandos para Panel Central. Tu UNICA funcion es analizar comandos en lenguaje natural y devolver JSON estructurado.

NEGOCIOS: NOSOTROS, DUELAZO, SPACEBOX, STYLY

USUARIOS DISPONIBLES:
${JSON.stringify(context.users)}

PROYECTOS DISPONIBLES:
${JSON.stringify(context.projects)}

CONTEXTO ACTUAL DE TAREAS:
${JSON.stringify(context.taskSummary)}
Tareas sin asignar: ${context.unassigned}

TAREAS POR PROYECTO:
${JSON.stringify(context.byProject)}

ACCIONES SOPORTADAS:

1. "distribute" - Distribuir tareas pendientes/sin asignar entre varios usuarios con porcentajes
   Params: { "users": [{"name":"Admin", "percentage":60},{"name":"Emilio", "percentage":40}], "filters": {"estado":"Pendiente"} }

2. "generate" - Crear tareas nuevas en bulk
   Params: { "count":5, "tipo":"reel_educativo", "proyecto_nombre":"STYLY Panel", "asignado_nombre":"Admin", "prioridad":"Media" }

3. "bulk_edit" - Editar o asignar multiples tareas que coincidan con filtros
   Filtros disponibles: estado, prioridad, proyecto_nombre, asignado, task_ids (array de IDs especificos como ["STY-001","STY-002"])
   Cambios disponibles: estado, prioridad, asignado_nombre (para asignar tareas a alguien)
   Ejemplo asignar por IDs: { "filters": {"task_ids":["STY-001","STY-002","STY-003"]}, "changes": {"asignado_nombre":"Emilio Uribe"} }
   Ejemplo asignar por proyecto: { "filters": {"proyecto_nombre":"Panel Afiliados","estado":"Pendiente"}, "changes": {"asignado_nombre":"Emilio Uribe"} }
   Ejemplo editar: { "filters": {"estado":"Pendiente"}, "changes": {"prioridad":"Alta"} }
   IMPORTANTE: Cuando el usuario mencione IDs especificos (ej: "asigna STY-001, STY-002 a Admin" o "las tareas 1,2,3"), usa task_ids como filtro

4. "analyze" - Analizar tareas y dar recomendaciones
   Params: { "scope":"full" }

RESPONDE SOLO con JSON valido, sin texto adicional, sin markdown:
{"action":"...","params":{...},"summary":"Descripcion en espanol","requiresConfirmation":true,"affectedCount":5}

REGLAS:
- Si el comando no es claro, usa action "unknown" con summary explicando que no entendiste
- requiresConfirmation = true para distribute, generate, bulk_edit. false para analyze.
- Resuelve nombres de usuario a los disponibles (coincidencia parcial)
- Los porcentajes en distribute deben sumar 100
- SOLO agrega filtro de estado si el usuario lo menciona EXPLICITAMENTE (ej: "tareas pendientes"). Si solo dice "tareas del proyecto X", NO pongas filtro de estado
- IMPORTANTE: affectedCount DEBE ser un numero calculado del contexto de tareas, NUNCA "?" o null. Usa los datos de TAREAS POR PROYECTO para contar. Suma todos los estados del proyecto si no hay filtro de estado
- Si piden asignar tareas de un proyecto, usa bulk_edit con filtro proyecto_nombre y cambio asignado_nombre`;

    // 3. Call Groq
    const rawResponse = await generate(command, systemPrompt);

    // 4. Parse JSON
    const start = rawResponse.indexOf('{');
    const end = rawResponse.lastIndexOf('}');
    if (start === -1 || end <= start) {
      return res.json({
        action: 'unknown',
        summary: 'No pude interpretar el comando. Intenta: "Distribuye tareas 60/40 entre Admin y Emilio"',
        requiresConfirmation: false
      });
    }

    const parsed = JSON.parse(rawResponse.substring(start, end + 1));

    // 5. For analyze, do a second Groq call with full data
    if (parsed.action === 'analyze') {
      const analyticsR = await pool.query(`
        SELECT t.id, t.task_id, t.titulo, t.estado, t.prioridad, t.fecha_vencimiento,
          p.nombre as proyecto,
          ARRAY_AGG(DISTINCT u.name) FILTER (WHERE u.name IS NOT NULL) as asignados
        FROM styly_tasks t
        LEFT JOIN styly_projects p ON t.proyecto_id = p.id
        LEFT JOIN styly_task_asignados ta ON t.id = ta.task_id
        LEFT JOIN users u ON ta.user_id = u.id
        GROUP BY t.id, p.nombre ORDER BY t.id DESC
      `);

      const tasks = analyticsR.rows;
      const total = tasks.length;
      const completed = tasks.filter(t => t.estado === 'Completada').length;
      const pending = tasks.filter(t => t.estado === 'Pendiente').length;
      const inProgress = tasks.filter(t => t.estado === 'En Progreso').length;
      const today = new Date();
      const overdue = tasks.filter(t => t.fecha_vencimiento && new Date(t.fecha_vencimiento) < today && t.estado !== 'Completada');
      const unassigned = tasks.filter(t => !t.asignados || t.asignados.length === 0 || (t.asignados.length === 1 && t.asignados[0] === null));
      const highPriority = tasks.filter(t => t.prioridad === 'Alta' && t.estado !== 'Completada');

      const workload = {};
      tasks.forEach(t => {
        if (t.asignados && t.estado !== 'Completada') {
          t.asignados.forEach(a => { if (a) workload[a] = (workload[a] || 0) + 1; });
        }
      });

      const byProject = {};
      tasks.forEach(t => {
        const pn = t.proyecto || 'Sin proyecto';
        if (!byProject[pn]) byProject[pn] = { total: 0, completada: 0 };
        byProject[pn].total++;
        if (t.estado === 'Completada') byProject[pn].completada++;
      });

      const analysisData = {
        total, completed, pending, inProgress,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        overdue: overdue.length,
        overdueList: overdue.slice(0, 8).map(t => ({ id: t.task_id, titulo: t.titulo, proyecto: t.proyecto })),
        unassigned: unassigned.length,
        highPriority: highPriority.length,
        workload,
        byProject
      };

      const analysisPrompt = `Analiza estos datos de tareas de desarrollo y genera un reporte con:
1. RESUMEN: Estado general
2. PROBLEMAS: Bottlenecks y riesgos detectados
3. CARGA DE TRABAJO: Balance entre equipo
4. RECOMENDACIONES: 3-5 acciones concretas priorizadas

Datos: ${JSON.stringify(analysisData)}
Responde en espanol, se conciso, usa numeros reales, da recomendaciones accionables.`;

      const analysis = await generate(analysisPrompt, 'Eres un analista senior de proyectos de software. Hablas en espanol.');
      parsed.analysisResult = analysis;
    }

    res.json(parsed);
  } catch (e) {
    console.error('Process command error:', e.message);
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

    // STYLY Task Manager Analysis for Weekly Report
    let stylyTaskData = {};
    try {
      const stylyWeeklyRes = await pool.query(`
        SELECT
          t.task_id, t.titulo, t.prioridad, t.estado, p.nombre as proyecto_nombre,
          t.fecha_vencimiento, t.created_at,
          COUNT(DISTINCT ta.user_id) as asignados_count
        FROM styly_tasks t
        LEFT JOIN styly_projects p ON t.proyecto_id = p.id
        LEFT JOIN styly_task_asignados ta ON t.id = ta.task_id
        GROUP BY t.id, p.nombre, t.task_id, t.titulo, t.prioridad, t.estado, t.fecha_vencimiento, t.created_at
        ORDER BY t.created_at DESC
      `);

      if (stylyWeeklyRes.rows.length > 0) {
        const allT = stylyWeeklyRes.rows;
        const today = new Date();
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        const thisWeek = allT.filter(t => new Date(t.created_at) >= weekAgo);
        const completed = allT.filter(t => t.estado === 'Completada');
        const completedThisWeek = thisWeek.filter(t => t.estado === 'Completada');
        const overdue = allT.filter(t =>
          t.fecha_vencimiento &&
          new Date(t.fecha_vencimiento) < today &&
          t.estado !== 'Completada'
        );

        stylyTaskData = {
          total: allT.length,
          pendiente: allT.filter(t => t.estado === 'Pendiente').length,
          enProgreso: allT.filter(t => t.estado === 'En Progreso').length,
          completada: completed.length,
          completionRate: allT.length > 0 ? Math.round((completed.length / allT.length) * 100) : 0,
          thisWeek: {
            created: thisWeek.length,
            completed: completedThisWeek.length,
            completionRate: thisWeek.length > 0 ? Math.round((completedThisWeek.length / thisWeek.length) * 100) : 0
          },
          overdue: overdue.length,
          highPriority: allT.filter(t => t.prioridad === 'Alta' && t.estado !== 'Completada').length,
          topPendingTasks: allT.filter(t => t.estado !== 'Completada')
            .sort((a, b) => (b.prioridad === 'Alta' ? 1 : 0) - (a.prioridad === 'Alta' ? 1 : 0))
            .slice(0, 5)
            .map(t => `[${t.task_id}] ${t.titulo} (${t.proyecto_nombre}) - ${t.prioridad}`)
        };
      }
    } catch (e) {
      console.error('Error generating STYLY weekly data:', e.message);
    }

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

    // STYLY Task Manager Suggestions
    try {
      const stylyTasksRes = await pool.query(`
        SELECT t.estado, t.prioridad, t.fecha_vencimiento,
          ARRAY_AGG(DISTINCT u.name) FILTER (WHERE u.name IS NOT NULL) as asignados
        FROM styly_tasks t
        LEFT JOIN styly_task_asignados ta ON t.id = ta.task_id
        LEFT JOIN users u ON ta.user_id = u.id
        GROUP BY t.id, t.estado, t.prioridad, t.fecha_vencimiento
      `);

      if (stylyTasksRes.rows.length > 0) {
        const tasks = stylyTasksRes.rows;
        const today = new Date();

        // Overdue tasks
        const overdue = tasks.filter(t =>
          t.fecha_vencimiento &&
          new Date(t.fecha_vencimiento) < today &&
          t.estado !== 'Completada'
        );

        if (overdue.length > 0) {
          suggestions.push({
            icon: '⏰',
            text: `${overdue.length} tarea${overdue.length > 1 ? 's' : ''} vencida${overdue.length > 1 ? 's' : ''} en STYLY`,
            question: `Tengo ${overdue.length} tarea${overdue.length > 1 ? 's' : ''} vencida${overdue.length > 1 ? 's' : ''} en STYLY. Cuales son y que debo hacer primero?`
          });
        }

        // High priority pending
        const highPriority = tasks.filter(t =>
          t.prioridad === 'Alta' && t.estado !== 'Completada'
        );

        if (highPriority.length > 0) {
          suggestions.push({
            icon: '🔴',
            text: `${highPriority.length} tarea${highPriority.length > 1 ? 's' : ''} de alta prioridad pendiente${highPriority.length > 1 ? 's' : ''}`,
            question: `Dame un resumen de las ${highPriority.length} tarea${highPriority.length > 1 ? 's' : ''} urgentes de STYLY y recommienda el orden de ejecucion`
          });
        }

        // Unassigned tasks
        const unassigned = tasks.filter(t =>
          (!t.asignados || t.asignados.length === 0) && t.estado !== 'Completada'
        );

        if (unassigned.length > 0) {
          suggestions.push({
            icon: '👤',
            text: `${unassigned.length} tarea${unassigned.length > 1 ? 's' : ''} sin asignar`,
            question: `Tengo ${unassigned.length} tarea${unassigned.length > 1 ? 's' : ''} sin asignar en STYLY. A quién debería asignarlas?`
          });
        }

        // General STYLY analysis
        suggestions.push({
          icon: '📊',
          text: 'Analizar estado de STYLY',
          question: 'Dame un resumen del estado de todas las tareas de STYLY: progreso, bottlenecks, cargas de trabajo'
        });
      }
    } catch (e) {
      console.error('Error generating STYLY suggestions:', e.message);
    }

    // Weekly report suggestion (always available)
    suggestions.push({ icon: '📊', text: 'Generar reporte semanal', question: 'Dame un reporte completo de como va la semana en todos los negocios' });

    res.json({ suggestions: suggestions.slice(0, 6) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
