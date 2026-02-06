require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initDB } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Panel Central API' }));

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
