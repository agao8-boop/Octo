/**
 * Octo — Google Apps Script for Spreadsheet Email Collection
 * ============================================================
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire script, replacing any existing code
 * 4. Click Save (Ctrl+S)
 * 5. Click Deploy → New deployment
 * 6. Type: Web App
 * 7. Execute as: Me
 * 8. Who has access: Anyone
 * 9. Click Deploy → copy the Web App URL
 *
 * The Web App URL should match:
 * https://script.google.com/macros/s/AKfycbxuuGoDRfzxdUdZekGAAjFFAeZARCr1xSBI4L9Ov3rZY3koqwi_T5050hLZ7ixrlwXr/exec
 *
 * SHEET COLUMNS (auto-created on first submission):
 * A: Timestamp
 * B: Email
 * C: First Name
 * D: Last Name
 * E: Phone
 * F: Units
 * G: City / Borough
 * H: PM Situation
 * I: Pain Point
 * J: Source (modal / signup_page)
 */

var SHEET_NAME = 'Leads'; // Name of the sheet tab to write data to

/**
 * Handle POST requests from the Octo website signup forms.
 * Called when a user submits an email via the modal or signup page.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    writeToSheet(data);
    return buildResponse({ status: 'success', message: 'Lead recorded.' });
  } catch (err) {
    return buildResponse({ status: 'error', message: err.toString() });
  }
}

/**
 * Handle GET requests — used for health checks and simple form tests.
 * Accepts ?email=xxx as a fallback submission method.
 */
function doGet(e) {
  var params = e.parameter;

  // If email param provided, treat as a simple submission
  if (params && params.email) {
    try {
      writeToSheet({
        email:     params.email,
        firstName: params.firstName  || '',
        lastName:  params.lastName   || '',
        phone:     params.phone      || '',
        units:     params.units      || '',
        city:      params.city       || '',
        pmSituation: params.pmSituation || '',
        painPoint: params.painPoint  || '',
        source:    params.source     || 'get_request',
        timestamp: new Date().toISOString()
      });
      return buildResponse({ status: 'success', message: 'Lead recorded via GET.' });
    } catch (err) {
      return buildResponse({ status: 'error', message: err.toString() });
    }
  }

  // Health check
  return buildResponse({ status: 'active', message: 'Octo lead capture script is running.' });
}

/**
 * Write a lead entry to the Google Sheet.
 */
function writeToSheet(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  // Create the sheet if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Write header row
    sheet.appendRow([
      'Timestamp',
      'Email',
      'First Name',
      'Last Name',
      'Phone',
      'Units',
      'City / Borough',
      'PM Situation',
      'Pain Point',
      'Source'
    ]);
    // Format header row
    var header = sheet.getRange(1, 1, 1, 10);
    header.setFontWeight('bold');
    header.setBackground('#e8728a');
    header.setFontColor('#ffffff');
  }

  var timestamp = data.timestamp
    ? new Date(data.timestamp)
    : new Date();

  sheet.appendRow([
    timestamp,
    data.email        || '',
    data.firstName    || '',
    data.lastName     || '',
    data.phone        || '',
    data.units        || '',
    data.city         || '',
    data.pmSituation  || '',
    data.painPoint    || '',
    data.source       || 'unknown'
  ]);

  // Optional: send yourself a notification email on each new lead
  // Uncomment the lines below if you want email alerts:
  /*
  MailApp.sendEmail({
    to: 'your-email@example.com',
    subject: '🐙 New Octo Lead: ' + (data.email || 'unknown'),
    body: [
      'New lead captured on ' + new Date().toLocaleString(),
      '',
      'Email:       ' + (data.email       || '—'),
      'Name:        ' + (data.firstName   || '') + ' ' + (data.lastName || ''),
      'Phone:       ' + (data.phone       || '—'),
      'Units:       ' + (data.units       || '—'),
      'City:        ' + (data.city        || '—'),
      'PM Sit.:     ' + (data.pmSituation || '—'),
      'Pain Point:  ' + (data.painPoint   || '—'),
      'Source:      ' + (data.source      || '—'),
    ].join('\n')
  });
  */
}

/**
 * Build a JSON text response (compatible with no-cors fetch from browser).
 */
function buildResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
