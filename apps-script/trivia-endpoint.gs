// ─── Apps Script: Endpoint de trivia ──────────────────────────────────────────
// Lee la hoja "Trivia" del Sheet y sirve las preguntas como JSON.
// Deploy: Extensiones → Apps Script → Implementar → Nueva implementación
//   Tipo: Aplicación web
//   Ejecutar como: Yo (la cuenta dueña del Sheet)
//   Acceso: Cualquier persona
//
// URL resultante: https://script.google.com/macros/s/XXXX/exec
// Usar esa URL en CONFIG.TRIVIA_ENDPOINT del frontend (agregar ?resource=trivia)
//
// Columnas esperadas en la hoja (fila 1 = encabezados, se ignora):
//   A: Pregunta
//   B: Respuesta correcta
//   C, D, E: Respuestas incorrectas
//   F: Frase de corrección, con un placeholder tipo {respuesta} o {año}
//      que se reemplaza por el valor de B (ej: "No, Claudia nació en {respuesta}")

var SPREADSHEET_ID = '1KbOolzkfKSHifUOOzZbqoIDh_MmoMM7oPTey2GkCd48';
var SHEET_NAME      = 'Hoja 1';

// Hojas donde se registran las respuestas de la trivia (se crean solas la
// primera vez que alguien contesta una pregunta).
var RESPONSES_SHEET_NAME = 'Respuestas';
var SUMMARY_SHEET_NAME   = 'Resumen';

function doGet(e) {
  var resource = (e && e.parameter && e.parameter.resource) ? e.parameter.resource : '';

  if (resource === 'trivia') {
    return handleTrivia();
  }

  return buildJSON({ error: 'recurso no reconocido' });
}

// El frontend hace POST cada vez que se responde una pregunta de la trivia.
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    logTriviaResponse(body);
    return buildJSON({ ok: true });
  } catch (err) {
    return buildJSON({ error: err.message }, 500);
  }
}

function logTriviaResponse(body) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreateResponsesSheet(ss);

  sheet.appendRow([
    new Date(),
    body.pregunta     || '',
    body.seleccionada || '',
    body.correcta     || '',
    !!body.acierto,
  ]);
}

function getOrCreateResponsesSheet(ss) {
  var sheet = ss.getSheetByName(RESPONSES_SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(RESPONSES_SHEET_NAME);
  sheet.appendRow(['Fecha', 'Pregunta', 'Respuesta elegida', 'Respuesta correcta', 'Acierto']);

  // Compilado por pregunta: total respondidas, correctas e incorrectas.
  var summary = ss.getSheetByName(SUMMARY_SHEET_NAME) || ss.insertSheet(SUMMARY_SHEET_NAME);
  summary.getRange('A1').setFormula(
    '=QUERY(Respuestas!B:E, "select B, count(B), sum(E), count(B)-sum(E) group by B ' +
    'label count(B) \'Total\', sum(E) \'Correctas\', count(B)-sum(E) \'Incorrectas\'", 1)'
  );

  return sheet;
}

function handleTrivia() {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    var rows  = sheet.getDataRange().getValues();

    var questions = [];
    for (var i = 1; i < rows.length; i++) { // saltear fila de encabezados
      var row = rows[i];
      var pregunta = row[0];
      if (!pregunta) continue;

      var correcta    = String(row[1]).trim();
      var incorrectas = [row[2], row[3], row[4]].filter(function (v) { return v !== '' && v != null; });
      var correccionTpl = row[5] || '';

      // La plantilla de corrección usa un placeholder ({respuesta}, {año}, etc.)
      // que siempre representa la respuesta correcta de la columna B.
      var correccion = String(correccionTpl).replace(/\{[^}]+\}/g, correcta).trim();

      questions.push({
        pregunta:    String(pregunta).trim(),
        correcta:    correcta,
        incorrectas: incorrectas.map(function (v) { return String(v).trim(); }),
        correccion:  correccion,
      });
    }

    return buildJSON({
      updated_at: new Date().toISOString(),
      count:      questions.length,
      questions:  questions,
    });

  } catch (err) {
    return buildJSON({ error: err.message, questions: [] }, 500);
  }
}

function buildJSON(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
