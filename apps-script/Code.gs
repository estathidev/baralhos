/**
 * API temporária e restrita para migrar os links da aba Oraculares.
 *
 * Este projeto deve ser criado a partir da própria planilha em
 * Extensões > Apps Script. O token fica em Script Properties e nunca no Git.
 */

const CONFIG = Object.freeze({
  spreadsheetId: '177FRZ59ZJNFPlpVHddWMklNYHde4X7Pg2Ae-WKK4zyA',
  sheetName: 'Oraculares',
  firstImageRow: 5,
  firstDeckColumn: 2,
  maxUpdatesPerRequest: 2000,
  allowedUrlPrefixes: [
    'https://raw.githubusercontent.com/estathidev/baralhos/',
    'https://github.com/estathidev/baralhos/raw/',
  ],
});

const API_TOKEN_PROPERTY = 'BARALHOS_API_TOKEN';

/**
 * Execute manualmente uma vez. O token temporário aparecerá no log da execução.
 */
function createApiToken() {
  const token = Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(API_TOKEN_PROPERTY, token);
  console.log('Token temporário (guarde fora do Git): %s', token);
  return token;
}

/** Execute ao terminar a migração para invalidar imediatamente o acesso. */
function revokeApiToken() {
  PropertiesService.getScriptProperties().deleteProperty(API_TOKEN_PROPERTY);
  console.log('Token revogado.');
}

/** Endpoint de saúde sem dados da planilha. */
function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'baralhos-sheet-migration',
    sheet: CONFIG.sheetName,
  });
}

/**
 * POST JSON:
 *   {"token":"...", "action":"read"}
 *   {"token":"...", "action":"update", "updates":[...]}
 */
function doPost(e) {
  try {
    const request = parseRequest_(e);
    authenticate_(request.token);

    if (request.action === 'read') {
      return jsonResponse_({ok: true, data: readSheet_()});
    }
    if (request.action === 'update') {
      return jsonResponse_({ok: true, data: updateLinks_(request.updates)});
    }
    throw new ApiError_('Ação inválida. Use "read" ou "update".');
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({
      ok: false,
      error: error instanceof ApiError_ ? error.message : 'Erro interno.',
    });
  }
}

function readSheet_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow === 0 || lastColumn === 0) {
    return {lastRow: 0, lastColumn: 0, cells: []};
  }

  const range = sheet.getRange(1, 1, lastRow, lastColumn);
  const displayValues = range.getDisplayValues();
  const formulas = range.getFormulas();
  const richTextValues = range.getRichTextValues();
  const cells = [];

  for (let rowIndex = 0; rowIndex < lastRow; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < lastColumn; columnIndex += 1) {
      const display = displayValues[rowIndex][columnIndex];
      const formula = formulas[rowIndex][columnIndex];
      const richText = richTextValues[rowIndex][columnIndex];
      const link = richText ? richText.getLinkUrl() : null;
      if (!display && !formula && !link) continue;

      const row = rowIndex + 1;
      const column = columnIndex + 1;
      cells.push({
        a1: sheet.getRange(row, column).getA1Notation(),
        row: row,
        column: column,
        display: display,
        formula: formula || null,
        link: link || null,
      });
    }
  }

  return {
    spreadsheetId: CONFIG.spreadsheetId,
    sheet: CONFIG.sheetName,
    firstImageRow: CONFIG.firstImageRow,
    firstDeckColumn: CONFIG.firstDeckColumn,
    lastRow: lastRow,
    lastColumn: lastColumn,
    cells: cells,
  };
}

function updateLinks_(updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new ApiError_('"updates" deve ser uma lista não vazia.');
  }
  if (updates.length > CONFIG.maxUpdatesPerRequest) {
    throw new ApiError_('Muitas atualizações em uma única requisição.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet_();
    const prepared = updates.map(function(update) {
      return validateUpdate_(sheet, update);
    });

    // Só escreve depois que todas as células e valores foram validados.
    prepared.forEach(function(item) {
      item.range.setValue(item.value);
    });
    SpreadsheetApp.flush();

    return {
      updated: prepared.length,
      cells: prepared.map(function(item) { return item.a1; }),
    };
  } finally {
    lock.releaseLock();
  }
}

function validateUpdate_(sheet, update) {
  if (!update || typeof update.a1 !== 'string' ||
      typeof update.expected !== 'string' || typeof update.value !== 'string') {
    throw new ApiError_('Cada atualização exige "a1", "expected" e "value".');
  }

  const a1 = update.a1.trim().toUpperCase();
  if (!/^[A-Z]+[1-9][0-9]*$/.test(a1)) {
    throw new ApiError_('Referência A1 inválida: ' + update.a1);
  }

  const range = sheet.getRange(a1);
  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1 ||
      range.getRow() < CONFIG.firstImageRow ||
      range.getColumn() < CONFIG.firstDeckColumn) {
    throw new ApiError_('Célula fora da área autorizada: ' + a1);
  }

  const current = extractCellUrl_(range);
  if (current !== update.expected) {
    throw new ApiError_(
      'A célula ' + a1 + ' mudou. Esperado: ' + update.expected +
      '; encontrado: ' + current
    );
  }

  const value = update.value.trim();
  const allowed = CONFIG.allowedUrlPrefixes.some(function(prefix) {
    return value.indexOf(prefix) === 0;
  });
  if (!allowed) {
    throw new ApiError_('URL de destino não autorizada em ' + a1 + '.');
  }

  return {a1: a1, range: range, value: value};
}

function extractCellUrl_(range) {
  const richText = range.getRichTextValue();
  if (richText && richText.getLinkUrl()) return richText.getLinkUrl();

  const formula = range.getFormula();
  const match = formula.match(/^=HYPERLINK\("([^"]+)"[;,]/i);
  if (match) return match[1].replace(/""/g, '"');

  return String(range.getDisplayValue()).trim();
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(CONFIG.sheetName);
  if (!sheet) throw new ApiError_('Aba não encontrada: ' + CONFIG.sheetName);
  return sheet;
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new ApiError_('Envie um corpo JSON via POST.');
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new ApiError_('JSON inválido.');
  }
}

function authenticate_(providedToken) {
  const expectedToken = PropertiesService.getScriptProperties()
    .getProperty(API_TOKEN_PROPERTY);
  if (!expectedToken) throw new ApiError_('API não configurada ou já revogada.');
  if (typeof providedToken !== 'string' || providedToken !== expectedToken) {
    throw new ApiError_('Token inválido.');
  }
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ApiError_(message) {
  this.name = 'ApiError';
  this.message = message;
  this.stack = new Error(message).stack;
}
ApiError_.prototype = Object.create(Error.prototype);
ApiError_.prototype.constructor = ApiError_;
