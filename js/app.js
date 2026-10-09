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

  updateNightMode(now);
  maybeAutoTrivia(now);
  updateBirthdayBanner(now);
  maybeAnnounceBirthday(now);
}

// Pantalla negra de 00:00 a 09:00 para ahorrar batería
function updateNightMode(now) {
  const isNight = now.getHours() < 9;
  document.getElementById('night-overlay').classList.toggle('visible', isNight);
}

// ─── Sonido de notificación ────────────────────────────────────────────────────
// iOS/Safari bloquea el audio hasta que hay un toque del usuario: el AudioContext
// se crea/desbloquea en el primer toque y después se puede usar desde el timer.
let audioCtx = null;

function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (err) {
    log('No se pudo activar el audio:', err.message);
  }
}

// Campanita de dos notas (tipo notificación)
function playNotificationSound() {
  try {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const t0 = audioCtx.currentTime;
    [[880, 0], [1318.5, 0.18]].forEach(([freq, offset]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.5, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.9);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 1);
    });
  } catch (err) {
    log('No se pudo reproducir el sonido:', err.message);
  }
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
  playNotificationSound();
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

// ─── Cumpleaños ────────────────────────────────────────────────────────────────
// Recordatorios de cumpleaños de otras personas (no son saludos dirigidos a Susana).

let birthdayAnnounceKey  = null;
let calendarViewDate     = null; // mes que se está mostrando en el calendario

// Días que faltan hasta la próxima ocurrencia de un cumpleaños (0 = hoy)
function daysUntilBirthday(bday, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), bday.month - 1, bday.day);
  if (next < today) next = new Date(now.getFullYear() + 1, bday.month - 1, bday.day);
  return Math.round((next - today) / 86_400_000);
}

// Todos los cumpleaños ordenados por cercanía (el/los más próximos primero)
function getUpcomingBirthdays(now) {
  return CONFIG.BIRTHDAYS
    .map(b => ({ ...b, daysUntil: daysUntilBirthday(b, now) }))
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

// "en 3 días" / "en 2 semanas y 3 días" / "en 4 meses y 2 días"
function formatDaysUntil(days) {
  if (days < 7) return `en ${days} día${days === 1 ? '' : 's'}`;

  if (days < 31) {
    const weeks = Math.floor(days / 7);
    const rest  = days % 7;
    const base  = `en ${weeks} semana${weeks === 1 ? '' : 's'}`;
    return rest ? `${base} y ${rest} día${rest === 1 ? '' : 's'}` : base;
  }

  const months = Math.floor(days / 30);
  const rest   = days % 30;
  const base   = `en ${months} mes${months === 1 ? '' : 'es'}`;
  return rest ? `${base} y ${rest} día${rest === 1 ? '' : 's'}` : base;
}

// Banner discreto que avisa cuando se acerca un cumpleaños (o si es hoy)
function updateBirthdayBanner(now) {
  const banner = document.getElementById('birthday-banner');
  const [next, ...rest] = getUpcomingBirthdays(now);

  if (!next || next.daysUntil > CONFIG.BIRTHDAY_WARNING_DAYS) {
    banner.classList.remove('visible');
    return;
  }

  const names = [next, ...rest.filter(b => b.daysUntil === next.daysUntil)]
    .map(b => b.name).join(' y ');

  banner.textContent = next.daysUntil === 0
    ? `🎂 Hoy es el cumpleaños de ${names}`
    : `🎂 Cumple de ${names} ${formatDaysUntil(next.daysUntil)}`;
  banner.classList.add('visible');
}

// Anuncio a las 9 AM si hoy es el cumpleaños de alguien
function maybeAnnounceBirthday(now) {
  if (now.getHours() !== CONFIG.BIRTHDAY_ANNOUNCE_HOUR || now.getMinutes() !== 0) return;

  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (birthdayAnnounceKey === key) return;
  birthdayAnnounceKey = key;

  const todays = CONFIG.BIRTHDAYS.filter(b => b.day === now.getDate() && b.month === now.getMonth() + 1);
  if (!todays.length) return;

  const anyOverlayOpen = document.getElementById('overlay').classList.contains('visible')
    || document.getElementById('reader-overlay').classList.contains('visible')
    || document.getElementById('trivia-overlay').classList.contains('visible');
  if (anyOverlayOpen) return;

  const names = todays.map(b => b.name).join(' y ');
  openOverlay(`<h2 class="overlay-title">🎂 Recordatorio de cumpleaños</h2><p class="birthday-announce-text">Hoy es el cumpleaños de<br><strong>${names}</strong></p>`);
  launchConfetti();
}

// Calendario de un mes: hoy, cumpleaños marcados y próximo cumpleaños
function buildBirthdayCalendarHTML(viewDate, now) {
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexado
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const bdaysThisMonth = new Set(
    CONFIG.BIRTHDAYS.filter(b => b.month === month + 1).map(b => b.day)
  );

  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Domingo
  const daysInMonth  = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push('<span class="calendar-day empty"></span>');
  for (let d = 1; d <= daysInMonth; d++) {
    const classes = ['calendar-day'];
    if (isCurrentMonth && d === now.getDate()) classes.push('today');
    if (bdaysThisMonth.has(d)) classes.push('birthday');
    cells.push(`<span class="${classes.join(' ')}">${d}</span>`);
  }

  const weekHeaders = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
    .map(d => `<span class="calendar-day-header">${d}</span>`).join('');

  const [next] = getUpcomingBirthdays(now);
  const nextText = next.daysUntil === 0
    ? `🎂 Hoy es el cumpleaños de ${next.name}`
    : `🎂 Próximo cumpleaños: ${next.name}, ${formatDaysUntil(next.daysUntil)}`;

  return `
    <div class="calendar-nav">
      <button id="calendar-prev" class="calendar-nav-btn" aria-label="Mes anterior">‹</button>
      <h2 class="calendar-month-title">${MESES[month]} de ${year}</h2>
      <button id="calendar-next" class="calendar-nav-btn" aria-label="Mes siguiente">›</button>
    </div>
    <p class="calendar-today">Hoy es ${DIAS[now.getDay()]} ${now.getDate()} de ${MESES[now.getMonth()]}</p>
    <div class="calendar-grid">${weekHeaders}${cells.join('')}</div>
    <p class="calendar-next-birthday">${nextText}</p>
  `;
}

// Dibuja el mes actualmente seleccionado y conecta flechas + swipe
function renderBirthdayCalendar() {
  document.getElementById('overlay-body').innerHTML = buildBirthdayCalendarHTML(calendarViewDate, new Date());
  setupCalendarNav();
}

function changeCalendarMonth(offset) {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + offset, 1);
  renderBirthdayCalendar();
  resetOverlayTimer();
}

function setupCalendarNav() {
  document.getElementById('calendar-prev').addEventListener('click', () => changeCalendarMonth(-1));
  document.getElementById('calendar-next').addEventListener('click', () => changeCalendarMonth(1));

  let startX = null;
  let startY = null;
  const grid = document.querySelector('.calendar-grid');

  grid.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  // Si el gesto es horizontal, evitar que el navegador lo interprete como scroll
  // (si no, en algunos táctiles el swipe se cancela antes de llegar a touchend)
  grid.addEventListener('touchmove', (e) => {
    if (startX === null) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
  }, { passive: false });

  grid.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const delta = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(delta) < 40) return;
    changeCalendarMonth(delta < 0 ? 1 : -1);
  }, { passive: true });
}

function openBirthdayCalendar() {
  const now = new Date();
  calendarViewDate = new Date(now.getFullYear(), now.getMonth(), 1);
  openOverlay(buildBirthdayCalendarHTML(calendarViewDate, now));
  setupCalendarNav();
}

// ─── Fotos ─────────────────────────────────────────────────────────────────────

const divA = document.getElementById('photo-a');
const divB = document.getElementById('photo-b');
let   activeDiv = 'a';
let   photoTimerId = null;

// Precarga las 2 fotos anteriores y las 2 siguientes para que el swipe sea instantáneo
function preloadAdjacentPhotos() {
  const total = state.photos.length;
  if (!total) return;
  [-2, -1, 1, 2].forEach((offset) => {
    const idx = ((state.photoIndex + offset) % total + total) % total;
    new Image().src = state.photos[idx].url;
  });
}

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
  preloadAdjacentPhotos();
}

function previousPhoto() {
  if (!state.photos.length) return;
  state.photoIndex = (state.photoIndex - 1 + state.photos.length) % state.photos.length;
  setPhoto(state.photos[state.photoIndex].url);
  preloadAdjacentPhotos();
}

// Reinicia la cuenta regresiva para el próximo cambio automático de foto
function schedulePhotoAdvance() {
  clearTimeout(photoTimerId);
  photoTimerId = setTimeout(() => {
    advancePhoto();
    schedulePhotoAdvance();
  }, CONFIG.PHOTO_INTERVAL_MS);
}

function startPhotoLoop() {
  if (!state.photos.length) return;
  const firstUrl = state.photos[0].url;
  divA.style.backgroundImage = `url('${firstUrl}')`;
  divA.classList.add('visible');
  preloadAdjacentPhotos();
  schedulePhotoAdvance();
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
    `&forecast_days=7`;

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
  const rows = data.daily.time.slice(0, 7).map((dateStr, i) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateLabel = `${day} de ${MESES[month - 1]}`;

    let dayLabel;
    if      (i === 0) dayLabel = 'Hoy';
    else if (i === 1) dayLabel = 'Mañana';
    else              dayLabel = DIAS[new Date(year, month - 1, day).getDay()];

    // Hoy: usar condición actual para que coincida con el widget
    const code = (i === 0) ? data.current.weather_code : data.daily.weather_code[i];
    const info = getWeatherInfo(code);
    const max  = Math.round(data.daily.temperature_2m_max[i]);
    const min  = Math.round(data.daily.temperature_2m_min[i]);

    const nowRow = (i === 0)
      ? `<span class="temp-now">Ahora: ${Math.round(data.current.temperature_2m)}°</span>`
      : '';

    return `<div class="forecast-row">
      <div class="forecast-day-block">
        <span class="forecast-day">${dayLabel}</span>
        <span class="forecast-date">${dateLabel}</span>
      </div>
      <span class="forecast-emoji">${info.emoji}</span>
      <span class="forecast-desc">${info.text}</span>
      <div class="forecast-temps">
        ${nowRow}
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

async function logTriviaAnswer(q, selected, isCorrect, attempt = 1) {
  try {
    // Content-Type text/plain evita el preflight (Apps Script no responde OPTIONS).
    const res = await fetch(CONFIG.TRIVIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        pregunta: q.pregunta,
        seleccionada: selected,
        correcta: q.correcta,
        acierto: isCorrect,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    // Apps Script devuelve 503 ocasionalmente bajo carga; reintentar antes de perder la respuesta.
    if (attempt < 3) {
      setTimeout(() => logTriviaAnswer(q, selected, isCorrect, attempt + 1), 2000);
    } else {
      log('Error registrando respuesta de trivia:', err.message);
    }
  }
}

function handleTriviaAnswer(btn, selected) {
  const q = state.triviaCurrent;
  const isCorrect = selected === q.correcta;
  logTriviaAnswer(q, selected, isCorrect);
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
    schedulePhotoAdvance();
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
  // Tap en fecha/hora → abrir calendario con cumpleaños
  document.getElementById('clock').addEventListener('click', openBirthdayCalendar);

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

  // Primer toque en la pantalla → habilita el audio para el sonido de la trivia
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  document.addEventListener('click', unlockAudio);

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
