/**
 * Spelling Bee — shared school record.
 *
 * One spreadsheet holds every result. Each class-section (3A, 3B, 4A ... 8B)
 * gets its own tab, so 25 lab computers write into a single consolidated sheet
 * instead of producing 25 separate files.
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Then use the /exec URL in the quiz page (CLOUD_URL).
 */

var HEAD = ['Time', 'Event', 'Class', 'Section', 'Roll', 'Name', 'Score', 'Out of',
            'Answered', 'Questions', 'Ran out of time', 'Seconds', 'Computer'];

function sheetName_(cls, sec) {
  var c = String(cls || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  var s = String(sec || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return ('Class ' + c + s).slice(0, 31);
}

function tabFor_(ss, cls, sec) {
  var name = sheetName_(cls, sec);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
    orderTabs_(ss);
  }
  return sh;
}

/** keep the tabs in class order: Class 3A, 3B, 4A ... */
function orderTabs_(ss) {
  var sheets = ss.getSheets().slice().sort(function (a, b) {
    return a.getName().localeCompare(b.getName(), undefined, { numeric: true });
  });
  sheets.forEach(function (sh, i) {
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });
}

var TZ = 'Asia/Kolkata';

function stampIST_() {
  return Utilities.formatDate(new Date(), TZ, 'dd-MM-yyyy HH:mm:ss') + ' IST';
}

function rowFor_(rec) {
  return [stampIST_(), rec.session || '', rec.cls || '',
          rec.sec || '', rec.roll || '', rec.name || '', rec.score, rec.total,
          rec.done, rec.outOf, rec.out ? 'yes' : '', rec.secs, rec.station || ''];
}

/** a paper is identified by event + class + section + roll */
function findRow_(sh, session, roll) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 2, last - 1, 4).getValues(); // Event, Class, Section, Roll
  var want = String(roll).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(session) &&
        String(vals[i][3]).replace(/[^0-9A-Za-z]/g, '').toUpperCase() === want) {
      return i + 2;
    }
  }
  return 0;
}

function recFromRow_(r) {
  return { time: r[0], session: r[1], cls: r[2], sec: r[3], roll: r[4], name: r[5],
           score: r[6], total: r[7], done: r[8], outOf: r[9], out: r[10] === 'yes',
           secs: r[11], station: r[12], band: 'Class ' + r[2] };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, why: 'bad request' }); }

  var rec = body.rec || {};
  rec.session = body.session || rec.session || '';
  if (!rec.cls || !rec.roll) return json_({ ok: false, why: 'class and roll are required' });

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = tabFor_(ss, rec.cls, rec.sec);
    var row = findRow_(sh, rec.session, rec.roll);
    var values = [rowFor_(rec)];
    if (row) sh.getRange(row, 1, 1, HEAD.length).setValues(values);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, HEAD.length).setValues(values);
    SpreadsheetApp.flush();
    return json_({ ok: true, where: 'sheet', tab: sh.getName(), updated: !!row });
  } catch (err) {
    return json_({ ok: false, why: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var p = e.parameter || {};
  var action = p.action || 'list';
  var session = p.session || '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'has') {
    var sh = ss.getSheetByName(sheetName_(p.cls, p.sec));
    var found = sh ? !!findRow_(sh, session, p.roll) : false;
    return json_({ ok: true, has: found });
  }

  var out = [];
  ss.getSheets().forEach(function (sh) {
    var last = sh.getLastRow();
    if (last < 2) return;
    sh.getRange(2, 1, last - 1, HEAD.length).getValues().forEach(function (r) {
      if (!r[4] && !r[5]) return;
      if (session && String(r[1]) !== String(session)) return;
      out.push(recFromRow_(r));
    });
  });
  return json_({ ok: true, rows: out });
}
