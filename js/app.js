// ─── Estado global ─────────────────────────────────────────────────────────────

const state = {
  photos:       [],
  photoIndex:   0,
  newsItems:    [],
  newsIndex:    0,
  overlayTimer: null,
  triviaItems:  [],
  triviaCurrent: null,
  triviaAutoKey: null,
};

// ─── Utilidades ────────────────────────────────────────────────────────────────

function log(msg, ...args) {
  // Errores solo van a consola, NUNCA a la UI
  console.log('[Lela]', msg, ...args);
}

function saveCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
}

function loadCache(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Reloj / Fecha ─────────────────────────────────────────────────────────────

const DIAS   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function updateClock() {
  const now  = new Date();
  const dia  = DIAS[now.getDay()];
  const num  = now.getDate();
  const mes  = MESES[now.getMonth()];
  const hh   = String(now.getHours()).padStart(2, '0');
  const mm   = String(now.getMinutes()).padStart(2, '0');

  document.getElementById('clock-date').textContent = `${dia} ${num} de ${mes}`;
  document.getElementById('clock-time').textContent = `${hh}:${mm}`;

  maybeAutoTrivia(now);
}

// Dispara la trivia sola a ciertas horas del día (una vez por hora objetivo)
function maybeAutoTrivia(now) {
  if (!state.triviaItems.length) return;
  if (now.getMinutes() !== 0) return;
  if (!CONFIG.TRIVIA_AUTO_HOURS.includes(now.getHours())) return;

  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  if (state.triviaAutoKey === key) return;
  state.triviaAutoKey = key;

  const anyOverlayOpen = document.getElementById('overlay').classList.contains('visible')
    || document.getElementById('reader-overlay').classList.contains('visible')
    || document.getElementById('trivia-overlay').classList.contains('visible');
  if (anyOverlayOpen) return;

  openTrivia();
}

function startClock() {
  updateClock();
  // Sincronizar al siguiente minuto exacto
  const msToNextMinute = (60 - new Date().getSeconds()) * 1000;
  setTimeout(() => {
    updateClock();
    setInterval(updateClock, 60_000);
  }, msToNextMinute);
}

// ─── Fotos ─────────────────────────────────────────────────────────────────────

const divA = document.getElementById('photo-a');
const divB = document.getElementById('photo-b');
let   activeDiv = 'a';

function setPhoto(url) {
  const next = activeDiv === 'a' ? divB : divA;
  const curr = activeDiv === 'a' ? divA : divB;

  // Precargar antes de mostrar para evitar flash vacío
  const preload = new Image();
  preload.onload = () => {
    next.style.backgroundImage = `url('${url}')`;
    next.classList.add('visible');
    setTimeout(() => curr.classList.remove('visible'), CONFIG.PHOTO_FADE_MS);
    activeDiv = activeDiv === 'a' ? 'b' : 'a';
  };
  preload.onerror = () => {
    log('Foto no cargó:', url);
    advancePhoto();
  };
  preload.src = url;
}

function advancePhoto() {
  if (!state.photos.length) return;
  state.photoIndex = (state.photoIndex + 1) % state.photos.length;
  setPhoto(state.photos[state.photoIndex].url);
}

function previousPhoto() {
  if (!state.photos.length) return;
  state.photoIndex = (state.photoIndex - 1 + state.photos.length) % state.photos.length;
  setPhoto(state.photos[state.photoIndex].url);
}

function startPhotoLoop() {
  if (!state.photos.length) return;
  const firstUrl = state.photos[0].url;
  divA.style.backgroundImage = `url('${firstUrl}')`;
  divA.classList.add('visible');
  setInterval(advancePhoto, CONFIG.PHOTO_INTERVAL_MS);
}

async function loadPhotos() {
  try {
    const data = await fetchJSON(CONFIG.PHOTOS_ENDPOINT);
    if (data.photos && data.photos.length > 0) {
      state.photos = shuffleArray(data.photos);
      saveCache('photos', state.photos);
      log('Fotos cargadas:', state.photos.length);
    }
  } catch (err) {
    log('Error cargando fotos, usando caché:', err.message);
    const cached = loadCache('photos');
    if (cached && cached.length > 0 && state.photos.length === 0) {
      state.photos = cached;
    }
  }
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Clima ─────────────────────────────────────────────────────────────────────

async function loadWeather() {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${CONFIG.WEATHER_LAT}` +
    `&longitude=${CONFIG.WEATHER_LON}` +
    `&current=temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&timezone=${encodeURIComponent(CONFIG.WEATHER_TIMEZONE)}` +
    `&forecast_days=4`;

  try {
    const data = await fetchJSON(url);
    saveCache('weather', data);
    renderWeatherWidget(data);
    log('Clima actualizado');
  } catch (err) {
    log('Error clima, usando caché:', err.message);
    const cached = loadCache('weather');
    if (cached) renderWeatherWidget(cached);
  }
}

function renderWeatherWidget(data) {
  const temp   = Math.round(data.current.temperature_2m);
  const code   = data.current.weather_code;
  const info   = getWeatherInfo(code);

  document.getElementById('weather-emoji').textContent = info.emoji;
  document.getElementById('weather-temp').textContent  = `${temp}°`;
  document.getElementById('weather-desc').textContent  = info.text;

  // Guardar data para el overlay de detalle
  document.getElementById('weather-widget').dataset.weatherJson = JSON.stringify(data);
}

function buildWeatherDetailHTML(data) {
  const labels = ['Hoy', 'Mañana'];
  const rows = data.daily.time.slice(0, 2).map((dateStr, i) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateLabel = `${day} de ${MESES[month - 1]}`;
    const code = data.daily.weather_code[i];
    const info = getWeatherInfo(code);
    const max  = Math.round(data.daily.temperature_2m_max[i]);
    const min  = Math.round(data.daily.temperature_2m_min[i]);
    return `<div class="forecast-row">
      <div class="forecast-day-block">
        <span class="forecast-day">${labels[i]}</span>
        <span class="forecast-date">${dateLabel}</span>
      </div>
      <span class="forecast-emoji">${info.emoji}</span>
      <span class="forecast-desc">${info.text}</span>
      <div class="forecast-temps">
        <span class="temp-max">▲ Máx. ${max}°</span>
        <span class="temp-min">▼ Mín. ${min}°</span>
      </div>
    </div>`;
  }).join('');

  return `<h2 class="overlay-title">El tiempo</h2>${rows}`;
}

// ─── Noticias ──────────────────────────────────────────────────────────────────

async function loadNews() {
  try {
    const data = await fetchJSON(CONFIG.NEWS_ENDPOINT);
    if (data.items && data.items.length > 0) {
      state.newsItems = data.items;
      saveCache('news', data.items);
      log('Noticias cargadas:', data.items.length);
    }
  } catch (err) {
    log('Error noticias, usando caché:', err.message);
    const cached = loadCache('news');
    if (cached && cached.length > 0 && state.newsItems.length === 0) {
      state.newsItems = cached;
    }
  }
}

function advanceNews() {
  if (!state.newsItems.length) return;
  const el    = document.getElementById('news-text');
  state.newsIndex = (state.newsIndex + 1) % state.newsItems.length;
  const item  = state.newsItems[state.newsIndex];

  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent  = item.title;
    el.style.opacity = '1';
  }, CONFIG.NEWS_FADE_MS);
}

function startNewsLoop() {
  if (!state.newsItems.length) return;
  const el = document.getElementById('news-text');
  el.textContent = state.newsItems[0].title;

  setInterval(advanceNews, CONFIG.NEWS_INTERVAL_MS);
}

// ─── Trivia ────────────────────────────────────────────────────────────────────

async function loadTrivia() {
  try {
    const data = await fetchJSON(CONFIG.TRIVIA_ENDPOINT);
    if (data.questions && data.questions.length > 0) {
      state.triviaItems = data.questions;
      saveCache('trivia', data.questions);
      log('Trivia cargada:', data.questions.length);
    }
  } catch (err) {
    log('Error cargando trivia, usando caché:', err.message);
    const cached = loadCache('trivia');
    if (cached && cached.length > 0 && state.triviaItems.length === 0) {
      state.triviaItems = cached;
    }
  }
}

function pickTriviaQuestion() {
  const items = state.triviaItems;
  return items[Math.floor(Math.random() * items.length)];
}

function renderTriviaQuestion(q) {
  state.triviaCurrent = q;

  hideCorrection();
  document.getElementById('trivia-question').textContent = q.pregunta;

  const options = shuffleArray([q.correcta, ...q.incorrectas]);
  const container = document.getElementById('trivia-options');
  container.innerHTML = '';

  options.forEach((text) => {
    const btn = document.createElement('button');
    btn.className = 'trivia-option';
    btn.textContent = text;
    btn.addEventListener('click', () => handleTriviaAnswer(btn, text));
    container.appendChild(btn);
  });
}

function showCorrection(q) {
  document.getElementById('trivia-question-view').classList.add('hidden');
  document.getElementById('trivia-correction-text').textContent = q.correccion || 'No es correcto, ¡probá de nuevo!';
  document.getElementById('trivia-correction-view').classList.add('visible');
}

function hideCorrection() {
  document.getElementById('trivia-correction-view').classList.remove('visible');
  document.getElementById('trivia-question-view').classList.remove('hidden');
}

function handleTriviaAnswer(btn, selected) {
  const q = state.triviaCurrent;
  const isCorrect = selected === q.correcta;
  const buttons = [...document.getElementById('trivia-options').children];
  buttons.forEach(b => b.disabled = true);

  if (isCorrect) {
    btn.classList.add('correct');
    launchConfetti();
    setTimeout(closeTrivia, 1400);
  } else {
    btn.classList.add('wrong');
    document.getElementById('trivia-card').classList.add('trivia-shake');
    setTimeout(() => document.getElementById('trivia-card').classList.remove('trivia-shake'), 450);

    setTimeout(() => showCorrection(q), 700);
  }
}

const CONFETTI_COLORS = ['#f5c842', '#4ec86e', '#5aa9ff', '#ff6b8a', '#c47af0'];

function launchConfetti() {
  const container = document.getElementById('trivia-confetti');
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    piece.style.animationDuration = `${1.1 + Math.random() * 0.6}s`;
    container.appendChild(piece);
    setTimeout(() => piece.remove(), 2200);
  }
}

function openTrivia() {
  if (!state.triviaItems.length) return;
  renderTriviaQuestion(pickTriviaQuestion());
  document.getElementById('trivia-overlay').classList.add('visible');
}

function closeTrivia() {
  document.getElementById('trivia-overlay').classList.remove('visible');
}

// ─── Overlay de clima ──────────────────────────────────────────────────────────

function openOverlay(contentHTML) {
  const overlay = document.getElementById('overlay');
  document.getElementById('overlay-body').innerHTML = contentHTML;
  overlay.classList.add('visible');
  resetOverlayTimer();
}

function closeOverlay() {
  document.getElementById('overlay').classList.remove('visible');
  clearTimeout(state.overlayTimer);
}

function resetOverlayTimer() {
  clearTimeout(state.overlayTimer);
  state.overlayTimer = setTimeout(closeOverlay, CONFIG.OVERLAY_TIMEOUT_MS);
}

// ─── Reader de noticias ────────────────────────────────────────────────────────

function buildReaderHTML(item) {
  const parts = [];

  // Fuente
  if (item.source) {
    parts.push(`<p class="reader-source">${item.source}</p>`);
  }

  // Título
  parts.push(`<h2 class="reader-title">${item.title}</h2>`);

  // Fecha
  if (item.date) {
    parts.push(`<p class="reader-date">${item.date}</p>`);
  }

  parts.push('<hr class="reader-separator">');

  // Imagen principal
  const hasImages = item.images && item.images.length > 0;
  if (hasImages) {
    parts.push(`<img class="reader-image" src="${item.images[0]}" alt="" onerror="this.style.display='none'">`);
  }

  // Cuerpo: párrafos o summary de fallback
  const hasParas = item.paragraphs && item.paragraphs.length > 0;
  if (hasParas) {
    item.paragraphs.forEach(p => {
      parts.push(`<p class="reader-para">${p}</p>`);
    });
    // Segunda imagen intercalada si existe
    if (hasImages && item.images.length > 1) {
      parts.push(`<img class="reader-image" src="${item.images[1]}" alt="" onerror="this.style.display='none'">`);
    }
  } else if (item.summary) {
    parts.push(`<p class="reader-para">${item.summary}</p>`);
  }

  return parts.join('');
}

function openReader(item) {
  document.getElementById('reader-body').innerHTML = buildReaderHTML(item);
  document.getElementById('reader-scroll').scrollTop = 0;
  document.getElementById('reader-overlay').classList.add('visible');
}

function closeReader() {
  document.getElementById('reader-overlay').classList.remove('visible');
}

// ─── Swipe para cambiar foto ───────────────────────────────────────────────────

let swipeStartX = null;

function setupSwipe() {
  const container = document.getElementById('photo-container');
  container.addEventListener('touchstart', (e) => {
    swipeStartX = e.touches[0].clientX;
  }, { passive: true });
  container.addEventListener('touchend', (e) => {
    if (swipeStartX === null) return;
    const delta = e.changedTouches[0].clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) advancePhoto();
    else previousPhoto();
  }, { passive: true });
}

// ─── Auto-actualización ─────────────────────────────────────────────────────────
// El iPad queda prendido 24/7 sin que nadie navegue nunca, así que la página
// nunca se recarga sola y se queda corriendo el JS de la primera carga para
// siempre. Esto chequea periódicamente si hubo un deploy nuevo (comparando el
// build-version embebido contra el que sirve el servidor) y recarga sola.
// El botón de refresh es el respaldo manual por si esto falla.

const CURRENT_BUILD = document.querySelector('meta[name="build-version"]')?.content || '';

async function checkForUpdate() {
  try {
    const res = await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' });
    const html = await res.text();
    const match = html.match(/<meta name="build-version" content="([^"]+)">/);
    const serverBuild = match ? match[1] : null;

    if (serverBuild && CURRENT_BUILD && serverBuild !== CURRENT_BUILD) {
      log('Nueva versión detectada:', serverBuild, '(actual:', CURRENT_BUILD + ')');
      // No interrumpir si está mirando el clima o leyendo una noticia
      const overlayOpen = document.getElementById('overlay').classList.contains('visible')
        || document.getElementById('reader-overlay').classList.contains('visible');
      if (!overlayOpen) location.reload();
    }
  } catch (err) {
    log('Error chequeando versión:', err.message);
  }
}

function startVersionCheck() {
  setInterval(checkForUpdate, CONFIG.VERSION_CHECK_MS);
}

// ─── Event listeners ───────────────────────────────────────────────────────────

function setupListeners() {
  // Tap en widget de clima → abrir detalle
  document.getElementById('weather-widget').addEventListener('click', () => {
    const raw = document.getElementById('weather-widget').dataset.weatherJson;
    if (!raw) return;
    openOverlay(buildWeatherDetailHTML(JSON.parse(raw)));
  });

  // Tap en noticias → abrir reader
  document.getElementById('news-bar').addEventListener('click', () => {
    const item = state.newsItems[state.newsIndex];
    if (item) openReader(item);
  });

  // Cerrar reader tocando el fondo
  document.getElementById('reader-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('reader-overlay')) closeReader();
  });

  // Botón cerrar reader
  document.getElementById('reader-close').addEventListener('click', closeReader);

  // Cerrar overlay de clima tocando fondo
  document.getElementById('overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('overlay')) closeOverlay();
  });

  // Tap en botón cerrar overlay de clima
  document.getElementById('overlay-close').addEventListener('click', closeOverlay);

  // Botón de actualizar (respaldo manual del auto-refresh)
  document.getElementById('refresh-btn').addEventListener('click', () => location.reload());

  // Tap en ícono de trivia → abrir juego
  document.getElementById('trivia-icon').addEventListener('click', openTrivia);

  // Cerrar trivia tocando el fondo o el botón
  document.getElementById('trivia-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('trivia-overlay')) closeTrivia();
  });
  document.getElementById('trivia-close').addEventListener('click', closeTrivia);

  // Botón "Continuar" tras leer la corrección → repite la misma pregunta
  document.getElementById('trivia-continue').addEventListener('click', () => {
    renderTriviaQuestion(state.triviaCurrent);
  });

  // Cualquier toque en el overlay de clima reinicia el timer de cierre automático
  document.getElementById('overlay-card').addEventListener('click', resetOverlayTimer);
}

// ─── Arranque ──────────────────────────────────────────────────────────────────

async function init() {
  setupListeners();
  setupSwipe();
  startClock();

  // Limpiar caché de fotos demo (Unsplash) si quedó de una versión anterior
  const _rawPhotos = loadCache('photos');
  if (_rawPhotos && _rawPhotos.some(p => p.url && p.url.includes('unsplash.com'))) {
    try { localStorage.removeItem('photos'); } catch (_) {}
  }

  // Cargar datos iniciales (primero caché, luego red)
  // Fotos: arrancar con caché si existe, mientras carga la lista real
  const cachedPhotos = loadCache('photos');
  if (cachedPhotos && cachedPhotos.length > 0) {
    state.photos = cachedPhotos;
    startPhotoLoop();
  }

  const cachedNews = loadCache('news');
  if (cachedNews && cachedNews.length > 0) {
    state.newsItems = cachedNews;
    startNewsLoop();
  }

  const cachedWeather = loadCache('weather');
  if (cachedWeather) renderWeatherWidget(cachedWeather);

  const cachedTrivia = loadCache('trivia');
  if (cachedTrivia && cachedTrivia.length > 0) state.triviaItems = cachedTrivia;

  // Ahora cargar de red
  await Promise.allSettled([loadPhotos(), loadWeather(), loadNews(), loadTrivia()]);

  // Si no había caché de fotos, arrancar ahora que cargaron de red
  if (!cachedPhotos || cachedPhotos.length === 0) startPhotoLoop();
  if (!cachedNews  || cachedNews.length  === 0) startNewsLoop();

  // Refrescos periódicos
  setInterval(loadPhotos,  CONFIG.PHOTOS_REFRESH_MS);
  setInterval(loadWeather, CONFIG.WEATHER_REFRESH_MS);
  setInterval(loadNews,    CONFIG.NEWS_REFRESH_MS);
  setInterval(loadTrivia,  CONFIG.TRIVIA_REFRESH_MS);
  startVersionCheck();
}

document.addEventListener('DOMContentLoaded', init);
