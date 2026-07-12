// ─── Apps Script: Endpoint de fotos ───────────────────────────────────────────
// Deploy: Extensiones → Apps Script → Implementar → Nueva implementación
//   Tipo: Aplicación web
//   Ejecutar como: Yo (la cuenta dueña de la carpeta de Drive)
//   Acceso: Cualquier persona
//
// URL resultante: https://script.google.com/macros/s/XXXX/exec
// Usar esa URL en CONFIG.PHOTOS_ENDPOINT del frontend (agregar ?resource=photos)

var FOLDER_ID = '1bRx-6Eo2IBPzq4O751sJjrjibQO9JbF2';

function doGet(e) {
  var resource = (e && e.parameter && e.parameter.resource) ? e.parameter.resource : '';

  if (resource === 'photos') {
    return handlePhotos();
  }

  return buildJSON({ error: 'recurso no reconocido' });
}

function handlePhotos() {
  try {
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var files   = folder.getFiles();
    var photos  = [];

    while (files.hasNext()) {
      var file = files.next();
      var mime = file.getMimeType();

      // Solo imágenes
      if (mime.indexOf('image/') !== 0) continue;

      var id = file.getId();
      photos.push({
        id:  id,
        // sz=w2000 da resolución suficiente para pantalla de iPad sin ser pesado
        url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w2000'
      });
    }

    // Barajar en el servidor para variedad (complementa el shuffle del frontend)
    photos = shuffleArray(photos);

    return buildJSON({
      updated_at: new Date().toISOString(),
      count:      photos.length,
      photos:     photos
    });

  } catch (err) {
    return buildJSON({ error: err.message, photos: [] }, 500);
  }
}

function shuffleArray(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

function buildJSON(obj, statusCode) {
  var output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
