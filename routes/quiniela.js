const express = require('express');
const { verifyToken, requireBusiness } = require('../middleware/auth');
const { pool } = require('../db/database');
const router = express.Router();

router.use(verifyToken, requireBusiness('duelazo'));

const SPORTS_KEY = process.env.API_SPORTS_KEY;
const API_HEADERS = { 'x-apisports-key': SPORTS_KEY };

// ========== CREAR QUINIELA ==========
router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion, deporte, fecha_limite, partidos } = req.body;
    if (!nombre || !partidos || !partidos.length) {
      return res.status(400).json({ error: 'Nombre y partidos son requeridos' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO quinielas (nombre, descripcion, creador_id, deporte, fecha_limite)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nombre, descripcion || null, req.user.id, deporte || 'football', fecha_limite || null]
      );
      const quiniela = rows[0];

      // Insertar partidos
      for (const p of partidos) {
        await client.query(
          `INSERT INTO quiniela_partidos (quiniela_id, fixture_id, deporte, equipo_local, equipo_visitante, logo_local, logo_visitante, liga, fecha_partido)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [quiniela.id, p.fixture_id, deporte || 'football', p.equipo_local, p.equipo_visitante, p.logo_local || null, p.logo_visitante || null, p.liga || null, p.fecha_partido || null]
        );
      }

      // Agregar al creador como participante
      await client.query(
        `INSERT INTO quiniela_participantes (quiniela_id, user_id) VALUES ($1, $2)`,
        [quiniela.id, req.user.id]
      );

      await client.query('COMMIT');
      res.json({ quiniela });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('Error creando quiniela:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== LISTAR QUINIELAS ==========
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT q.*, u.name as creador_nombre,
        (SELECT COUNT(*) FROM quiniela_participantes WHERE quiniela_id = q.id) as participantes,
        (SELECT COUNT(*) FROM quiniela_partidos WHERE quiniela_id = q.id) as total_partidos,
        EXISTS(SELECT 1 FROM quiniela_participantes WHERE quiniela_id = q.id AND user_id = $1) as ya_unido
      FROM quinielas q
      LEFT JOIN users u ON q.creador_id = u.id
      ORDER BY q.created_at DESC
    `, [req.user.id]);
    res.json({ quinielas: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== DETALLE QUINIELA ==========
router.get('/:id', async (req, res) => {
  try {
    const { rows: qRows } = await pool.query(`
      SELECT q.*, u.name as creador_nombre
      FROM quinielas q LEFT JOIN users u ON q.creador_id = u.id
      WHERE q.id = $1
    `, [req.params.id]);
    if (!qRows.length) return res.status(404).json({ error: 'Quiniela no encontrada' });
    const quiniela = qRows[0];

    // Partidos
    const { rows: partidos } = await pool.query(
      'SELECT * FROM quiniela_partidos WHERE quiniela_id = $1 ORDER BY fecha_partido ASC, id ASC',
      [quiniela.id]
    );

    // Participantes con puntos
    const { rows: participantes } = await pool.query(`
      SELECT qp.*, u.name as nombre
      FROM quiniela_participantes qp
      LEFT JOIN users u ON qp.user_id = u.id
      WHERE qp.quiniela_id = $1
      ORDER BY qp.puntos_total DESC, qp.joined_at ASC
    `, [quiniela.id]);

    // Predicciones del usuario actual
    const { rows: misPreds } = await pool.query(
      'SELECT partido_id, prediccion, correcta FROM quiniela_predicciones WHERE quiniela_id = $1 AND user_id = $2',
      [quiniela.id, req.user.id]
    );

    const yaUnido = participantes.some(p => p.user_id === req.user.id);

    res.json({ quiniela, partidos, participantes, predicciones: misPreds, ya_unido: yaUnido });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== UNIRSE A QUINIELA ==========
router.post('/:id/unirse', async (req, res) => {
  try {
    const { rows: qRows } = await pool.query('SELECT estado FROM quinielas WHERE id = $1', [req.params.id]);
    if (!qRows.length) return res.status(404).json({ error: 'Quiniela no encontrada' });
    if (qRows[0].estado !== 'abierta') return res.status(400).json({ error: 'La quiniela ya no acepta participantes' });

    await pool.query(
      `INSERT INTO quiniela_participantes (quiniela_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== GUARDAR PREDICCIONES ==========
router.post('/:id/predicciones', async (req, res) => {
  try {
    const { predicciones } = req.body; // [{partido_id, prediccion}]
    if (!predicciones || !predicciones.length) {
      return res.status(400).json({ error: 'Predicciones requeridas' });
    }

    const { rows: qRows } = await pool.query('SELECT estado, fecha_limite FROM quinielas WHERE id = $1', [req.params.id]);
    if (!qRows.length) return res.status(404).json({ error: 'Quiniela no encontrada' });
    if (qRows[0].estado === 'finalizada') return res.status(400).json({ error: 'La quiniela ya finalizó' });
    if (qRows[0].fecha_limite && new Date(qRows[0].fecha_limite) < new Date()) {
      return res.status(400).json({ error: 'Se pasó la fecha límite para predicciones' });
    }

    // Verificar que es participante
    const { rows: partRows } = await pool.query(
      'SELECT id FROM quiniela_participantes WHERE quiniela_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!partRows.length) return res.status(400).json({ error: 'No eres participante de esta quiniela' });

    const validPreds = ['local', 'empate', 'visitante'];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of predicciones) {
        if (!validPreds.includes(p.prediccion)) continue;
        // Solo permitir predicción si el partido no ha comenzado
        const { rows: matchRows } = await client.query(
          'SELECT estado FROM quiniela_partidos WHERE id = $1 AND quiniela_id = $2',
          [p.partido_id, req.params.id]
        );
        if (!matchRows.length || matchRows[0].estado !== 'pendiente') continue;

        await client.query(
          `INSERT INTO quiniela_predicciones (quiniela_id, partido_id, user_id, prediccion)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (partido_id, user_id) DO UPDATE SET prediccion = $4, created_at = NOW()`,
          [req.params.id, p.partido_id, req.user.id, p.prediccion]
        );
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ACTUALIZAR RESULTADOS (desde API-Sports) ==========
router.post('/:id/actualizar', async (req, res) => {
  try {
    const { rows: qRows } = await pool.query('SELECT * FROM quinielas WHERE id = $1', [req.params.id]);
    if (!qRows.length) return res.status(404).json({ error: 'Quiniela no encontrada' });
    // Solo el creador o admin puede actualizar
    if (qRows[0].creador_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el creador puede actualizar resultados' });
    }

    const { rows: partidos } = await pool.query(
      'SELECT * FROM quiniela_partidos WHERE quiniela_id = $1',
      [req.params.id]
    );

    const deporte = qRows[0].deporte || 'football';
    let actualizados = 0;

    for (const partido of partidos) {
      if (partido.estado === 'finalizado') continue;
      try {
        const sportCfg = {
          football: { base: 'https://v3.football.api-sports.io', path: '/fixtures', param: 'id' },
          basketball: { base: 'https://v1.basketball.api-sports.io', path: '/games', param: 'id' },
          baseball: { base: 'https://v1.baseball.api-sports.io', path: '/games', param: 'id' }
        };
        const cfg = sportCfg[deporte] || sportCfg.football;
        const r = await fetch(`${cfg.base}${cfg.path}?${cfg.param}=${partido.fixture_id}`, { headers: API_HEADERS });
        const data = await r.json();
        const fx = (data.response || [])[0];
        if (!fx) continue;

        let golesLocal, golesVisitante, estado;
        if (deporte === 'football') {
          golesLocal = fx.goals?.home;
          golesVisitante = fx.goals?.away;
          const st = fx.fixture?.status?.short;
          estado = (st === 'FT' || st === 'AET' || st === 'PEN') ? 'finalizado' :
                   (st === '1H' || st === '2H' || st === 'HT' || st === 'ET' || st === 'LIVE') ? 'en_juego' : 'pendiente';
        } else {
          golesLocal = fx.scores?.home?.total;
          golesVisitante = fx.scores?.away?.total;
          const st = fx.status?.short;
          estado = (st === 'FT' || st === 'AOT') ? 'finalizado' :
                   (st === 'Q1' || st === 'Q2' || st === 'Q3' || st === 'Q4' || st === 'HT' || st === 'LIVE') ? 'en_juego' : 'pendiente';
        }

        if (golesLocal !== null && golesLocal !== undefined) {
          await pool.query(
            `UPDATE quiniela_partidos SET goles_local = $1, goles_visitante = $2, estado = $3 WHERE id = $4`,
            [golesLocal, golesVisitante, estado, partido.id]
          );
          actualizados++;
        }
      } catch (err) {
        console.error(`Error actualizando partido ${partido.fixture_id}:`, err.message);
      }
    }

    // Recalcular puntos
    await recalcularPuntos(req.params.id);

    // Verificar si todos los partidos finalizaron
    const { rows: pendientes } = await pool.query(
      "SELECT COUNT(*) as count FROM quiniela_partidos WHERE quiniela_id = $1 AND estado != 'finalizado'",
      [req.params.id]
    );
    if (parseInt(pendientes[0].count) === 0) {
      await pool.query("UPDATE quinielas SET estado = 'finalizada' WHERE id = $1", [req.params.id]);
    }

    res.json({ ok: true, actualizados });
  } catch (e) {
    console.error('Error actualizando resultados:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== CERRAR QUINIELA (no más predicciones) ==========
router.post('/:id/cerrar', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT creador_id FROM quinielas WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Quiniela no encontrada' });
    if (rows[0].creador_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el creador puede cerrar la quiniela' });
    }
    await pool.query("UPDATE quinielas SET estado = 'cerrada' WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ELIMINAR QUINIELA ==========
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT creador_id FROM quinielas WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Quiniela no encontrada' });
    if (rows[0].creador_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo el creador puede eliminar la quiniela' });
    }
    await pool.query('DELETE FROM quinielas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== TABLA DE POSICIONES ==========
router.get('/:id/tabla', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT qp.user_id, u.name as nombre, qp.puntos_total,
        (SELECT COUNT(*) FROM quiniela_predicciones WHERE quiniela_id = $1 AND user_id = qp.user_id AND correcta = true) as aciertos,
        (SELECT COUNT(*) FROM quiniela_predicciones WHERE quiniela_id = $1 AND user_id = qp.user_id AND correcta IS NOT NULL) as respondidos
      FROM quiniela_participantes qp
      LEFT JOIN users u ON qp.user_id = u.id
      WHERE qp.quiniela_id = $1
      ORDER BY qp.puntos_total DESC, aciertos DESC, qp.joined_at ASC
    `, [req.params.id]);
    res.json({ tabla: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== HELPER: Recalcular puntos ==========
async function recalcularPuntos(quinielaId) {
  // Obtener partidos finalizados
  const { rows: partidos } = await pool.query(
    "SELECT id, goles_local, goles_visitante FROM quiniela_partidos WHERE quiniela_id = $1 AND estado = 'finalizado'",
    [quinielaId]
  );

  // Para cada partido, determinar resultado y marcar predicciones
  for (const partido of partidos) {
    let resultado;
    if (partido.goles_local > partido.goles_visitante) resultado = 'local';
    else if (partido.goles_local < partido.goles_visitante) resultado = 'visitante';
    else resultado = 'empate';

    // Marcar correctas/incorrectas
    await pool.query(
      `UPDATE quiniela_predicciones SET correcta = (prediccion = $1) WHERE partido_id = $2`,
      [resultado, partido.id]
    );
  }

  // Recalcular puntos por participante
  const { rows: participantes } = await pool.query(
    'SELECT user_id FROM quiniela_participantes WHERE quiniela_id = $1',
    [quinielaId]
  );
  for (const part of participantes) {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as puntos FROM quiniela_predicciones WHERE quiniela_id = $1 AND user_id = $2 AND correcta = true',
      [quinielaId, part.user_id]
    );
    await pool.query(
      'UPDATE quiniela_participantes SET puntos_total = $1 WHERE quiniela_id = $2 AND user_id = $3',
      [parseInt(rows[0].puntos), quinielaId, part.user_id]
    );
  }
}

module.exports = router;
