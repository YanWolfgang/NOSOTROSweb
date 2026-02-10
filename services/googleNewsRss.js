const { XMLParser } = require('fast-xml-parser');

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

// ========== NEWSPAPER RSS FEEDS (Direct sources for higher quality) ==========
const NEWSPAPER_FEEDS = {
  internacional: [
    'https://feeds.bbci.co.uk/mundo/rss.xml',                   // BBC Mundo
    'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada', // El País
    'https://rss.dw.com/rss-sp-all',                            // DW Español
    'https://www.france24.com/es/rss',                           // France24 Español
    'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/america/portada', // El País América
    'https://www.europapress.es/rss/rss.aspx',                   // Europa Press
  ],
  economia: [
    'https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml', // El Financiero
    'https://expansion.mx/rss',                                  // Expansión
    'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada', // El País Economía
    'https://www.forbes.com.mx/feed/',                           // Forbes México
  ],
  tecnologia: [
    'https://feeds.bbci.co.uk/mundo/rss.xml',                   // BBC Mundo (tech mixed)
    'https://expansion.mx/rss',                                  // Expansión (tech section)
    'https://rss.dw.com/rss-sp-all',                            // DW Español
  ],
  deportes: [
    'https://www.milenio.com/rss',                               // Milenio
    'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/deportes/portada', // El País Deportes
  ],
  entretenimiento: [
    'https://www.milenio.com/rss',                               // Milenio
    'https://feeds.bbci.co.uk/mundo/rss.xml',                   // BBC Mundo
  ],
  salud: [
    'https://feeds.bbci.co.uk/mundo/rss.xml',                   // BBC Mundo
    'https://www.sinembargo.mx/feed',                            // Sin Embargo
  ],
  ciencia: [
    'https://feeds.bbci.co.uk/mundo/rss.xml',                   // BBC Mundo
    'https://rss.dw.com/rss-sp-all',                            // DW Español
  ],
  guerra: [
    'https://feeds.bbci.co.uk/mundo/rss.xml',                   // BBC Mundo
    'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada', // El País
    'https://rss.dw.com/rss-sp-all',                            // DW Español
    'https://www.france24.com/es/rss',                           // France24 Español
    'https://www.europapress.es/rss/rss.aspx',                   // Europa Press
  ],
  mexico: [
    'https://www.jornada.com.mx/rss/edicion.xml',               // La Jornada
    'https://www.milenio.com/rss',                               // Milenio
    'https://www.sinembargo.mx/feed',                            // Sin Embargo
    'https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml', // El Financiero
    'https://lopezdoriga.com/feed/',                             // López-Dóriga
    'https://www.forbes.com.mx/feed/',                           // Forbes México
    'https://www.reforma.com/rss/portada.xml',                   // Reforma
    'https://www.eluniversal.com.mx/arc/outboundfeeds/rss/?outputType=xml', // El Universal
    'https://www.sdpnoticias.com/arc/outboundfeeds/rss/?outputType=xml',    // SDP Noticias
  ]
};

// ========== CATEGORY MAPPING (Improved with Google News standard categories) ==========
const CATEGORY_QUERIES = {
  internacional: '(política internacional OR diplomacia OR cumbre OR ONU OR OTAN OR G20 OR Unión Europea OR presidente OR elecciones OR sanciones OR embajada) -deportes -entretenimiento when:2d',
  economia: '(economía OR finanzas OR mercados OR negocios OR bolsa OR inversión OR bancos OR empresas) México -tecnología -política when:2d',
  tecnologia: '(inteligencia artificial OR IA OR AI OR software OR tecnología OR apps OR programación OR ciberseguridad OR startup) -videojuegos when:2d',
  deportes: '(fútbol OR football OR futbol OR championship OR liga OR NBA OR MLB OR NFL OR olimpiadas OR atletismo OR tenis) -política when:2d',
  entretenimiento: '(cine OR películas OR series OR música OR artista OR cantante OR actor OR streaming OR entretenimiento OR famosos) -deportes -política when:2d',
  salud: '(salud OR medicina OR doctor OR hospital OR vacuna OR enfermedad OR virus OR psicología OR nutrición) when:2d',
  ciencia: '(ciencia OR investigación OR descubrimiento OR física OR química OR biología OR espacio OR astronomía OR NASA) -videojuegos when:2d',
  guerra: '(guerra OR conflicto OR militar OR ejército OR defensa OR armado OR ataque OR geopolítica) (Ucrania OR Rusia OR Gaza OR Israel OR Palestina) when:2d',
  mexico: 'México when:2d'
};

// ========== URL BUILDER ==========
function buildGoogleNewsUrl(scope, category) {
  const baseUrl = 'https://news.google.com/rss';
  // Internacional category always uses US scope for global news
  const isIntl = scope === 'intl' || category === 'internacional';
  const params = {
    hl: 'es-419',
    gl: isIntl ? 'US' : 'MX',
    ceid: isIntl ? 'US:es' : 'MX:es-419'
  };

  if (category && CATEGORY_QUERIES[category]) {
    const query = CATEGORY_QUERIES[category];
    return `${baseUrl}/search?q=${encodeURIComponent(query)}&hl=${params.hl}&gl=${params.gl}&ceid=${params.ceid}`;
  }

  return `${baseUrl}?hl=${params.hl}&gl=${params.gl}&ceid=${params.ceid}`;
}

// ========== UTILITIES ==========
function stripHtml(html) {
  if (!html) return '';
  // Remove HTML tags and entities
  return html
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&‌/g, '')  // Remove zero-width characters
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

function extractSummary(description, title) {
  if (!description) return title || '';

  const cleaned = stripHtml(description);

  // If cleaned description is empty or too short, use title
  if (cleaned.length < 20) return title || '';

  return cleaned;
}

// ========== KEYWORD VALIDATION (Enhanced for accuracy) ==========
const CATEGORY_KEYWORDS = {
  internacional: ['política', 'gobierno', 'elecciones', 'congreso', 'senado', 'presidente', 'ministro', 'diplomacia', 'internacional', 'onu', 'otan', 'g20', 'unión europea', 'cumbre', 'tratado', 'sanciones', 'embajada', 'parlamento', 'primer ministro', 'canciller', 'relaciones', 'geopolítica', 'crisis', 'trump', 'biden', 'china', 'rusia', 'europa', 'estados unidos', 'reino unido', 'francia', 'alemania', 'japón', 'india', 'brasil', 'canadá', 'mundo'],
  economia: ['economía', 'mercado', 'finanza', 'negocio', 'inflación', 'salario', 'bolsa', 'inversión', 'comercio', 'precio', 'crecimiento', 'pib', 'ganancias', 'ingresos', 'banco', 'préstamo', 'empresa', 'industria', 'sector', 'dividendo'],
  tecnologia: ['tecnología', 'inteligencia artificial', 'ia', 'ai', 'software', 'hardware', 'digital', 'startup', 'computadora', 'innovación', 'programación', 'código', 'app', 'plataforma', 'internet', 'ciberseguridad', 'datos', 'algoritmo', 'servidor', 'nube'],
  deportes: ['deporte', 'fútbol', 'futbol', 'football', 'basketball', 'nba', 'mlb', 'nfl', 'olimpiada', 'atleta', 'equipo', 'campeonato', 'liga', 'jugador', 'entrenador', 'gol', 'partido', 'torneo', 'temporada', 'tenis', 'beisbol'],
  entretenimiento: ['cine', 'película', 'serie', 'música', 'artista', 'actor', 'cantante', 'show', 'concierto', 'televisión', 'famoso', 'estrella', 'premiación', 'óscar', 'grammy', 'streaming', 'productor', 'director', 'coreografía'],
  salud: ['salud', 'medicina', 'doctor', 'médico', 'hospital', 'paciente', 'enfermedad', 'tratamiento', 'virus', 'vacuna', 'psicología', 'nutrición', 'ejercicio', 'bienestar', 'síntoma', 'diagnóstico', 'cura', 'fármaco', 'epidemia'],
  ciencia: ['ciencia', 'investigación', 'descubrimiento', 'física', 'química', 'biología', 'espacio', 'astronomía', 'nasa', 'planeta', 'estrella', 'científico', 'laboratorio', 'experimento', 'estudio', 'hallazgo', 'investigador', 'teoría'],
  guerra: ['guerra', 'conflicto', 'militar', 'ejército', 'defensa', 'armado', 'ataque', 'batalla', 'geopolítica', 'soldado', 'ucrania', 'rusia', 'gaza', 'israel', 'palestina', 'tropas', 'misil', 'operación'],
  mexico: ['méxico', 'mexicano', 'mexicana', 'nacional', 'doméstico', 'interno', 'cdmx', 'pemex', 'imss', 'segob', 'secretaría', 'presidente', 'senado', 'congreso', 'ministro', 'gobernador', 'diputado', 'senador', 'legislador', 'política', 'gobierno', 'estado', 'municipio', 'economía', 'mercado', 'finanza', 'bolsa', 'empresa', 'negocio', 'industria', 'deporte', 'fútbol', 'futbol', 'béisbol', 'basket', 'equipo', 'jugador', 'entrenador', 'cine', 'película', 'serie', 'actor', 'cantante', 'artista', 'música', 'salud', 'medicina', 'hospital', 'doctor', 'enfermedad', 'vacuna', 'ciencia', 'investigación', 'tecnología', 'startup', 'innovación']
};

// Define exclusion keywords for each category (to filter out false positives)
const CATEGORY_EXCLUSIONS = {
  internacional: ['deporte', 'futbol', 'película', 'serie', 'música', 'cine', 'actor', 'cantante', 'videojuego'],
  economia: ['película', 'serie', 'cine', 'actriz', 'cantante', 'deporte', 'futbol', 'videojuego'],
  tecnologia: ['película', 'serie', 'videojuego completo', 'consola de juego', 'juego en línea'],
  deportes: ['película', 'serie', 'música', 'cine', 'actor', 'cantante', 'política', 'gobierno'],
  entretenimiento: ['economía', 'política', 'gobierno', 'mercado', 'bolsa', 'gráficos financieros'],
  salud: ['película', 'serie', 'cine', 'actor', 'política', 'economía', 'videojuego'],
  ciencia: ['película', 'serie', 'cine', 'videojuego', 'entretenimiento', 'música'],
  guerra: ['película', 'serie', 'videojuego', 'ficción'],
  mexico: []  // No exclusions for Mexico - accept all Mexican news
};

function isRelevantArticle(title, category) {
  if (!category || !CATEGORY_KEYWORDS[category]) return true;

  const title_lower = (title || '').toLowerCase();
  const keywords = CATEGORY_KEYWORDS[category];
  const exclusions = CATEGORY_EXCLUSIONS[category] || [];

  // Special handling for Mexico category: MUST have Mexico/Mexican reference
  if (category === 'mexico') {
    // Article MUST mention México or be about Mexican topics
    const hasMexicoReference = title_lower.includes('méxico') || title_lower.includes('mexicano') || title_lower.includes('mexicana');
    if (!hasMexicoReference) return false;

    // For Mexico category, accept ANY news related to Mexico
    // Politics, economics, sports, entertainment, health, science - all accepted
    // No exclusions, very open category
    return true;
  }

  // Standard filtering for other categories
  // Check if title contains any exclusion words (filter out false positives)
  const hasExclusion = exclusions.some(exclude => title_lower.includes(exclude));
  if (hasExclusion) return false;

  // Check if title contains at least one keyword from the category
  const hasKeyword = keywords.some(keyword => title_lower.includes(keyword));

  return hasKeyword;
}

// ========== NEWSPAPER RSS FETCHER ==========
async function fetchNewspaperFeed(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return [];

    const xmlText = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: false
    });

    const result = parser.parse(xmlText);

    // Handle both RSS 2.0 and Atom formats
    let items = [];
    if (result.rss?.channel?.item) {
      items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
    } else if (result.feed?.entry) {
      items = Array.isArray(result.feed.entry) ? result.feed.entry : [result.feed.entry];
    }

    const maxAge = 48 * 60 * 60 * 1000;
    const now = Date.now();

    return items
      .filter(item => {
        const dateStr = item.pubDate || item.published || item['dc:date'] || '';
        if (dateStr) {
          const age = now - new Date(dateStr).getTime();
          if (age > maxAge) return false;
        }
        return true;
      })
      .map(item => {
        const title = (typeof item.title === 'object' ? item.title['#text'] : item.title) || '';
        const desc = item.description || item.summary || item.content || '';
        const dateStr = item.pubDate || item.published || item['dc:date'] || new Date().toISOString();

        // Extract source from URL
        let source = 'Periódico';
        try {
          const hostname = new URL(url).hostname.replace('www.', '').replace('feeds.', '').replace('rss.', '');
          const sourceMap = {
            'bbci.co.uk': 'BBC Mundo', 'elpais.com': 'El País', 'dw.com': 'DW',
            'elfinanciero.com.mx': 'El Financiero', 'expansion.mx': 'Expansión',
            'milenio.com': 'Milenio', 'jornada.com.mx': 'La Jornada', 'sinembargo.mx': 'Sin Embargo',
            'france24.com': 'France24', 'europapress.es': 'Europa Press',
            'lopezdoriga.com': 'López-Dóriga', 'forbes.com.mx': 'Forbes México',
            'reforma.com': 'Reforma', 'eluniversal.com.mx': 'El Universal',
            'sdpnoticias.com': 'SDP Noticias'
          };
          source = sourceMap[hostname] || hostname;
        } catch {}

        return {
          title: stripHtml(title).slice(0, 300),
          summary: extractSummary(desc, title).slice(0, 400),
          source,
          date: dateStr
        };
      });
  } catch (e) {
    console.warn(`[NewspaperRss] Failed to fetch ${url}: ${e.message}`);
    return [];
  }
}

// ========== MAIN FETCHER (Google News + Newspapers combined) ==========
async function fetchGoogleNewsRss(scope, category) {
  const cacheKey = `${scope}:${category || 'all'}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // ========== FETCH GOOGLE NEWS + NEWSPAPERS IN PARALLEL ==========
    const googlePromise = (async () => {
      const url = buildGoogleNewsUrl(scope, category);
      console.log(`[GoogleNews] Fetching: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-MX,es;q=0.9'
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xmlText = await response.text();
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false });
      const result = parser.parse(xmlText);
      if (!result.rss?.channel?.item) return [];
      const items = Array.isArray(result.rss.channel.item) ? result.rss.channel.item : [result.rss.channel.item];
      const maxAge = 48 * 60 * 60 * 1000;
      const now = Date.now();
      return items
        .filter(item => {
          if (!isRelevantArticle(item.title, category)) return false;
          if (item.pubDate && (now - new Date(item.pubDate).getTime() > maxAge)) return false;
          return true;
        })
        .map(item => {
          let sourceText = item.source || 'Google News';
          if (typeof sourceText === 'object' && sourceText['#text']) sourceText = sourceText['#text'];
          return {
            title: (item.title || '').slice(0, 300),
            summary: extractSummary(item.description, item.title).slice(0, 400),
            source: sourceText,
            date: item.pubDate || new Date().toISOString()
          };
        });
    })().catch(e => { console.warn(`[GoogleNews] Failed: ${e.message}`); return []; });

    const newspaperFeeds = NEWSPAPER_FEEDS[category] || [];
    const newspaperPromise = Promise.allSettled(
      newspaperFeeds.map(feedUrl => fetchNewspaperFeed(feedUrl))
    ).then(results => {
      let articles = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.length > 0) {
          articles.push(...r.value.filter(a => isRelevantArticle(a.title, category)));
        }
      }
      return articles;
    });

    const [googleArticles, newspaperArticles] = await Promise.all([googlePromise, newspaperPromise]);

    console.log(`[NewsRss] Google: ${googleArticles.length}, Newspapers: ${newspaperArticles.length} for ${cacheKey}`);

    // ========== MERGE & DEDUPLICATE ==========
    const allArticles = [...googleArticles, ...newspaperArticles];
    const seen = new Set();
    const deduplicated = allArticles.filter(article => {
      const normalized = article.title.toLowerCase()
        .replace(/[^a-záéíóúñü\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
      if (seen.has(normalized)) return false;
      const partial = normalized.slice(0, 40);
      for (const s of seen) {
        if (s.startsWith(partial) || partial.startsWith(s.slice(0, 40))) return false;
      }
      seen.add(normalized);
      return true;
    });

    deduplicated.sort((a, b) => new Date(b.date) - new Date(a.date));
    const final = deduplicated.map((a, i) => ({ ...a, id: i + 1 }));

    console.log(`[NewsRss] Final: ${final.length} articles for ${cacheKey} (after dedup)`);

    setCache(cacheKey, final);
    return final;

  } catch (e) {
    console.error('[NewsRss] Error:', e.message);
    throw new Error(`Failed to fetch news: ${e.message}`);
  }
}

module.exports = { fetchGoogleNewsRss };
