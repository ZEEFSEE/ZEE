/**
 * ZHI External World Data Hub — read-only pilot
 * Deploy as a Google Apps Script Web App.
 *
 * Script Properties required:
 *   ZHI_SPREADSHEET_ID = Google Spreadsheet ID
 *
 * This pilot intentionally exposes read-only, allowlisted agent fields.
 * Do not add privileged write actions to a public endpoint.
 */
const CONFIG = {
  AGENTS_SHEET: 'agents',
  ALLOWED_FIELDS: ['id', 'name', 'gender', 'personality', 'life_status', 'age_days', 'updated_at'],
  MAX_ROWS: 500
};

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || 'health');
  let result;

  try {
    if (action === 'health') {
      result = {
        ok: true,
        service: 'zhi-external-world-data-hub',
        mode: 'read-only-pilot',
        timestamp: new Date().toISOString()
      };
    } else if (action === 'agents') {
      result = listAgents_();
    } else {
      result = { ok: false, error: 'unsupported_action' };
    }
  } catch (err) {
    result = { ok: false, error: 'service_unavailable' };
  }

  return respond_(result, params.callback);
}

function listAgents_() {
  const id = PropertiesService.getScriptProperties().getProperty('ZHI_SPREADSHEET_ID');
  if (!id) throw new Error('Missing ZHI_SPREADSHEET_ID');

  const book = SpreadsheetApp.openById(id);
  const sheet = book.getSheetByName(CONFIG.AGENTS_SHEET);
  if (!sheet) throw new Error('Missing agents sheet');

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { ok: true, count: 0, agents: [] };

  const headers = values[0].map(v => String(v).trim());
  const indexes = {};
  CONFIG.ALLOWED_FIELDS.forEach(field => {
    indexes[field] = headers.indexOf(field);
  });

  const agents = values.slice(1, CONFIG.MAX_ROWS + 1)
    .filter(row => row.some(cell => String(cell).trim() !== ''))
    .map(row => {
      const agent = {};
      CONFIG.ALLOWED_FIELDS.forEach(field => {
        const index = indexes[field];
        if (index >= 0) agent[field] = row[index];
      });
      return agent;
    });

  return { ok: true, count: agents.length, agents: agents };
}

function respond_(payload, callback) {
  const json = JSON.stringify(payload);
  // JSONP supports read-only browser testing from GitHub Pages without
  // relying on cross-origin fetch response headers.
  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
      return ContentService.createTextOutput('/* invalid callback */')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
