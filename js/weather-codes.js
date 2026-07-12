// WMO Weather Interpretation Codes → texto en español + emoji
// Referencia: https://open-meteo.com/en/docs (sección "WMO Weather Code")

const WEATHER_CODES = {
    0:  { text: 'Despejado',             emoji: '☀️' },
    1:  { text: 'Mayormente despejado',  emoji: '🌤️' },
    2:  { text: 'Parcialmente nublado',  emoji: '⛅' },
    3:  { text: 'Nublado',               emoji: '☁️' },
   45:  { text: 'Niebla',               emoji: '🌫️' },
   48:  { text: 'Niebla con escarcha',   emoji: '🌫️' },
   51:  { text: 'Llovizna leve',         emoji: '🌦️' },
   53:  { text: 'Llovizna moderada',     emoji: '🌦️' },
   55:  { text: 'Llovizna intensa',      emoji: '🌧️' },
   56:  { text: 'Llovizna helada leve',  emoji: '🌨️' },
   57:  { text: 'Llovizna helada densa', emoji: '🌨️' },
   61:  { text: 'Lluvia leve',           emoji: '🌧️' },
   63:  { text: 'Lluvia moderada',       emoji: '🌧️' },
   65:  { text: 'Lluvia intensa',        emoji: '🌧️' },
   66:  { text: 'Lluvia helada leve',    emoji: '🌨️' },
   67:  { text: 'Lluvia helada intensa', emoji: '🌨️' },
   71:  { text: 'Nieve leve',            emoji: '🌨️' },
   73:  { text: 'Nieve moderada',        emoji: '❄️' },
   75:  { text: 'Nieve intensa',         emoji: '❄️' },
   77:  { text: 'Granizo fino',          emoji: '🌨️' },
   80:  { text: 'Chubascos leves',       emoji: '🌦️' },
   81:  { text: 'Chubascos moderados',   emoji: '🌧️' },
   82:  { text: 'Chubascos fuertes',     emoji: '⛈️' },
   85:  { text: 'Nieve con lluvia leve', emoji: '🌨️' },
   86:  { text: 'Nieve con lluvia fuerte',emoji: '🌨️' },
   95:  { text: 'Tormenta eléctrica',    emoji: '⛈️' },
   96:  { text: 'Tormenta con granizo',  emoji: '⛈️' },
   99:  { text: 'Tormenta fuerte',       emoji: '⛈️' },
};

function getWeatherInfo(code) {
  return WEATHER_CODES[code] ?? { text: 'Variable', emoji: '🌡️' };
}
