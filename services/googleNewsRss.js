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

// ========== CATEGORY MAPPING ==========
const CATEGORY_QUERIES = {
  politica: 'política mexicana OR gobierno mexicano OR elecciones México OR congreso México OR presidente México',
  economia: 'economía México OR mercados financieros OR negocios México OR inflación México OR finanzas',
  tecnologia: 'inteligencia artificial OR tecnología OR startups OR innovación digital',
  deportes: 'fútbol mexicano OR deportes México OR NBA OR F1 OR olimpiadas',
  entretenimiento: 'cine México OR películas OR series televisión OR música OR entretenimiento',
  guerra: 'guerra Ucrania OR conflicto Rusia OR conflicto Gaza OR defensa militar',
  ciencia: 'ciencia salud OR medicina investigación OR salud pública OR investigación científica',
  mexico: 'México noticias OR noticia México -política -economía -deportes -cine'
};

// ========== URL BUILDER ==========
function buildGoogleNewsUrl(scope, category) {
  const baseUrl = 'https://news.google.com/rss';
  const params = {
    hl: 'es-419',
    gl: scope === 'intl' ? 'US' : 'MX',
    ceid: scope === 'intl' ? 'US:es' : 'MX:es-419'
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

// ========== KEYWORD VALIDATION ==========
const CATEGORY_KEYWORDS = {
  politica: ['política', 'gobierno', 'elecciones', 'congreso', 'presidente', 'legislatura', 'diputado', 'senador', 'voto', 'candidato', 'ministro'],
  economia: ['economía', 'mercado', 'finanza', 'negocio', 'inflación', 'salario', 'bolsa', 'inversión', 'comercio', 'precio', 'crecimiento'],
  tecnologia: ['tecnología', 'inteligencia artificial', 'ia', 'ai', 'software', 'hardware', 'digital', 'startup', 'computadora', 'sistema', 'innovación', 'programación'],
  deportes: ['deporte', 'fútbol', 'basketball', 'nba', 'f1', 'olímpico', 'atleta', 'equipo', 'campeonato', 'liga', 'jugador', 'entrenador'],
  entretenimiento: ['cine', 'película', 'serie', 'música', 'artista', 'actor', 'cantante', 'show', 'concierto', 'televisión', 'famoso', 'estrella'],
  guerra: ['guerra', 'conflicto', 'militar', 'ucrania', 'rusia', 'gaza', 'defensa', 'ataque', 'armado', 'ejército', 'soldado', 'batalla'],
  ciencia: ['ciencia', 'salud', 'medicina', 'investigación', 'doctor', 'científico', 'laboratorio', 'espacio', 'físico', 'químico', 'descubrimiento', 'estudio'],
  mexico: ['méxico', 'cdmx', 'jalisco', 'monterrey', 'guadalajara', 'veracruz', 'mexico', 'mexicano', 'mexicana', 'nacional', 'país']
};

function isRelevantArticle(title, category) {
  if (!category || !CATEGORY_KEYWORDS[category]) return true;

  const title_lower = (title || '').toLowerCase();
  const keywords = CATEGORY_KEYWORDS[category];

  // Check if title contains at least one keyword from the category
  const hasKeyword = keywords.some(keyword => title_lower.includes(keyword));

  return hasKeyword;
}

// ========== XML PARSER ==========
async function fetchGoogleNewsRss(scope, category) {
  const cacheKey = `${scope}:${category || 'all'}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const url = buildGoogleNewsUrl(scope, category);
    console.log(`[GoogleNewsRss] Fetching: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();

    // Parse XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: false
    });

    const result = parser.parse(xmlText);

    if (!result.rss || !result.rss.channel || !result.rss.channel.item) {
      throw new Error('Invalid RSS structure from Google News');
    }

    // Handle both single item and array of items
    const items = Array.isArray(result.rss.channel.item)
      ? result.rss.channel.item
      : [result.rss.channel.item];

    // Transform to standard format with keyword filtering
    const articles = items
      .filter(item => isRelevantArticle(item.title, category))
      .map((item, i) => {
        let sourceText = item.source || 'Google News';

        // Extract source name if it's an object with attributes
        if (typeof sourceText === 'object' && sourceText['#text']) {
          sourceText = sourceText['#text'];
        }

        // Extract and clean summary
        const summary = extractSummary(item.description, item.title).slice(0, 400);

        return {
          id: i + 1,
          title: (item.title || '').slice(0, 300),
          summary: summary,
          source: sourceText,
          date: item.pubDate || new Date().toISOString()
        };
      })
      // Sort by date descending (most recent first)
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA; // Descending order (newest first)
      });

    console.log(`[GoogleNewsRss] Found ${articles.length} relevant articles for ${cacheKey} (filtered from RSS feed)`);

    setCache(cacheKey, articles);
    return articles;

  } catch (e) {
    console.error('[GoogleNewsRss] Error:', e.message);
    throw new Error(`Failed to fetch Google News RSS: ${e.message}`);
  }
}

module.exports = { fetchGoogleNewsRss };
