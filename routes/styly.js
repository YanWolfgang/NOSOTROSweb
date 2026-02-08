const express = require('express');
const bcrypt = require('bcryptjs');
const { verifyToken, requireBusiness } = require('../middleware/auth');
const { generate } = require('../services/ai');
const { pool } = require('../db/database');
const router = express.Router();

router.use(verifyToken, requireBusiness('styly'));

// ========== SYSTEM PROMPTS ==========
const SYS_CLIENTS = 'Eres el equipo de marketing de STYLY, software de gestión integral para negocios de belleza, bienestar y servicios profesionales en México. Precio base: $599 MXN/mes. Funciones core: agenda digital ilimitada, CRM con historial de clientes, website de reservas personalizado (tu-negocio.styly.mx donde los clientes agendan solos las 24 horas), cobro automático de membresías y suscripciones (0% comisión Styly), facturación, chatbot. Extensiones: WhatsApp masivo para promos ($149), Cerebro IA con predicciones ($199), Multi-Sucursal ($149), Métricas de empleados ($150). Paquetes desde $649 hasta $1,796/mes. Tono inspiracional y transformador. Hablas a dueños de estéticas, barberías, spas, nail salons, tatuadores, psicólogos, dentistas, nutriólogos, entrenadores que siguen usando libreta, WhatsApp o Excel para agendar y cobrar. Usa contraste antes/después (caos de la libreta vs control digital). Genera urgencia sin agresividad. Siempre CTA: agenda tu demo gratis en styly.mx. Genera contenido para Instagram, TikTok, Facebook y LinkedIn.';

const SYS_AFFILIATES = 'Eres el equipo de marketing de STYLY para el programa Afiliadas Elite. Hablas a mujeres emprendedoras que quieren generar ingresos recurrentes vendiendo software a negocios de belleza y bienestar. Datos reales de comisiones: 50% del primer mes de cada local ($299.50 MXN por local), 15% residual mensual ($89.85/mes por local permanente), 10% extra por cada módulo add-on activado. Sistema de Millas con Podio Mensual: 1er lugar $5,000, 2do $2,500, 3er $1,000. Plan de carrera con bonos únicos: Plata $2,500, Oro $10,000, hasta Oráculo $300,000. Copa anual con crucero para top 5. Capacitación gratuita en Styly Academy (5 módulos). Sin inversión inicial, sin horario fijo, trabaja desde tu celular. No es multinivel — cobras por tus directos y por invitadas directas (3%). Tono empoderador y motivacional. CTA: únete en styly.mx/afiliados. Genera para Instagram, TikTok y Facebook.';

const SYS_SCRIPTS = 'Eres experto en ventas de software SaaS para negocios de belleza y bienestar en México. Generas scripts de venta para STYLY ($599/mes). El script debe ser natural y conversacional, no robótico. Adapta los ejemplos y dolores al tipo de negocio específico. Un tatuador tiene problemas diferentes a una estética. Features principales para vender: agenda digital (adiós libreta, citas ilimitadas), website donde clientes agendan solos 24/7 (tu-negocio.styly.mx), cobro automático de membresías, CRM con historial. URL: styly.mx';

// ========== GENERATE CONTENT ==========
router.post('/generate', async (req, res) => {
  try {
    const { format, audience, topic, context, industry, previousContent, editInstructions } = req.body;
    if (!format && !previousContent) return res.status(400).json({ error: 'Se requiere formato o contenido previo' });

    let prompt, sys;
    if (previousContent && editInstructions) {
      prompt = `Contenido original:\n${previousContent}\n\nEl usuario quiere estos cambios:\n${editInstructions}\n\nGenera una nueva versión aplicando SOLO los cambios solicitados. Mantén el mismo formato y estructura.`;
      sys = audience === 'affiliates' ? SYS_AFFILIATES : SYS_CLIENTS;
    } else {
      sys = audience === 'affiliates' ? SYS_AFFILIATES : SYS_CLIENTS;
      const indStr = industry ? `\nIndustria/nicho: ${industry}` : '';
      const topicStr = topic ? `\nTema: ${topic}` : '';
      const ctxStr = context ? `\nContexto: ${context}` : '';
      prompt = buildFormatPrompt(format, audience) + indStr + topicStr + ctxStr;
    }

    const content = await generate(prompt, sys);
    const { rows } = await pool.query(
      'INSERT INTO content_history (user_id, business, format_type, input_data, output_text) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.user.id, 'styly', format || 'edit', JSON.stringify({ audience, topic, industry, context }), content]
    );
    res.json({ content, format, id: rows[0].id });
  } catch (e) {
    console.error('Error styly/generate:', e.message);
    res.status(500).json({ error: e.message });
  }
});

function buildFormatPrompt(format, audience) {
  const prompts = {
    reel_educativo: `Genera un guión para reel de Instagram/TikTok (30-60 seg) de STYLY con este formato:

HOOK (3 seg):
[frase que detenga el scroll, pregunta o dato impactante]

DESARROLLO (20 seg):
[indicaciones visuales entre corchetes]
[texto de narración con tips/errores/datos]

CTA (5 seg):
[indicación visual]
[texto CTA: agenda tu demo gratis en styly.mx]

📝 COPY INSTAGRAM (500 chars con emojis + hashtags):
[copy]

🎵 COPY TIKTOK (corto + muchos hashtags):
[copy]

📘 COPY FACEBOOK (más contexto):
[copy]

💼 COPY LINKEDIN (profesional):
[copy]

#️⃣ HASHTAGS:
[hashtags]`,

    carrusel_valor: `Genera un carrusel informativo de Instagram (4-5 slides) de STYLY:

📱 SLIDE 1 — Hook:
[título impactante antes/después o dato]

📱 SLIDE 2:
[título + contenido de valor]

📱 SLIDE 3:
[título + contenido de valor]

📱 SLIDE 4:
[título + contenido de valor]

📱 SLIDE 5 — CTA:
[CTA visual: styly.mx]

📝 COPY INSTAGRAM (500 chars):
[copy con CTA]

📘 COPY FACEBOOK:
[copy más largo]

💼 COPY LINKEDIN:
[tono profesional]

#️⃣ HASHTAGS:
[hashtags]`,

    caso_exito: `Genera un caso de éxito ficticio pero realista de un cliente STYLY:

🏪 NEGOCIO:
[tipo, nombre ficticio, ubicación]

😰 PROBLEMA:
[dolor específico del nicho: libreta, WhatsApp, citas perdidas]

💡 DESCUBRIMIENTO:
[cómo conoció Styly]

🚀 TRANSFORMACIÓN:
[features que usa y cómo cambiaron su operación]

📊 RESULTADOS:
[números: % más citas, ahorro de tiempo, ingresos extra]

💬 QUOTE:
["Testimonio ficticio del dueño"]

📝 COPY INSTAGRAM (500 chars):
[copy]

📘 COPY FACEBOOK:
[copy]

💼 COPY LINKEDIN:
[copy]

#️⃣ HASHTAGS:
[hashtags]`,

    post_feature: `Genera un post destacando una función específica de STYLY:

🎨 TEXTO PRINCIPAL (para diseño):
[texto impactante sobre el feature]

📄 EXPLICACIÓN:
[qué hace, cómo funciona, beneficio real]

💡 CASO DE USO POR NICHO:
[ejemplo concreto para la industria seleccionada]

📝 COPY INSTAGRAM (500 chars):
[copy con CTA demo]

📘 COPY FACEBOOK:
[copy]

💼 COPY LINKEDIN:
[copy profesional]

#️⃣ HASHTAGS:
[hashtags]`,

    inspiracional: `Genera un post inspiracional para dueños de negocios de belleza:

🎨 TEXTO PRINCIPAL (para diseño):
[dato impactante o reflexión motivacional sobre digitalización]

📝 COPY INSTAGRAM (500 chars):
[reflexión + CTA styly.mx]

📘 COPY FACEBOOK:
[copy más extenso]

💼 COPY LINKEDIN:
[tono profesional/datos]

#️⃣ HASHTAGS:
[hashtags]`,

    reclutamiento: `Genera contenido de reclutamiento para el programa Afiliadas Elite de STYLY:

🎨 TEXTO PRINCIPAL:
[mensaje empoderador con datos reales de comisiones]

📊 DATOS CLAVE:
- 50% del primer mes por cada local ($299.50)
- 15% residual mensual ($89.85/mes permanente)
- Sin inversión, sin horario
- Capacitación gratis (Styly Academy)
- Bonos: Plata $2,500 hasta Oráculo $300,000

📝 COPY INSTAGRAM (500 chars):
[copy motivacional + CTA styly.mx/afiliados]

🎵 COPY TIKTOK:
[copy corto + hashtags]

📘 COPY FACEBOOK:
[copy]

#️⃣ HASHTAGS:
[hashtags]`,

    exito_afiliadas: `Genera una historia de éxito ficticia pero basada en números reales de una Afiliada Elite de STYLY:

👩 PERFIL:
[nombre ficticio, contexto personal]

🚀 INICIO:
[cómo empezó, obstáculos iniciales]

📊 NÚMEROS:
[locales afiliados, ingreso mensual real calculado, rango en Millas Styly]

💬 QUOTE:
["Testimonio ficticio"]

📝 COPY INSTAGRAM (500 chars):
[copy + CTA styly.mx/afiliados]

🎵 COPY TIKTOK:
[copy corto]

📘 COPY FACEBOOK:
[copy]

#️⃣ HASHTAGS:
[hashtags]`,

    capacitacion: `Genera contenido de capacitación para Afiliadas Elite de STYLY:

📝 CONTENIDO PRINCIPAL:
[tip de ventas, técnica, estrategia basada en Styly Academy]

💡 EJEMPLO PRÁCTICO:
[situación real y cómo aplicar]

📝 COPY INSTAGRAM (500 chars):
[copy + CTA compartir con equipo]

🎵 COPY TIKTOK:
[copy corto]

📘 COPY FACEBOOK:
[copy]

#️⃣ HASHTAGS:
[hashtags]`
  };
  return prompts[format] || prompts.reel_educativo;
}

// ========== GENERATE SCRIPT ==========
router.post('/generate-script', async (req, res) => {
  try {
    const { type, industry, stage } = req.body;
    if (!type) return res.status(400).json({ error: 'Se requiere tipo de script' });
    const ind = industry || 'general';

    const scriptPrompts = {
      pitch: `Genera un pitch de 30 segundos para vender STYLY a un negocio de tipo: ${ind}

🎯 PITCH — ${ind}

APERTURA (5 seg):
[pregunta que identifique el dolor específico del nicho]

PROBLEMA (10 seg):
[dolor real de esa industria con ejemplo concreto]

SOLUCIÓN (10 seg):
[features de STYLY relevantes para ESE nicho]

CTA (5 seg):
[invitar a demo en styly.mx]`,

      objections: `Genera respuestas a las 6 objeciones más comunes al vender STYLY a: ${ind}

🛡️ OBJECIONES — ${ind}

❌ "Es muy caro / $599 es mucho"
✅ [respuesta con ROI real]

❌ "Ya uso WhatsApp / DM para agendar"
✅ [respuesta con diferenciador]

❌ "Mi libreta funciona bien"
✅ [respuesta con lo que pierden]

❌ "No tengo tiempo para aprender"
✅ [respuesta: se configura en 5 min]

❌ "Ya tengo otro sistema"
✅ [respuesta con diferenciador de Styly]

❌ "Mi negocio es muy pequeño"
✅ [respuesta: cada cliente cuenta más]`,

      whatsapp: `Genera una secuencia de mensajes de WhatsApp para vender STYLY a: ${ind}

📱 WHATSAPP — ${ind}

MENSAJE 1 (Introducción):
[natural, no robot, referencia al nicho]

MENSAJE 2 (Si responde interesado):
[beneficio específico para ${ind}]

MENSAJE 3 (Si no responde en 2 días):
[follow up sutil]

MENSAJE 4 (Cierre):
[oferta o urgencia + link styly.mx]`,

      email: `Genera un email de venta de STYLY para: ${ind}
Etapa: ${stage || 'first_contact'}

📧 EMAIL — ${stage || 'Primer contacto'} — ${ind}

ASUNTO:
[asunto atractivo]

CUERPO:
[email completo adaptado a la etapa e industria, natural, con CTA a styly.mx]`
    };

    const prompt = scriptPrompts[type] || scriptPrompts.pitch;
    const content = await generate(prompt, SYS_SCRIPTS);

    await pool.query(
      'INSERT INTO content_history (user_id, business, format_type, input_data, output_text) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'styly', `script_${type}`, JSON.stringify({ type, industry: ind, stage }), content]
    );

    res.json({ content, type });
  } catch (e) {
    console.error('Error styly/generate-script:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== CALCULATE COMMISSIONS (pure math, no AI) ==========
router.post('/calculate-commissions', (req, res) => {
  try {
    const { directLocales = 5, avgModulesPerLocale = 2, partners = 3 } = req.body;
    const dl = Math.max(0, Math.min(50, Number(directLocales)));
    const am = Math.max(0, Math.min(8, Number(avgModulesPerLocale)));
    const pt = Math.max(0, Math.min(20, Number(partners)));
    const avgAddon = 149;
    const corePrice = 599;

    const month1 = dl * corePrice * 0.50;
    const residualSaas = dl * corePrice * 0.15;
    const bonusUpsell = dl * am * avgAddon * 0.10;
    const networkIncome = pt * 3 * corePrice * 0.03;
    const monthlyRecurring = residualSaas + bonusUpsell + networkIncome;
    const annualProjected = month1 + (monthlyRecurring * 12);
    const monthlyMiles = (dl * 15) + (dl * am * 5) + (pt * 10);
    const annualMiles = monthlyMiles * 12;

    let rank = 'Sin rango', rankBonus = 0;
    if (annualMiles >= 12000) { rank = 'Oráculo'; rankBonus = 300000; }
    else if (annualMiles >= 6000) { rank = 'Leyenda'; rankBonus = 100000; }
    else if (annualMiles >= 2500) { rank = 'Shark'; rankBonus = 35000; }
    else if (annualMiles >= 1000) { rank = 'Oro'; rankBonus = 10000; }
    else if (annualMiles >= 200) { rank = 'Plata'; rankBonus = 2500; }

    const copaAnual = annualMiles >= 500;

    res.json({
      month1, residualSaas, bonusUpsell, networkIncome, monthlyRecurring,
      annualProjected, monthlyMiles, annualMiles, rank, rankBonus, copaAnual,
      inputs: { directLocales: dl, avgModulesPerLocale: am, partners: pt }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== IDEAS ==========
router.get('/ideas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ideas WHERE business = $1 ORDER BY created_at DESC LIMIT 100', ['styly']
    );
    res.json({ ideas: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ideas/generate', async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      "SELECT idea_text, format FROM ideas WHERE business = 'styly' AND created_at > NOW() - INTERVAL '4 weeks'"
    );
    const usedList = existing.map(i => `- ${i.idea_text} (${i.format})`).join('\n') || 'Ninguna';
    const now = new Date();
    const mes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][now.getMonth()];
    const año = now.getFullYear();

    const prompt = `Genera 4 ideas de contenido semanal para STYLY, software de gestión para negocios de belleza y bienestar ($599/mes). Balance: 60% clientes (dueños de estéticas, barberías, spas, etc) y 40% afiliadas elite (vendedoras por comisión). De 4 ideas, 2-3 deben ser para clientes y 1-2 para afiliadas. Formatos CLIENTES: reel_educativo, carrusel_valor, caso_exito, post_feature, inspiracional. Formatos AFILIADAS: reclutamiento, exito_afiliadas, capacitacion. Estamos en ${mes} ${año}. NO repitas: ${usedList}\n\nResponde SOLO con JSON válido:\n{"ideas":[{"idea":"descripción de la idea","format":"formato_id","audience":"clients|affiliates","industry_focus":"industria específica o null"}]}`;

    const txt = await generate(prompt, SYS_CLIENTS);
    const start = txt.indexOf('{'), end = txt.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No se pudo parsear respuesta');
    const parsed = JSON.parse(txt.substring(start, end + 1));
    if (!parsed.ideas) throw new Error('Formato inválido');

    const saved = [];
    for (const idea of parsed.ideas.slice(0, 4)) {
      const { rows } = await pool.query(
        'INSERT INTO ideas (business, idea_text, format, season_relevance) VALUES ($1, $2, $3, $4) RETURNING *',
        ['styly', idea.idea, idea.format, idea.audience || null]
      );
      saved.push({ ...rows[0], audience: idea.audience, industry_focus: idea.industry_focus });
    }
    res.json({ ideas: saved });
  } catch (e) {
    console.error('Error styly/ideas/generate:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put('/ideas/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['used', 'discarded'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const extra = status === 'used' ? ', used_at = NOW()' : '';
    const { rows } = await pool.query(
      `UPDATE ideas SET status = $1${extra} WHERE id = $2 AND business = 'styly' RETURNING *`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    res.json({ idea: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== HISTORY ==========
router.get('/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ch.id, ch.format_type, ch.status, ch.scheduled_date, ch.scheduled_platform, ch.notes, ch.created_at,
              LEFT(ch.output_text, 200) as preview, ch.input_data, u.name as user_name
       FROM content_history ch LEFT JOIN users u ON ch.user_id = u.id
       WHERE ch.business = 'styly' ORDER BY ch.created_at DESC LIMIT 100`
    );
    res.json({ history: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/history/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ch.*, u.name as user_name FROM content_history ch LEFT JOIN users u ON ch.user_id = u.id WHERE ch.id = $1 AND ch.business = 'styly'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ item: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/history/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM content_history WHERE id = $1 AND user_id = $2 AND business = $3', [req.params.id, req.user.id, 'styly']);
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
      [ids, req.user.id, 'styly']
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== CALENDAR ==========
router.get('/calendar', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start y end requeridos' });
    const { rows } = await pool.query(
      `SELECT id, format_type, status, scheduled_date, scheduled_platform, notes, input_data, LEFT(output_text, 100) as preview
       FROM content_history WHERE business = 'styly' AND status = 'approved' AND scheduled_date >= $1 AND scheduled_date <= $2
       ORDER BY scheduled_date ASC`, [start, end + ' 23:59:59']
    );
    res.json({ items: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== APPROVE ==========
router.post('/approve', async (req, res) => {
  try {
    const { content_id, scheduled_date, scheduled_time, scheduled_platform, notes } = req.body;
    if (!content_id || !scheduled_date) return res.status(400).json({ error: 'content_id y scheduled_date requeridos' });
    const dt = scheduled_time ? `${scheduled_date} ${scheduled_time}` : scheduled_date;
    const { rows } = await pool.query(
      `UPDATE content_history SET status = 'approved', scheduled_date = $1, scheduled_platform = $2, notes = $3
       WHERE id = $4 AND business = 'styly' RETURNING *`,
      [dt, scheduled_platform || 'instagram', notes || null, content_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ item: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== STYLY PROJECTS ==========
router.get('/projects', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre AS name, descripcion AS description, color, estado, propietario_id, equipo_id, fecha_inicio, fecha_fin, permisos, order_index, created_at FROM styly_projects ORDER BY order_index ASC'
    );
    res.json({ projects: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/projects', async (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows } = await pool.query(
      'INSERT INTO styly_projects (nombre, descripcion, color, order_index) VALUES ($1, $2, $3, (SELECT COALESCE(MAX(order_index), 0) + 1 FROM styly_projects)) RETURNING id, nombre AS name, descripcion AS description, color, estado, order_index, created_at',
      [name, description || null, color || '#3B82F6']
    );
    res.json({ project: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const { rows: projectRows } = await pool.query(
      'SELECT COUNT(*) as task_count FROM styly_tasks WHERE proyecto_id = $1',
      [req.params.id]
    );
    const taskCount = parseInt(projectRows[0].task_count);
    if (taskCount > 0) {
      return res.status(400).json({ error: `No se puede eliminar. El proyecto tiene ${taskCount} tarea(s). Elimina las tareas primero.` });
    }
    const { rowCount } = await pool.query(
      'DELETE FROM styly_projects WHERE id = $1',
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== STYLY TASKS ANALYTICS (for Dashboard) ==========
router.get('/tasks/analytics', async (req, res) => {
  try {
    const [tasksR, projR, asignadosR] = await Promise.all([
      pool.query(
        `SELECT t.*, p.nombre as proyecto_nombre, p.color as proyecto_color
         FROM styly_tasks t LEFT JOIN styly_projects p ON t.proyecto_id = p.id
         ORDER BY t.prioridad DESC, t.task_id ASC`
      ),
      pool.query('SELECT * FROM styly_projects ORDER BY order_index ASC'),
      pool.query(
        `SELECT ta.task_id, u.name FROM styly_task_asignados ta JOIN users u ON ta.user_id = u.id`
      )
    ]);

    const allTasks = tasksR.rows;
    const projects = projR.rows;

    // Map asignados to tasks
    const asignadosMap = {};
    asignadosR.rows.forEach(a => {
      if (!asignadosMap[a.task_id]) asignadosMap[a.task_id] = [];
      asignadosMap[a.task_id].push(a.name);
    });

    // Overall stats
    const stats = {
      total: allTasks.length,
      pendiente: allTasks.filter(t => (t.estado || '').toLowerCase() === 'pendiente').length,
      enProgreso: allTasks.filter(t => (t.estado || '').toLowerCase() === 'en progreso').length,
      completada: allTasks.filter(t => (t.estado || '').toLowerCase() === 'completada').length
    };
    stats.completionRate = stats.total > 0 ? Math.round((stats.completada / stats.total) * 100) : 0;

    // By priority
    const byPriority = { alta: { total: 0, done: 0 }, media: { total: 0, done: 0 }, baja: { total: 0, done: 0 } };
    allTasks.forEach(t => {
      const p = (t.prioridad || 'media').toLowerCase();
      if (byPriority[p]) {
        byPriority[p].total++;
        if ((t.estado || '').toLowerCase() === 'completada') byPriority[p].done++;
      }
    });

    // By user (from asignados)
    const byUser = {};
    allTasks.forEach(t => {
      const users = asignadosMap[t.id] || ['Sin asignar'];
      users.forEach(u => {
        if (!byUser[u]) byUser[u] = { total: 0, pendiente: 0, enProgreso: 0, completada: 0 };
        byUser[u].total++;
        const s = (t.estado || '').toLowerCase();
        if (s === 'pendiente') byUser[u].pendiente++;
        else if (s === 'en progreso') byUser[u].enProgreso++;
        else if (s === 'completada') byUser[u].completada++;
      });
    });

    // By project
    const byProject = {};
    projects.forEach(p => {
      byProject[p.nombre] = { id: p.id, color: p.color, total: 0, pendiente: 0, completada: 0, completion: 0 };
    });
    allTasks.forEach(t => {
      const pn = t.proyecto_nombre || 'Sin proyecto';
      if (!byProject[pn]) byProject[pn] = { total: 0, pendiente: 0, completada: 0, completion: 0 };
      byProject[pn].total++;
      const s = (t.estado || '').toLowerCase();
      if (s === 'pendiente') byProject[pn].pendiente++;
      if (s === 'completada') byProject[pn].completada++;
    });
    Object.values(byProject).forEach(p => {
      p.completion = p.total > 0 ? Math.round((p.completada / p.total) * 100) : 0;
    });

    // High priority pending tasks
    const urgent = allTasks
      .filter(t => (t.prioridad || '').toLowerCase() === 'alta' && (t.estado || '').toLowerCase() !== 'completada')
      .map(t => ({ id: t.id, task_id: t.task_id, description: t.titulo, module: t.seccion, assigned_to: (asignadosMap[t.id]||[]).join(', ') || null, status: t.estado, project: t.proyecto_nombre }));

    // Recently updated
    const recentlyUpdated = allTasks
      .filter(t => t.updated_at)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5)
      .map(t => ({ task_id: t.task_id, description: t.titulo, status: t.estado, assigned_to: (asignadosMap[t.id]||[]).join(', ') || null, updated_at: t.updated_at }));

    res.json({ stats, byPriority, byUser, byProject, urgent, recentlyUpdated, projects });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== STYLY TASKS (NEW SCHEMA) ==========
router.get('/tasks', async (req, res) => {
  try {
    // Get all tasks with related data
    const { rows: tasks } = await pool.query(`
      SELECT t.*,
        p.nombre as proyecto_nombre, p.color as proyecto_color,
        u.name as creador_nombre,
        (SELECT COUNT(*) FROM styly_subtasks WHERE parent_task_id = t.id) as subtasks_count,
        (SELECT COUNT(*) FROM styly_comentarios WHERE task_id = t.id) as comentarios_count
      FROM styly_tasks t
      LEFT JOIN styly_projects p ON t.proyecto_id = p.id
      LEFT JOIN users u ON t.creado_por = u.id
      ORDER BY t.position ASC, t.created_at DESC
    `);

    // Get asignados for all tasks
    const { rows: asignados } = await pool.query(`
      SELECT ta.task_id, u.id, u.name, u.email, u.avatar
      FROM styly_task_asignados ta
      JOIN users u ON ta.user_id = u.id
    `);

    // Get observadores for all tasks
    const { rows: observadores } = await pool.query(`
      SELECT tobs.task_id, u.id, u.name, u.email, u.avatar
      FROM styly_task_observadores tobs
      JOIN users u ON tobs.user_id = u.id
    `);

    // Group asignados and observadores by task_id
    const tasksWithRelations = tasks.map(t => ({
      ...t,
      asignados: asignados.filter(a => a.task_id === t.id),
      observadores: observadores.filter(o => o.task_id === t.id)
    }));

    res.json({ tasks: tasksWithRelations });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, avatar, styly_role_id FROM users WHERE activo = true ORDER BY name ASC'
    );
    res.json({ users: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
    }

    const hash = await bcrypt.hash(password, 10);

    // Get Developer role ID
    const { rows: roleRows } = await pool.query(
      "SELECT id FROM styly_roles WHERE nombre = 'Developer' LIMIT 1"
    );
    const roleId = roleRows.length > 0 ? roleRows[0].id : null;

    // Create user with status = 'active' and Developer role
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, status, activo, styly_role_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, avatar, styly_role_id',
      [name, email, hash, 'editor', 'active', true, roleId]
    );

    res.json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email ya registrado' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const { task_id, titulo, descripcion, proyecto_id, seccion, prioridad, asignados, fecha_inicio, fecha_vencimiento } = req.body;
    if (!task_id || !titulo) return res.status(400).json({ error: 'Faltan campos requeridos' });

    // Create task
    const { rows } = await pool.query(
      'INSERT INTO styly_tasks (task_id, titulo, descripcion, proyecto_id, seccion, prioridad, estado, creado_por, fecha_inicio, fecha_vencimiento) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [task_id, titulo, descripcion || null, proyecto_id || null, seccion || null, prioridad || 'Media', 'Pendiente', req.user.id, fecha_inicio || null, fecha_vencimiento || null]
    );

    const newTask = rows[0];

    // Add asignados if provided
    if (asignados && Array.isArray(asignados) && asignados.length > 0) {
      for (const userId of asignados) {
        await pool.query(
          'INSERT INTO styly_task_asignados (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [newTask.id, userId]
        );
      }
    }

    res.json({ task: newTask });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    const { titulo, descripcion, estado, prioridad, proyecto_id, seccion, progreso, fecha_inicio, fecha_vencimiento, position, etiquetas } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (titulo !== undefined) { updates.push(`titulo = $${paramCount++}`); params.push(titulo); }
    if (descripcion !== undefined) { updates.push(`descripcion = $${paramCount++}`); params.push(descripcion); }
    if (estado !== undefined) { updates.push(`estado = $${paramCount++}`); params.push(estado); }
    if (prioridad !== undefined) { updates.push(`prioridad = $${paramCount++}`); params.push(prioridad); }
    if (proyecto_id !== undefined) { updates.push(`proyecto_id = $${paramCount++}`); params.push(proyecto_id); }
    if (seccion !== undefined) { updates.push(`seccion = $${paramCount++}`); params.push(seccion); }
    if (progreso !== undefined) { updates.push(`progreso = $${paramCount++}`); params.push(progreso); }
    if (fecha_inicio !== undefined) { updates.push(`fecha_inicio = $${paramCount++}`); params.push(fecha_inicio); }
    if (fecha_vencimiento !== undefined) { updates.push(`fecha_vencimiento = $${paramCount++}`); params.push(fecha_vencimiento); }
    if (position !== undefined) { updates.push(`position = $${paramCount++}`); params.push(position); }
    if (etiquetas !== undefined) { updates.push(`etiquetas = $${paramCount++}`); params.push(JSON.stringify(etiquetas)); }

    if (!updates.length) return res.status(400).json({ error: 'No hay campos para actualizar' });

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE styly_tasks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (!rows.length) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ task: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM styly_tasks WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk update for drag-and-drop operations
router.post('/tasks/bulk-update', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'Se requiere array de updates' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const u of updates) {
        await client.query(
          'UPDATE styly_tasks SET status = $1, position = $2, updated_at = NOW() WHERE id = $3',
          [u.status, u.position || 0, u.id]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true, updated: updates.length });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Clear all tasks (admin only)
router.delete('/tasks/all', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM styly_tasks');
    await pool.query('ALTER SEQUENCE styly_tasks_id_seq RESTART WITH 1');
    res.json({ ok: true, deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== NEW SYSTEM: ROLES ==========
router.get('/roles', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM styly_roles ORDER BY nombre ASC');
    res.json({ roles: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/roles/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM styly_roles WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Rol no encontrado' });
    res.json({ role: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/roles', async (req, res) => {
  try {
    const { nombre, permisos } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows } = await pool.query(
      'INSERT INTO styly_roles (nombre, permisos) VALUES ($1, $2) RETURNING *',
      [nombre, JSON.stringify(permisos || {})]
    );
    res.json({ role: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/roles/:id', async (req, res) => {
  try {
    const { nombre, permisos } = req.body;
    const updates = [];
    const params = [];
    let count = 1;

    if (nombre !== undefined) { updates.push(`nombre = $${count++}`); params.push(nombre); }
    if (permisos !== undefined) { updates.push(`permisos = $${count++}`); params.push(JSON.stringify(permisos)); }

    if (!updates.length) return res.status(400).json({ error: 'No hay campos para actualizar' });
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE styly_roles SET ${updates.join(', ')} WHERE id = $${count} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Rol no encontrado' });
    res.json({ role: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/roles/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM styly_roles WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Rol no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== NEW SYSTEM: EQUIPOS ==========
router.get('/equipos', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.*,
        u.name as lider_nombre,
        (SELECT COUNT(*) FROM styly_equipo_miembros WHERE equipo_id = e.id) as miembros_count
      FROM styly_equipos e
      LEFT JOIN users u ON e.lider_id = u.id
      ORDER BY e.nombre ASC
    `);
    res.json({ equipos: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/equipos/:id', async (req, res) => {
  try {
    const { rows: equipo } = await pool.query(`
      SELECT e.*, u.name as lider_nombre
      FROM styly_equipos e
      LEFT JOIN users u ON e.lider_id = u.id
      WHERE e.id = $1
    `, [req.params.id]);

    if (!equipo.length) return res.status(404).json({ error: 'Equipo no encontrado' });

    const { rows: miembros } = await pool.query(`
      SELECT u.id, u.name, u.email, u.avatar
      FROM styly_equipo_miembros em
      JOIN users u ON em.user_id = u.id
      WHERE em.equipo_id = $1
    `, [req.params.id]);

    res.json({ equipo: { ...equipo[0], miembros } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/equipos', async (req, res) => {
  try {
    const { nombre, descripcion, lider_id } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows } = await pool.query(
      'INSERT INTO styly_equipos (nombre, descripcion, lider_id) VALUES ($1, $2, $3) RETURNING *',
      [nombre, descripcion || null, lider_id || null]
    );
    res.json({ equipo: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/equipos/:id', async (req, res) => {
  try {
    const { nombre, descripcion, lider_id } = req.body;
    const updates = [];
    const params = [];
    let count = 1;

    if (nombre !== undefined) { updates.push(`nombre = $${count++}`); params.push(nombre); }
    if (descripcion !== undefined) { updates.push(`descripcion = $${count++}`); params.push(descripcion); }
    if (lider_id !== undefined) { updates.push(`lider_id = $${count++}`); params.push(lider_id); }

    if (!updates.length) return res.status(400).json({ error: 'No hay campos para actualizar' });
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE styly_equipos SET ${updates.join(', ')} WHERE id = $${count} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Equipo no encontrado' });
    res.json({ equipo: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/equipos/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM styly_equipos WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Equipo no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Agregar miembro a equipo
router.post('/equipos/:id/miembros', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id requerido' });
    await pool.query(
      'INSERT INTO styly_equipo_miembros (equipo_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, user_id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Remover miembro de equipo
router.delete('/equipos/:id/miembros/:userId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM styly_equipo_miembros WHERE equipo_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== NEW SYSTEM: ASIGNADOS Y OBSERVADORES ==========
// Agregar asignado a tarea
router.post('/tasks/:taskId/asignados', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id requerido' });
    await pool.query(
      'INSERT INTO styly_task_asignados (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.taskId, user_id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Remover asignado de tarea
router.delete('/tasks/:taskId/asignados/:userId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM styly_task_asignados WHERE task_id = $1 AND user_id = $2',
      [req.params.taskId, req.params.userId]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Agregar observador a tarea
router.post('/tasks/:taskId/observadores', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id requerido' });
    await pool.query(
      'INSERT INTO styly_task_observadores (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.taskId, user_id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Remover observador de tarea
router.delete('/tasks/:taskId/observadores/:userId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM styly_task_observadores WHERE task_id = $1 AND user_id = $2',
      [req.params.taskId, req.params.userId]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== NEW SYSTEM: SUBTAREAS ==========
router.get('/tasks/:taskId/subtasks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM styly_subtasks WHERE parent_task_id = $1 ORDER BY order_index ASC',
      [req.params.taskId]
    );
    res.json({ subtasks: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tasks/:taskId/subtasks', async (req, res) => {
  try {
    const { titulo, order_index } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
    const { rows } = await pool.query(
      'INSERT INTO styly_subtasks (parent_task_id, titulo, order_index) VALUES ($1, $2, $3) RETURNING *',
      [req.params.taskId, titulo, order_index || 0]
    );
    res.json({ subtask: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/subtasks/:id', async (req, res) => {
  try {
    const { titulo, completada, order_index } = req.body;
    const updates = [];
    const params = [];
    let count = 1;

    if (titulo !== undefined) { updates.push(`titulo = $${count++}`); params.push(titulo); }
    if (completada !== undefined) { updates.push(`completada = $${count++}`); params.push(completada); }
    if (order_index !== undefined) { updates.push(`order_index = $${count++}`); params.push(order_index); }

    if (!updates.length) return res.status(400).json({ error: 'No hay campos para actualizar' });
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE styly_subtasks SET ${updates.join(', ')} WHERE id = $${count} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Subtarea no encontrada' });
    res.json({ subtask: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/subtasks/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM styly_subtasks WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Subtarea no encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== NEW SYSTEM: COMENTARIOS ==========
router.get('/tasks/:taskId/comentarios', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, u.name as usuario_nombre, u.avatar as usuario_avatar
      FROM styly_comentarios c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.task_id = $1
      ORDER BY c.created_at DESC
    `, [req.params.taskId]);
    res.json({ comentarios: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tasks/:taskId/comentarios', async (req, res) => {
  try {
    const { contenido, archivos } = req.body;
    if (!contenido) return res.status(400).json({ error: 'Contenido requerido' });
    const { rows } = await pool.query(
      'INSERT INTO styly_comentarios (task_id, user_id, contenido, archivos) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.taskId, req.user.id, contenido, JSON.stringify(archivos || [])]
    );
    res.json({ comentario: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/comentarios/:id', async (req, res) => {
  try {
    const { contenido } = req.body;
    if (!contenido) return res.status(400).json({ error: 'Contenido requerido' });
    const { rows } = await pool.query(
      'UPDATE styly_comentarios SET contenido = $1, editado_en = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [contenido, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Comentario no encontrado o sin permisos' });
    res.json({ comentario: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/comentarios/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM styly_comentarios WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Comentario no encontrado o sin permisos' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
