require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const NEWS_KEY = process.env.NEWSAPI_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'NOSOTROS API' });
});

// NewsAPI endpoint
app.post('/api/news', async (req, res) => {
  try {
    const { scope, query } = req.body;
    let articles = [];

    if (scope === 'mixed') {
      const [r1, r2] = await Promise.all([
        fetch(`https://newsapi.org/v2/everything?q=México+noticias&language=es&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_KEY}`),
        fetch(`https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=${NEWS_KEY}`)
      ]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      articles = [...(d1.articles || []), ...(d2.articles || [])];
    } else if (scope === 'mx') {
      const q = query ? encodeURIComponent(query + ' México') : 'México+noticias';
      const r = await fetch(`https://newsapi.org/v2/everything?q=${q}&language=es&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_KEY}`);
      const d = await r.json();
      articles = d.articles || [];
    } else if (query) {
      const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_KEY}`);
      const d = await r.json();
      articles = d.articles || [];
    } else {
      const r = await fetch(`https://newsapi.org/v2/top-headlines?country=us&pageSize=10&apiKey=${NEWS_KEY}`);
      const d = await r.json();
      articles = d.articles || [];
    }

    const news = articles
      .filter(a => a.title && a.title !== '[Removed]' && a.description && a.description !== '[Removed]')
      .slice(0, 8)
      .map((a, i) => ({
        id: i + 1,
        title: (a.title || '').replace(/\s*-\s*[^-]*$/, ''),
        summary: (a.description || '').slice(0, 200),
        source: a.source?.name || 'Fuente desconocida'
      }));

    res.json({ news });
  } catch (error) {
    console.error('Error en /api/news:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Gemini endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, system } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Se requiere prompt' });

    const contents = [];
    if (system) {
      contents.push({ role: 'user', parts: [{ text: 'INSTRUCCIONES: ' + system }] });
      contents.push({ role: 'model', parts: [{ text: 'Entendido, seguiré esas instrucciones.' }] });
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      }
    );
    const d = await r.json();
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) throw new Error(d.error?.message || 'Gemini no devolvió texto');
    res.json({ result: text });
  } catch (error) {
    console.error('Error en /api/generate:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NOSOTROS API corriendo en http://0.0.0.0:${PORT}`);
});
