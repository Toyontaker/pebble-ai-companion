// AI Companion calendar bridge.
//
// Deploy this in your own Google account as a web app (Execute as: Me,
// Who has access: Anyone) and paste the /exec URL and the secret into the
// AI Companion settings. Setup steps are in the README ("Google カレンダー連携").
//
// Anyone holding the URL *and* the secret can read and change your calendar,
// so keep the secret long and random, and redeploy with a new one if it leaks.
//
// Request:  POST JSON { secret, op, ... }
// Response: JSON { ok: true, ... } or { error: "..." }
//
// Times travel as epoch milliseconds so the phone and this script never have
// to agree on a timezone. All-day dates travel as "yyyy-MM-dd" and are read in
// the timezone of the calendar they belong to.

var MAX_EVENTS = 30;

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || typeof req.secret !== 'string' || req.secret !== secret) {
      out = { error: 'unauthorized' };
    } else {
      out = handle(req);
    }
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lets you check the deployment from a browser: it should say "ok".
function doGet() {
  return ContentService.createTextOutput('ok');
}

// Run this once from the editor before deploying (pick "authorize" in the
// function menu and press Run). It grants calendar access in the editor's own
// consent flow, which works when the consent screen shown after "Deploy"
// fails with "The OAuth client was not found".
function authorize() {
  Logger.log('Calendar access OK: ' + CalendarApp.getDefaultCalendar().getName());
}

function handle(req) {
  switch (req.op) {
    case 'list':   return list(req);
    case 'create': return create(req);
    case 'update': return update(req);
    case 'delete': return remove(req);
    default:       return { error: 'unknown op ' + req.op };
  }
}

// ------------------------------------------------------------------ helpers

function parseDay(text, tz) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text || ''))) {
    throw new Error('date must be yyyy-MM-dd');
  }
  return Utilities.parseDate(text + ' 00:00', tz, 'yyyy-MM-dd HH:mm');
}

function ms(value, name) {
  var n = Number(value);
  if (!(n > 0)) {
    throw new Error(name + ' must be epoch milliseconds');
  }
  return new Date(n);
}

// A ref pins down one occurrence: calendar, event id and start time. Recurring
// events share an id across occurrences, so the start time is what tells them
// apart.
function refOf(cal, ev) {
  var start = ev.isAllDayEvent() ? ev.getAllDayStartDate() : ev.getStartTime();
  return cal.getId() + '|' + ev.getId() + '|' + start.getTime();
}

function findByRef(ref) {
  var parts = String(ref || '').split('|');
  if (parts.length !== 3) {
    throw new Error('bad ref');
  }
  var cal = CalendarApp.getCalendarById(parts[0]);
  if (!cal) {
    throw new Error('calendar not found');
  }
  var start = Number(parts[2]);
  var candidates = cal.getEvents(new Date(start - 60000), new Date(start + 60000));
  for (var i = 0; i < candidates.length; i++) {
    if (refOf(cal, candidates[i]) === ref) {
      return { cal: cal, ev: candidates[i] };
    }
  }
  throw new Error('event not found (it may have been moved or deleted)');
}

function describe(cal, ev) {
  var tz = cal.getTimeZone();
  var item = {
    ref: refOf(cal, ev),
    title: ev.getTitle(),
    calendar: cal.getName(),
    allDay: ev.isAllDayEvent(),
    recurring: ev.isRecurringEvent(),
    location: ev.getLocation() || ''
  };
  if (item.allDay) {
    item.date = Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd');
    // getAllDayEndDate is exclusive; report the last day the event covers.
    var last = new Date(ev.getAllDayEndDate().getTime() - 1);
    item.endDate = Utilities.formatDate(last, tz, 'yyyy-MM-dd');
  } else {
    item.start = ev.getStartTime().getTime();
    item.end = ev.getEndTime().getTime();
  }
  return item;
}

function writable(cal) {
  if (!cal.isOwnedByMe()) {
    throw new Error('that calendar is not yours to change');
  }
}

// ------------------------------------------------------------------- ops

function list(req) {
  var from = ms(req.from, 'from');
  var to = ms(req.to, 'to');
  var query = String(req.query || '').toLowerCase();
  var cals = CalendarApp.getAllCalendars();
  var found = [];
  for (var i = 0; i < cals.length; i++) {
    if (!cals[i].isSelected()) {
      continue;  // match what the user sees in Google Calendar
    }
    var events = cals[i].getEvents(from, to);
    for (var j = 0; j < events.length; j++) {
      if (query && events[j].getTitle().toLowerCase().indexOf(query) === -1) {
        continue;
      }
      found.push({ cal: cals[i], ev: events[j] });
    }
  }
  found.sort(function (a, b) {
    var sa = a.ev.isAllDayEvent() ? a.ev.getAllDayStartDate() : a.ev.getStartTime();
    var sb = b.ev.isAllDayEvent() ? b.ev.getAllDayStartDate() : b.ev.getStartTime();
    return sa.getTime() - sb.getTime();
  });
  var out = [];
  for (var k = 0; k < found.length && k < MAX_EVENTS; k++) {
    out.push(describe(found[k].cal, found[k].ev));
  }
  return { ok: true, events: out, truncated: found.length > MAX_EVENTS };
}

function create(req) {
  var cal = CalendarApp.getDefaultCalendar();
  var title = String(req.title || '').trim();
  if (!title) {
    throw new Error('title is required');
  }
  var options = {};
  if (req.location) { options.location = String(req.location); }
  if (req.description) { options.description = String(req.description); }

  var ev;
  if (req.allDay) {
    var tz = cal.getTimeZone();
    var first = parseDay(req.date, tz);
    if (req.endDate && req.endDate !== req.date) {
      // createAllDayEvent's end date is exclusive.
      var last = parseDay(req.endDate, tz);
      ev = cal.createAllDayEvent(title, first, new Date(last.getTime() + 86400000), options);
    } else {
      ev = cal.createAllDayEvent(title, first, options);
    }
  } else {
    var start = ms(req.start, 'start');
    var end = req.end ? ms(req.end, 'end') : new Date(start.getTime() + 3600000);
    if (end.getTime() <= start.getTime()) {
      throw new Error('end must be after start');
    }
    ev = cal.createEvent(title, start, end, options);
  }
  return { ok: true, event: describe(cal, ev) };
}

function update(req) {
  var hit = findByRef(req.ref);
  writable(hit.cal);
  var ev = hit.ev;

  if (req.title) { ev.setTitle(String(req.title)); }
  if (req.location !== undefined && req.location !== null) { ev.setLocation(String(req.location)); }
  if (req.description !== undefined && req.description !== null) { ev.setDescription(String(req.description)); }

  if (req.start) {
    var start = ms(req.start, 'start');
    var end;
    if (req.end) {
      end = ms(req.end, 'end');
    } else if (ev.isAllDayEvent()) {
      end = new Date(start.getTime() + 3600000);
    } else {
      // Moving an event keeps its length unless a new end is given.
      end = new Date(start.getTime() + (ev.getEndTime().getTime() - ev.getStartTime().getTime()));
    }
    if (end.getTime() <= start.getTime()) {
      throw new Error('end must be after start');
    }
    ev.setTime(start, end);
  } else if (req.end && !ev.isAllDayEvent()) {
    ev.setTime(ev.getStartTime(), ms(req.end, 'end'));
  } else if (req.date) {
    ev.setAllDayDate(parseDay(req.date, hit.cal.getTimeZone()));
  }
  return { ok: true, event: describe(hit.cal, ev) };
}

function remove(req) {
  var hit = findByRef(req.ref);
  writable(hit.cal);
  var gone = describe(hit.cal, hit.ev);
  hit.ev.deleteEvent();
  return { ok: true, event: gone };
}
