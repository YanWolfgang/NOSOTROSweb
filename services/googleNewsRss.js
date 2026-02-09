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

// ========== CATEGORY MAPPING (Improved with Google News standard categories) ==========
const CATEGORY_QUERIES = {
  internacional: '(política internacional OR diplomacia OR relaciones internacionales OR cumbre OR ONU OR OTAN OR G20 OR Unión Europea OR presidente OR primer ministro OR elecciones OR gobierno OR congreso OR parlamento OR tratado OR sanciones OR embajada) -deportes -entretenimiento',
  economia: '(economía OR finanzas OR mercados OR negocios OR bolsa OR inversión OR bancos OR empresas) México -tecnología -política',
  tecnologia: '(inteligencia artificial OR IA OR AI OR software OR tecnología OR apps OR programación OR ciberseguridad OR startup) -videojuegos',
  deportes: '(fútbol OR football OR futbol OR championship OR liga OR NBA OR MLB OR NFL OR olimpiadas OR atletismo OR tenis) -noticias -política',
  entretenimiento: '(cine OR películas OR series OR música OR artista OR cantante OR actor OR streaming OR entretenimiento OR famosos) -deportes -política',
  salud: '(salud OR medicina OR doctor OR hospital OR vacuna OR enfermedad OR virus OR coronavirus OR psicología OR nutrición)',
  ciencia: '(ciencia OR investigación OR descubrimiento OR física OR química OR biología OR espacio OR astronomía OR NASA) -videojuegos',
  guerra: '(guerra OR conflicto OR militar OR ejército OR defensa OR armado OR ataque OR geopolítica) (Ucrania OR Rusia OR Gaza OR Israel OR Palestina)',
  mexico: 'México'
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
