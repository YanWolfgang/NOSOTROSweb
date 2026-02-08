const NEWS_KEY = process.env.NEWSAPI_KEY;

const MX_DOMAINS = 'elfinanciero.com.mx,eluniversal.com.mx,milenio.com,proceso.com.mx,jornada.com.mx,excelsior.com.mx,reforma.com,animalpolitico.com,sdpnoticias.com,forbes.com.mx,expansion.mx,eleconomista.com.mx';

const CAT_Q = {
  politica: 'política OR gobierno OR elecciones OR congreso OR presidente',
  economia: 'economía OR mercados OR finanzas OR negocios OR inflación',
  tecnologia: 'tecnología OR inteligencia artificial OR startup OR digital',
  deportes: 'deportes OR fútbol OR NBA OR olimpiadas OR F1',
  entretenimiento: 'entretenimiento OR cine OR música OR celebridades OR serie',
  guerra: 'guerra OR conflicto OR militar OR Ucrania OR Gaza OR defensa',
  ciencia: 'ciencia OR salud OR medicina OR investigación OR espacio'
};

// ========== CACHE (15 min TTL) ==========
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  // Evict old entries
  if (cache.size > 50) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

async function safeFetch(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (d.status === 'error') {
    console.error('[NewsAPI]', d.code, d.message);
    if (d.code === 'rateLimited') throw new Error('NewsAPI: limite de requests alcanzado (100/dia plan gratuito). Intenta en unas horas.');
    throw new Error(`NewsAPI: ${d.message || d.code}`);
  }
  return d;
}

function filterArticles(articles) {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - (48 * 60 * 60 * 1000)); // 48 hours ago

  return (articles || []).filter(a => {
    if (!a.title || a.title === '[Removed]' || !a.description || a.description === '[Removed]') return false;

    // Filter for recent articles (last 48 hours)
    if (a.publishedAt) {
      const pubDate = new Date(a.publishedAt);
      return pubDate >= twoDaysAgo; // Published within last 48 hours
    }
    return false; // Exclude articles without publishedAt
  });
}

async function fetchNews(scope, query, category) {
  const cacheKey = `${scope}:${query||''}:${category||''}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  let articles = [];
  const catQuery = category && CAT_Q[category] ? CAT_Q[category] : null;

  if (scope === 'both') {
    const intlQ = catQuery || 'mundial OR internacional';
    const mxQ = catQuery ? `&q=${encodeURIComponent(catQuery)}` : '';
    const [d1, d2] = await Promise.all([
      safeFetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(intlQ)}&language=es&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_KEY}`),
      safeFetch(`https://newsapi.org/v2/everything?domains=${MX_DOMAINS}&language=es&sortBy=publishedAt&pageSize=10${mxQ}&apiKey=${NEWS_KEY}`)
    ]);
    articles = [...filterArticles(d1.articles).slice(0, 4), ...filterArticles(d2.articles).slice(0, 4)];

  } else if (scope === 'mx') {
    const q = catQuery || query || null;
    const qParam = q ? `&q=${encodeURIComponent(q)}` : '';
    const d = await safeFetch(`https://newsapi.org/v2/everything?domains=${MX_DOMAINS}&language=es&sortBy=publishedAt&pageSize=15${qParam}&apiKey=${NEWS_KEY}`);
    articles = d.articles || [];

  } else if (scope === 'intl') {
    const q = catQuery || query || 'mundial OR internacional OR economía OR política OR tecnología';
    const d = await safeFetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=es&sortBy=publishedAt&pageSize=15&apiKey=${NEWS_KEY}`);
    articles = d.articles || [];

  } else {
    const d = await safeFetch(`https://newsapi.org/v2/everything?domains=${MX_DOMAINS}&language=es&sortBy=publishedAt&pageSize=15&apiKey=${NEWS_KEY}`);
    articles = d.articles || [];
  }

  const filtered = filterArticles(articles);

  const result = {
    articles: filtered.map((a, i) => ({
      id: i + 1,
      title: (a.title || '').replace(/\s*-\s*[^-]*$/, ''),
      summary: (a.description || '').slice(0, 200),
      source: a.source?.name || 'Fuente desconocida',
      date: a.publishedAt || new Date().toISOString()
    })),
    total: filtered.length
  };

  setCache(cacheKey, result);
  return result;
}

module.exports = { fetchNews };
