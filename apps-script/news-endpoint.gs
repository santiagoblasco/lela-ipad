// ─── Apps Script: Endpoint de noticias ────────────────────────────────────────
// Este script tiene DOS roles:
//   1. Trigger diario (7am): fetch del RSS → filtra → guarda en Script Properties
//   2. doGet: sirve las noticias ya cacheadas al frontend
//
// Deploy: mismo proceso que photos-endpoint.gs (puede ser el mismo script o uno aparte)
//   Si es el mismo script: combinar doGet() de ambos archivos en uno solo.
//   Si es aparte: usar una URL diferente en CONFIG.NEWS_ENDPOINT
//
// Trigger: Apps Script → Desencadenadores → Agregar desencadenador
//   Función: refreshNews
//   Fuente: Temporizador → Cronológico por días → Entre 7:00 y 8:00 AM

// ── Fuentes RSS a intentar (en orden de preferencia) ──────────────────────────
// Si la primera falla, se intenta la siguiente. Verificar cuál funciona mejor.
var RSS_SOURCES = [
  { name: 'La Nación', url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml' },
  { name: 'Infobae',   url: 'https://www.infobae.com/feeds/rss/' },
  { name: 'Clarín',    url: 'https://www.clarin.com/rss/lo-ultimo/' },
];

// Palabras clave a excluir (sincronizar con CONFIG.NEWS_EXCLUDE_KEYWORDS del frontend)
var EXCLUDE_KEYWORDS = [
  'asesinato', 'crimen', 'femicidio', 'violación', 'secuestro', 'robo',
  'accidente fatal', 'fallecido', 'muerto', 'muerte', 'tragedia',
  'huelga de hambre', 'represión', 'desaparecido',
];

var MAX_NEWS = 5; // máximo de titulares a mostrar

// ─── Trigger diario ────────────────────────────────────────────────────────────

function refreshNews() {
  var items = [];

  for (var s = 0; s < RSS_SOURCES.length && items.length === 0; s++) {
    var source = RSS_SOURCES[s];
    try {
      var response = UrlFetchApp.fetch(source.url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) continue;

      var xml  = response.getContentText();
      var doc  = XmlService.parse(xml);
      var root = doc.getRootElement();

      // Soporte RSS 2.0 y Atom
      var entries = root.getChildren('channel').length > 0
        ? root.getChild('channel').getChildren('item')     // RSS 2.0
        : root.getChildren('entry');                       // Atom

      for (var i = 0; i < entries.length && items.length < MAX_NEWS; i++) {
        var entry = entries[i];
        var title = getText(entry, 'title');
        var link  = getText(entry, 'link') || getAttr(entry, 'link', 'href');
        var desc  = getText(entry, 'description') || getText(entry, 'summary');
        var date  = getText(entry, 'pubDate') || getText(entry, 'updated') || '';

        if (!title) continue;
        if (containsExcluded(title + ' ' + desc)) continue;

        items.push({
          title:   sanitize(title),
          summary: sanitize(trimDesc(desc)),
          link:    link || '',
          source:  source.name,
          date:    formatDate(date),
        });
      }

      if (items.length > 0) {
        Logger.log('RSS OK desde: ' + source.name + ' (' + items.length + ' titulares)');
      }
    } catch (err) {
      Logger.log('Error RSS ' + source.name + ': ' + err.message);
    }
  }

  if (items.length === 0) {
    Logger.log('Ninguna fuente RSS respondió. Manteniendo noticias anteriores.');
    return;
  }

  var payload = JSON.stringify({ updated_at: new Date().toISOString(), items: items });
  PropertiesService.getScriptProperties().setProperty('news_cache', payload);
  Logger.log('Noticias guardadas: ' + items.length);
}

// ─── doGet: servir noticias cacheadas ──────────────────────────────────────────

function doGet(e) {
  var resource = (e && e.parameter && e.parameter.resource) ? e.parameter.resource : '';

  if (resource === 'news') {
    return handleNews();
  }

  // Si este script también maneja fotos, agregar aquí:
  // if (resource === 'photos') { return handlePhotos(); }

  return buildJSON({ error: 'recurso no reconocido' });
}

function handleNews() {
  var cached = PropertiesService.getScriptProperties().getProperty('news_cache');

  if (!cached) {
    // Primera vez: intentar fetch inmediato
    refreshNews();
    cached = PropertiesService.getScriptProperties().getProperty('news_cache');
  }

  if (!cached) {
    return buildJSON({ items: [], updated_at: null });
  }

  return buildJSON(JSON.parse(cached));
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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
  // Eliminar tags HTML básicos
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
