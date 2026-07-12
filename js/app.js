// ─── Modo demo (activo cuando los endpoints no están configurados) ──────────────

const DEMO_PHOTOS = [
  // Fotos de Unsplash (libre de derechos, tamaño controlado)
  { id: 'd1', url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=1600&q=80' },
  { id: 'd2', url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&q=80' },
  { id: 'd3', url: 'https://images.unsplash.com/photo-1511895426328-dc8714191011?w=1600&q=80' },
  { id: 'd4', url: 'https://images.unsplash.com/photo-1464207687429-7505649dae38?w=1600&q=80' },
];

const DEMO_NEWS = [
  { title: 'El tiempo mejora en Buenos Aires esta semana', source: 'Demo', date: 'hoy' },
  { title: 'Récord de visitantes en los parques nacionales argentinos', source: 'Demo', date: 'hoy' },
  { title: 'Nuevo tango argentino triunfa en festivales internacionales', source: 'Demo', date: 'hoy' },
];

function isPlaceholder(url) {
  return url.includes('REPLACE_WITH');
}

// ─── Estado global ─────────────────────────────────────────────────────────────

const state = {
  photos:       [],
  photoIndex:   0,
  newsItems:    [],
  newsIndex:    0,
  overlayTimer: null,
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

function startPhotoLoop() {
  if (!state.photos.length) return;
  const firstUrl = state.photos[0].url;
  divA.style.backgroundImage = `url('${firstUrl}')`;
  divA.classList.add('visible');
  setInterval(advancePhoto, CONFIG.PHOTO_INTERVAL_MS);
}

async function loadPhotos() {
  if (isPlaceholder(CONFIG.PHOTOS_ENDPOINT)) {
    if (state.photos.length === 0) {
      state.photos = DEMO_PHOTOS;
      log('Modo demo: usando fotos de ejemplo');
    }
    return;
  }
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
  const days = ['Hoy', 'Mañana', 'Pasado', 'En 3 días'];
  const rows = data.daily.time.slice(0, 4).map((_, i) => {
    const code = data.daily.weather_code[i];
    const info = getWeatherInfo(code);
    const max  = Math.round(data.daily.temperature_2m_max[i]);
    const min  = Math.round(data.daily.temperature_2m_min[i]);
    return `<div class="forecast-row">
      <span class="forecast-day">${days[i]}</span>
      <span class="forecast-emoji">${info.emoji}</span>
      <span class="forecast-desc">${info.text}</span>
      <span class="forecast-temps">${max}° / ${min}°</span>
    </div>`;
  }).join('');

  return `<h2 class="overlay-title">Pronóstico</h2>${rows}`;
}

// ─── Noticias ──────────────────────────────────────────────────────────────────

async function loadNews() {
  if (isPlaceholder(CONFIG.NEWS_ENDPOINT)) {
    if (state.newsItems.length === 0) {
      state.newsItems = DEMO_NEWS;
      log('Modo demo: usando noticias de ejemplo');
    }
    return;
  }
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

// ─── Overlays ──────────────────────────────────────────────────────────────────

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

// ─── Event listeners ───────────────────────────────────────────────────────────

function setupListeners() {
  // Tap en widget de clima → abrir detalle
  document.getElementById('weather-widget').addEventListener('click', () => {
    const raw = document.getElementById('weather-widget').dataset.weatherJson;
    if (!raw) return;
    openOverlay(buildWeatherDetailHTML(JSON.parse(raw)));
  });

  // Tap en noticias → abrir detalle de la noticia actual
  document.getElementById('news-bar').addEventListener('click', () => {
    const item = state.newsItems[state.newsIndex];
    if (!item) return;
    const html = `<h2 class="overlay-title">Noticia</h2>
      <p class="overlay-news-title">${item.title}</p>
      ${item.summary ? `<p class="overlay-news-summary">${item.summary}</p>` : ''}
      <p class="overlay-news-source">${item.source ?? ''} · ${item.date ?? ''}</p>`;
    openOverlay(html);
  });

  // Cerrar overlay tocando fondo
  document.getElementById('overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('overlay')) closeOverlay();
  });

  // Tap en botón cerrar overlay
  document.getElementById('overlay-close').addEventListener('click', closeOverlay);

  // Cualquier toque en el overlay reinicia el timer de cierre automático
  document.getElementById('overlay-card').addEventListener('click', resetOverlayTimer);
}

// ─── Arranque ──────────────────────────────────────────────────────────────────

async function init() {
  setupListeners();
  startClock();

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

  // Ahora cargar de red
  await Promise.allSettled([loadPhotos(), loadWeather(), loadNews()]);

  // Si no había caché de fotos, arrancar ahora que cargaron de red
  if (!cachedPhotos || cachedPhotos.length === 0) startPhotoLoop();
  if (!cachedNews  || cachedNews.length  === 0) startNewsLoop();

  // Refrescos periódicos
  setInterval(loadPhotos,  CONFIG.PHOTOS_REFRESH_MS);
  setInterval(loadWeather, CONFIG.WEATHER_REFRESH_MS);
  setInterval(loadNews,    CONFIG.NEWS_REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', init);
