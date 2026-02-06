require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const NEWS_KEY = process.env.NEWSAPI_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'NOSOTROS API' });
});

// Dominios de medios mexicanos para filtrar noticias de México
const MX_DOMAINS = 'elfinanciero.com.mx,eluniversal.com.mx,milenio.com,proceso.com.mx,jornada.com.mx,excelsior.com.mx,reforma.com,animalpolitico.com,sdpnoticias.com,forbes.com.mx,expansion.mx,eleconomista.com.mx';

// Palabras clave por categoría
const CAT_Q = {
  politica: 'política OR gobierno OR elecciones OR congreso OR presidente',
  economia: 'economía OR mercados OR finanzas OR negocios OR inflación',
  tecnologia: 'tecnología OR inteligencia artificial OR startup OR digital',
  deportes: 'deportes OR fútbol OR NBA OR olimpiadas OR F1',
  entretenimiento: 'entretenimiento OR cine OR música OR celebridades OR serie',
  guerra: 'guerra OR conflicto OR militar OR Ucrania OR Gaza OR defensa',
  ciencia: 'ciencia OR salud OR medicina OR investigación OR espacio'
};

// NewsAPI endpoint
app.post('/api/news', async (req, res) => {
  try {
    const { scope, query, category } = req.body;
    let articles = [];
    const catQuery = category && CAT_Q[category] ? CAT_Q[category] : null;

    if (scope === 'both') {
      const intlQ = catQuery || 'Mexico OR mundial OR internacional';
      const mxQ = catQuery ? `&q=${encodeURIComponent(catQuery)}` : '';
      const [r1, r2] = await Promise.all([
        fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(intlQ)}&language=es&sortBy=publishedAt&pageSize=5&apiKey=${NEWS_KEY}`),
        fetch(`https://newsapi.org/v2/everything?domains=${MX_DOMAINS}&language=es&sortBy=publishedAt&pageSize=5${mxQ}&apiKey=${NEWS_KEY}`)
      ]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      articles = [...(d1.articles || []).slice(0, 4), ...(d2.articles || []).slice(0, 4)];

    } else if (scope === 'mx') {
      const q = catQuery || query || null;
      const qParam = q ? `&q=${encodeURIComponent(q)}` : '';
      const r = await fetch(`https://newsapi.org/v2/everything?domains=${MX_DOMAINS}&language=es&sortBy=publishedAt&pageSize=10${qParam}&apiKey=${NEWS_KEY}`);
      const d = await r.json();
      articles = d.articles || [];

    } else if (scope === 'intl') {
      const q = catQuery || query || 'mundial OR internacional OR economía OR política OR tecnología';
      const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=es&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_KEY}`);
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

// Groq endpoint (Llama 3.3 70B)
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, system } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Se requiere prompt' });

    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 8192 })
    });
    const d = await r.json();
    const text = d.choices?.[0]?.message?.content || '';
    if (!text) throw new Error(d.error?.message || 'Groq no devolvió texto');
    res.json({ result: text });
  } catch (error) {
    console.error('Error en /api/generate:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NOSOTROS API corriendo en http://0.0.0.0:${PORT}`);
});
