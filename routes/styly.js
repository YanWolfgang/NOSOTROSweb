const express = require('express');
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
      'SELECT * FROM styly_projects ORDER BY order_index ASC'
    );
    res.json({ projects: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/projects', async (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows } = await pool.query(
      'INSERT INTO styly_projects (name, description, color, order_index) VALUES ($1, $2, $3, (SELECT COALESCE(MAX(order_index), 0) + 1 FROM styly_projects)) RETURNING *',
      [name, description || null, color || '#3B82F6']
    );
    res.json({ project: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== STYLY TASKS ANALYTICS (for Dashboard) ==========
router.get('/tasks/analytics', async (req, res) => {
  try {
    const [tasksR, projR] = await Promise.all([
      pool.query(
        `SELECT t.*, p.name as project_name, p.color as project_color
         FROM styly_tasks t LEFT JOIN styly_projects p ON t.project_id = p.id
         ORDER BY t.priority DESC, t.task_id ASC`
      ),
      pool.query('SELECT * FROM styly_projects ORDER BY order_index ASC')
    ]);

    const allTasks = tasksR.rows;
    const projects = projR.rows;

    // Overall stats
    const stats = {
      total: allTasks.length,
      pendiente: allTasks.filter(t => (t.status || '').toLowerCase() === 'pendiente').length,
      enProgreso: allTasks.filter(t => (t.status || '').toLowerCase() === 'en progreso').length,
      completada: allTasks.filter(t => (t.status || '').toLowerCase() === 'completada').length
    };
    stats.completionRate = stats.total > 0 ? Math.round((stats.completada / stats.total) * 100) : 0;

    // By priority
    const byPriority = { alta: { total: 0, done: 0 }, media: { total: 0, done: 0 }, baja: { total: 0, done: 0 } };
    allTasks.forEach(t => {
      const p = (t.priority || 'media').toLowerCase();
      if (byPriority[p]) {
        byPriority[p].total++;
        if ((t.status || '').toLowerCase() === 'completada') byPriority[p].done++;
      }
    });

    // By user
    const byUser = {};
    allTasks.forEach(t => {
      const u = t.assigned_to || 'Sin asignar';
      if (!byUser[u]) byUser[u] = { total: 0, pendiente: 0, enProgreso: 0, completada: 0 };
      byUser[u].total++;
      const s = (t.status || '').toLowerCase();
      if (s === 'pendiente') byUser[u].pendiente++;
      else if (s === 'en progreso') byUser[u].enProgreso++;
      else if (s === 'completada') byUser[u].completada++;
    });

    // By project
    const byProject = {};
    projects.forEach(p => {
      byProject[p.name] = { id: p.id, color: p.color, total: 0, pendiente: 0, completada: 0, completion: 0 };
    });
    allTasks.forEach(t => {
      const pn = t.project_name || 'Sin proyecto';
      if (!byProject[pn]) byProject[pn] = { total: 0, pendiente: 0, completada: 0, completion: 0 };
      byProject[pn].total++;
      const s = (t.status || '').toLowerCase();
      if (s === 'pendiente') byProject[pn].pendiente++;
      if (s === 'completada') byProject[pn].completada++;
    });
    Object.values(byProject).forEach(p => {
      p.completion = p.total > 0 ? Math.round((p.completada / p.total) * 100) : 0;
    });

    // High priority pending tasks
    const urgent = allTasks
      .filter(t => (t.priority || '').toLowerCase() === 'alta' && (t.status || '').toLowerCase() !== 'completada')
      .map(t => ({ id: t.id, task_id: t.task_id, description: t.description, module: t.module, assigned_to: t.assigned_to, status: t.status, project: t.project_name }));

    // Recently updated
    const recentlyUpdated = allTasks
      .filter(t => t.updated_at)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5)
      .map(t => ({ task_id: t.task_id, description: t.description, status: t.status, assigned_to: t.assigned_to, updated_at: t.updated_at }));

    res.json({ stats, byPriority, byUser, byProject, urgent, recentlyUpdated, projects });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== STYLY TASKS ==========
router.get('/tasks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM styly_tasks ORDER BY priority DESC, task_id ASC'
    );
    res.json({ tasks: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email FROM users ORDER BY name ASC'
    );
    res.json({ users: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tasks', async (req, res) => {
  try {
    const { task_id, project_id, module, description, priority, assigned_to } = req.body;
    if (!task_id || !module || !description) return res.status(400).json({ error: 'Faltan campos requeridos' });

    const { rows } = await pool.query(
      'INSERT INTO styly_tasks (task_id, project_id, module, description, priority, assigned_to, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [task_id, project_id || null, module, description, priority || 'media', assigned_to || null, 'pendiente']
    );
    res.json({ task: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    const { status, assigned_to, priority } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      params.push(status);
    }
    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${paramCount++}`);
      params.push(assigned_to);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramCount++}`);
      params.push(priority);
    }

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

module.exports = router;
