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
  politica: 'política OR gobierno OR elecciones OR congreso OR presidente',
  economia: 'economía OR mercados OR finanzas OR negocios OR inflación',
  tecnologia: 'tecnología OR inteligencia artificial OR startup OR digital',
  deportes: 'deportes OR fútbol OR NBA OR olimpiadas OR F1',
  entretenimiento: 'entretenimiento OR cine OR música OR celebridades OR serie',
  guerra: 'guerra OR conflicto OR militar OR Ucrania OR Gaza OR defensa',
  ciencia: 'ciencia OR salud OR medicina OR investigación OR espacio',
  mexico: 'México OR CDMX OR Guadalajara OR Monterrey OR noticias mexicanas'
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

    // Transform to standard format
    const articles = items.map((item, i) => {
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
    });

    console.log(`[GoogleNewsRss] Found ${articles.length} articles for ${cacheKey}`);

    setCache(cacheKey, articles);
    return articles;

  } catch (e) {
    console.error('[GoogleNewsRss] Error:', e.message);
    throw new Error(`Failed to fetch Google News RSS: ${e.message}`);
  }
}

module.exports = { fetchGoogleNewsRss };
