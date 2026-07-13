// ─── Configuración central ───────────────────────────────────────────────────
// Editar aquí para cambiar URLs, ciudad, timings, etc.

const CONFIG = {
  // Google Apps Script Web App URLs — reemplazar con las URLs reales tras el deploy
  PHOTOS_ENDPOINT: 'https://script.google.com/macros/s/AKfycbwZOCY0G4hbLrGU8IaFZt_qeP6QOVXAk8ucEEEJ4JhaphWe3gLXFWB40DtmANNFAUYI/exec?resource=photos',
  NEWS_ENDPOINT:   'https://script.google.com/macros/s/AKfycbzUq7aowX4XnfdE9bpl-CQ7LPo-TJg1YxBzq-N2JXUEL234liBAWgAwh5G5mmlsLelp/exec?resource=news',

  // Ubicación para el clima (Buenos Aires — cambiar si la persona vive en otro lugar)
  WEATHER_LAT:      -34.6037,
  WEATHER_LON:      -58.3816,
  WEATHER_TIMEZONE: 'America/Argentina/Buenos_Aires',

  // Timings (ms)
  PHOTO_INTERVAL_MS:    10_000,       // cuánto dura cada foto
  PHOTO_FADE_MS:         1_000,       // duración del fundido cruzado
  NEWS_INTERVAL_MS:     18_000,       // cuánto dura cada titular
  NEWS_FADE_MS:            800,       // fundido entre titulares
  OVERLAY_TIMEOUT_MS:   15_000,       // cierre automático de overlays por inactividad
  WEATHER_REFRESH_MS:   30 * 60_000,  // refrescar clima cada 30 min
  NEWS_REFRESH_MS:      60 * 60_000,  // refrescar noticias cada 1 h
  PHOTOS_REFRESH_MS:    60 * 60_000,  // refrescar lista de fotos cada 1 h
  VERSION_CHECK_MS:     15 * 60_000,  // chequear si hay una versión nueva del sitio cada 15 min

  // Palabras clave a filtrar de las noticias (sincronizado con EXCLUDE_KEYWORDS en news-endpoint.gs)
  NEWS_EXCLUDE_KEYWORDS: [
    'asesinato', 'crimen', 'femicidio', 'violación', 'abuso sexual',
    'secuestro', 'robo', 'asalto', 'tiroteo', 'balacera',
    'narcotráfico', 'narco', 'sicario', 'mafia',
    'accidente fatal', 'fallecido', 'fallecida', 'muerto', 'muertos', 'muerta',
    'muerte', 'tragedia', 'víctima fatal', 'choque fatal', 'incendio mortal',
    'cuerpo sin vida', 'hallaron muerto', 'hallaron muerta',
    'golpiza', 'femicida', 'violencia de género',
    'huelga de hambre', 'represión', 'desaparecido', 'desaparecida',
    'suicidio', 'se quitó la vida', 'intentó quitarse',
    'terremoto', 'tsunami', 'epidemia', 'pandemia',
    'guerra', 'bombardeo', 'ataque terrorista', 'atentado',
  ],
};
