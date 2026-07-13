// ─── Apps Script: Endpoint de noticias ────────────────────────────────────────
// Curado para Susana: actualidad general argentina + chimentos / farándula
// Sin: crímenes, violencia, accidentes, noticias perturbadoras
//
// Trigger: Apps Script → Desencadenadores → Agregar desencadenador
//   Función: refreshNews
//   Fuente: Temporizador → Cronológico por días → Entre 7:00 y 8:00 AM

// ── Fuentes de actualidad general ─────────────────────────────────────────────
var SOURCES_GENERAL = [
  { name: 'La Nación',   url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml' },
  { name: 'Infobae',     url: 'https://www.infobae.com/feeds/rss/' },
  { name: 'Clarín',      url: 'https://www.clarin.com/rss/lo-ultimo/' },
];

// ── Fuentes de chimentos y entretenimiento ────────────────────────────────────
var SOURCES_CHIMENTOS = [
  { name: 'Teleshow',               url: 'https://www.infobae.com/teleshow/rss/' },
  { name: 'La Nación Espectáculos', url: 'https://www.lanacion.com.ar/espectaculos/arc/outboundfeeds/rss/?outputType=xml' },
  { name: 'Clarín Espectáculos',    url: 'https://www.clarin.com/rss/espectaculos/' },
];

// ── Palabras clave a excluir ──────────────────────────────────────────────────
// (mantener sincronizado con NEWS_EXCLUDE_KEYWORDS en js/config.js)
var EXCLUDE_KEYWORDS = [
  // Crimen y violencia
  'asesinato', 'crimen', 'femicidio', 'violación', 'abuso sexual',
  'secuestro', 'robo', 'asalto', 'tiroteo', 'balacera',
  'narcotráfico', 'narco', 'sicario', 'mafia',
  // Muerte y accidentes graves
  'accidente fatal', 'fallecido', 'fallecida', 'muerto', 'muertos', 'muerta',
  'muerte', 'tragedia', 'víctima fatal', 'choque fatal', 'incendio mortal',
  'cuerpo sin vida', 'hallaron muerto', 'hallaron muerta',
  // Violencia de género
  'golpiza', 'femicida', 'violencia de género',
  // Conflictos y represión
  'huelga de hambre', 'represión', 'desaparecido', 'desaparecida',
  // Suicidio
  'suicidio', 'se quitó la vida', 'intentó quitarse',
  // Desastres naturales y pandemias
  'terremoto', 'tsunami', 'epidemia', 'pandemia',
  // Conflictos bélicos
  'guerra', 'bombardeo', 'ataque terrorista', 'atentado',
  // Temas de visa e inmigración técnica
  'green card', 'visa h-1b', 'visa f-1', 'visa de trabajo',
];

var MAX_GENERAL   = 3;  // titulares de actualidad / política
var MAX_CHIMENTOS = 4;  // titulares de chimentos / farándula

// ── Namespaces RSS ────────────────────────────────────────────────────────────
var NS_MEDIA   = 'http://search.yahoo.com/mrss/';
var NS_CONTENT = 'http://purl.org/rss/1.0/modules/content/';

// ─── Trigger diario ────────────────────────────────────────────────────────────

function refreshNews() {
  var general   = fetchFromSources(SOURCES_GENERAL,   MAX_GENERAL);
  var chimentos = fetchFromSources(SOURCES_CHIMENTOS, MAX_CHIMENTOS);

  var items = interleave(chimentos, general); // chimentos primero para más variedad

  if (items.length === 0) {
    Logger.log('Sin noticias nuevas. Manteniendo caché anterior.');
    return;
  }

  var payload = JSON.stringify({ updated_at: new Date().toISOString(), items: items });
  PropertiesService.getScriptProperties().setProperty('news_cache', payload);
  Logger.log('Noticias guardadas: ' + items.length + ' (' + general.length + ' generales, ' + chimentos.length + ' chimentos)');
}

// Intenta fuentes en orden; acumula hasta `max` ítems válidos
function fetchFromSources(sources, max) {
  var items = [];
  for (var s = 0; s < sources.length && items.length < max; s++) {
    var batch = fetchSource(sources[s], max - items.length);
    items = items.concat(batch);
  }
  return items;
}

function fetchSource(source, max) {
  var items = [];
  try {
    var response = UrlFetchApp.fetch(source.url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return items;

    var xml  = response.getContentText();
    var doc  = XmlService.parse(xml);
    var root = doc.getRootElement();

    var entries = root.getChildren('channel').length > 0
      ? root.getChild('channel').getChildren('item')
      : root.getChildren('entry');

    for (var i = 0; i < entries.length && items.length < max; i++) {
      var entry = entries[i];
      var title = getText(entry, 'title');
      var link  = getText(entry, 'link') || getAttr(entry, 'link', 'href');
      var rawDesc = getText(entry, 'description') || getText(entry, 'summary') || '';
      var date  = getText(entry, 'pubDate') || getText(entry, 'updated') || '';

      if (!title) continue;
      if (containsExcluded(title + ' ' + rawDesc)) continue;

      // Intentar extraer imagen del namespace media:content / media:thumbnail
      var mediaImg = '';
      try {
        var mNs = XmlService.getNamespace(NS_MEDIA);
        var mediaEl = entry.getChild('content', mNs) || entry.getChild('thumbnail', mNs);
        if (mediaEl) {
          var urlAttr = mediaEl.getAttribute('url');
          if (urlAttr) mediaImg = urlAttr.getValue();
        }
      } catch (_) {}

      // Intentar extraer contenido enriquecido de content:encoded
      var richHtml = '';
      try {
        var cNs = XmlService.getNamespace(NS_CONTENT);
        var encodedEl = entry.getChild('encoded', cNs);
        if (encodedEl) richHtml = encodedEl.getText();
      } catch (_) {}

      // Extraer imágenes y párrafos del HTML disponible
      var sourceHtml = richHtml || rawDesc;
      var images     = extractImages(sourceHtml);
      if (mediaImg && images.indexOf(mediaImg) === -1) images.unshift(mediaImg);
      images = images.slice(0, 2);

      var paragraphs = htmlToParas(sourceHtml);

      // Intentar artículo completo; reemplaza contenido RSS si es más rico
      if (link) {
        var fetched = fetchArticleParas(link);
        if (fetched.length >= 3) paragraphs = fetched;
      }

      items.push({
        title:      sanitize(title),
        summary:    sanitize(trimDesc(rawDesc)),
        paragraphs: paragraphs,
        images:     images,
        link:       link || '',
        source:     source.name,
        date:       formatDate(date),
      });
    }

    if (items.length > 0) {
      Logger.log(source.name + ': ' + items.length + ' titular(es)');
    }
  } catch (err) {
    Logger.log('Error RSS ' + source.name + ': ' + err.message);
  }
  return items;
}

// Intercala dos arrays: [a0, b0, a1, b1, ...]
function interleave(a, b) {
  var result = [];
  var max = Math.max(a.length, b.length);
  for (var i = 0; i < max; i++) {
    if (i < a.length) result.push(a[i]);
    if (i < b.length) result.push(b[i]);
  }
  return result;
}

// ─── doGet: servir noticias cacheadas ──────────────────────────────────────────

function doGet(e) {
  var resource = (e && e.parameter && e.parameter.resource) ? e.parameter.resource : '';

  if (resource === 'news') {
    return handleNews();
  }

  return buildJSON({ error: 'recurso no reconocido' });
}

function handleNews() {
  var cached = PropertiesService.getScriptProperties().getProperty('news_cache');

  if (!cached) {
    refreshNews();
    cached = PropertiesService.getScriptProperties().getProperty('news_cache');
  }

  if (!cached) {
    return buildJSON({ items: [], updated_at: null });
  }

  return buildJSON(JSON.parse(cached));
}

// ─── Helpers de extracción ─────────────────────────────────────────────────────

// Extrae src de <img> tags en HTML
function extractImages(html) {
  var urls = [];
  if (!html) return urls;
  var re = /<img[^>]+src=["']([^"']+)["']/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].indexOf('http') === 0) urls.push(m[1]);
  }
  return urls.slice(0, 2);
}

// Convierte HTML en array de párrafos de texto plano
function htmlToParas(html) {
  if (!html) return [];
  var text = html
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\s{2,}/g, ' ');

  return text.split('\n')
    .map(function(p) { return p.trim(); })
    .filter(function(p) { return p.length > 40; })
    .map(function(p) { return p.length > 600 ? p.substring(0, 600) + '…' : p; })
    .slice(0, 12);
}

// Divide un bloque de texto en párrafos legibles. Algunos sitios (La Nación)
// entregan articleBody como un único string sin saltos de línea; en ese caso
// se agrupan oraciones en bloques de ~400 caracteres en vez de truncar.
function splitIntoParagraphs(text) {
  var byBlank = text.split(/\n{2,}/).map(function(p) { return p.trim(); }).filter(function(p) { return p.length > 20; });
  if (byBlank.length >= 2) return byBlank.slice(0, 20);

  var byLine = text.split(/\n/).map(function(p) { return p.trim(); }).filter(function(p) { return p.length > 20; });
  if (byLine.length >= 2) return byLine.slice(0, 20);

  var sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
  var paras = [];
  var current = '';
  for (var i = 0; i < sentences.length; i++) {
    current += sentences[i];
    if (current.length > 400) {
      paras.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) paras.push(current.trim());
  return paras.slice(0, 20);
}

// Descarga el artículo completo e intenta extraer párrafos
function fetchArticleParas(url) {
  if (!url) return [];
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
    });
    if (resp.getResponseCode() !== 200) return [];
    var html = resp.getContentText();
    if (html.length > 500000) html = html.substring(0, 500000);

    // JSON-LD articleBody (muy fiable en medios argentinos)
    var ldRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    var ldMatch;
    while ((ldMatch = ldRe.exec(html)) !== null) {
      try {
        var ld = JSON.parse(ldMatch[1]);
        var candidates = Array.isArray(ld['@graph']) ? ld['@graph'] : [ld];
        for (var k = 0; k < candidates.length; k++) {
          var body = candidates[k].articleBody;
          if (body && body.length > 100) {
            return splitIntoParagraphs(body);
          }
        }
      } catch (_) {}
    }

    // Fallback: etiquetas <p>
    var paras = [];
    var re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var text = m[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
        .replace(/\s{2,}/g, ' ').trim();
      if (text.length > 60) paras.push(text);
    }
    return paras.slice(0, 20);
  } catch (e) {
    return [];
  }
}

// ─── Helpers XML ───────────────────────────────────────────────────────────────

function getText(el, name) {
  var child = el.getChild(name);
  return child ? child.getText().trim() : '';
}

function getAttr(el, name, attr) {
  var child = el.getChild(name);
  return child ? child.getAttribute(attr) && child.getAttribute(attr).getValue() : '';
}

function containsExcluded(text) {
  var lower = text.toLowerCase();
  for (var i = 0; i < EXCLUDE_KEYWORDS.length; i++) {
    if (lower.indexOf(EXCLUDE_KEYWORDS[i]) !== -1) return true;
  }
  return false;
}

function sanitize(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
}

function trimDesc(desc) {
  if (!desc) return '';
  var clean = sanitize(desc);
  return clean.length > 200 ? clean.substring(0, 200) + '…' : clean;
}

function formatDate(raw) {
  if (!raw) return '';
  try {
    var d = new Date(raw);
    return d.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });
  } catch (_) {
    return raw;
  }
}

function buildJSON(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
