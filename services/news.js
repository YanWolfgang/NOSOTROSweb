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

function filterArticles(articles) {
  return (articles || []).filter(a => a.title && a.title !== '[Removed]' && a.description && a.description !== '[Removed]');
}

async function fetchNews(scope, query, category) {
  let articles = [];
  const catQuery = category && CAT_Q[category] ? CAT_Q[category] : null;

  if (scope === 'both') {
    // 4 internacionales + 4 México
    const intlQ = catQuery || 'mundial OR internacional';
    const mxQ = catQuery ? `&q=${encodeURIComponent(catQuery)}` : '';
    const [r1, r2] = await Promise.all([
      fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(intlQ)}&language=es&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_KEY}`),
      fetch(`https://newsapi.org/v2/everything?domains=${MX_DOMAINS}&language=es&sortBy=publishedAt&pageSize=10${mxQ}&apiKey=${NEWS_KEY}`)
    ]);
    const d1 = await r1.json(), d2 = await r2.json();
    articles = [...filterArticles(d1.articles).slice(0, 4), ...filterArticles(d2.articles).slice(0, 4)];

  } else if (scope === 'mx') {
    // Solo México via dominios mexicanos
    const q = catQuery || query || null;
    const qParam = q ? `&q=${encodeURIComponent(q)}` : '';
    const r = await fetch(`https://newsapi.org/v2/everything?domains=${MX_DOMAINS}&language=es&sortBy=publishedAt&pageSize=15${qParam}&apiKey=${NEWS_KEY}`);
    const d = await r.json();
    articles = d.articles || [];

  } else if (scope === 'intl') {
    // Solo internacionales
    const q = catQuery || query || 'mundial OR internacional OR economía OR política OR tecnología';
    const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=es&sortBy=publishedAt&pageSize=15&apiKey=${NEWS_KEY}`);
    const d = await r.json();
    articles = d.articles || [];

  } else {
    // Default: México
    const r = await fetch(`https://newsapi.org/v2/everything?domains=${MX_DOMAINS}&language=es&sortBy=publishedAt&pageSize=15&apiKey=${NEWS_KEY}`);
    const d = await r.json();
    articles = d.articles || [];
  }

  return filterArticles(articles).slice(0, 8).map((a, i) => ({
    id: i + 1,
    title: (a.title || '').replace(/\s*-\s*[^-]*$/, ''),
    summary: (a.description || '').slice(0, 200),
    source: a.source?.name || 'Fuente desconocida'
  }));
}

module.exports = { fetchNews };
