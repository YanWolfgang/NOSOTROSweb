require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { pool, initDB } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Uploads directory
const uploadsDir = path.join(__dirname, 'uploads', 'styly');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Panel Central API' }));

// Serve uploaded files from database (public, no auth required for img/a tags)
app.get('/api/styly/files/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT nombre, tipo, file_data FROM styly_task_archivos WHERE id = $1', [req.params.id]);
    if (!rows.length || !rows[0].file_data) return res.status(404).send('Not found');
    const file = rows[0];
    res.set('Content-Type', file.tipo || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(file.nombre)}"`);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(file.file_data);
  } catch (e) { res.status(500).send('Error'); }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/nosotros', require('./routes/nosotros'));
app.use('/api/duelazo', require('./routes/duelazo'));
app.use('/api/spacebox', require('./routes/spacebox'));
app.use('/api/styly', require('./routes/styly'));

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== CLEANUP CRON ==========
async function cleanupOldData() {
  try {
    const r1 = await pool.query("DELETE FROM ai_conversations WHERE expires_at < NOW()");
    const r2 = await pool.query("DELETE FROM content_history WHERE status='draft' AND created_at < NOW() - INTERVAL '30 days'");
    const r3 = await pool.query("DELETE FROM ideas WHERE status='discarded' AND created_at < NOW() - INTERVAL '30 days'");
    console.log(`[Cleanup] Chats: ${r1.rowCount}, Drafts: ${r2.rowCount}, Ideas: ${r3.rowCount} eliminados`);
  } catch (e) {
    console.error('[Cleanup] Error:', e.message);
  }
}

// Init DB then start
initDB().then(() => {
  cleanupOldData();
  setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
  app.listen(PORT, '0.0.0.0', () => console.log(`Panel Central corriendo en http://0.0.0.0:${PORT}`));
}).catch(e => {
  console.error('Error inicializando DB:', e.message);
  app.listen(PORT, '0.0.0.0', () => console.log(`Panel Central corriendo SIN DB en http://0.0.0.0:${PORT}`));
});
