// Google Calendar, reached through the Apps Script bridge in gas/Code.gs.
// Google's device OAuth flow does not cover Calendar scopes, and PebbleKit JS
// has no browser to run the normal one, so the user deploys a tiny script in
// their own account and we talk to it with a shared secret.
//
// The model never sees the bridge's refs (calendar id | event id | start).
// It gets short ids like "e3" instead, mapped here, so it cannot invent a ref
// and has to list events before it can change one.

var http = require('./http');
var settings = require('./settings');

var MAX_KNOWN = 60;

var known = {};      // short id -> event as returned by the bridge
var order = [];      // short ids, oldest first, for eviction
var nextId = 1;

function isConfigured() {
  return settings.get('cal_url').length > 0 && settings.get('cal_secret').length > 0;
}

function remember(event) {
  for (var i = 0; i < order.length; i++) {
    if (known[order[i]].ref === event.ref) {
      known[order[i]] = event;
      return order[i];
    }
  }
  var id = 'e' + (nextId++);
  known[id] = event;
  order.push(id);
  while (order.length > MAX_KNOWN) {
    delete known[order.shift()];
  }
  return id;
}

function lookup(id) {
  return known[String(id || '').trim()] || null;
}

function forgetEvent(id) {
  delete known[id];
  order = order.filter(function (k) { return k !== id; });
}

// callback(error, result)
function request(op, args, callback) {
  var body = { secret: settings.get('cal_secret'), op: op };
  for (var k in args) {
    if (args.hasOwnProperty(k) && args[k] !== undefined && args[k] !== null && args[k] !== '') {
      body[k] = args[k];
    }
  }
  console.log('calendar ' + op);
  http.postJson(settings.get('cal_url'), {}, body, function (result) {
    if (result && result.error) {
      callback(result.error === 'unauthorized'
        ? 'The calendar bridge rejected the secret. Check the AI Companion settings.'
        : result.error);
      return;
    }
    callback(null, result || {});
  }, function (message) {
    // Apps Script answers errors with an HTML page, which lands here as a
    // parse failure. Saying where to look beats "could not parse".
    callback(message === 'Could not parse the response.'
      ? 'The calendar bridge did not return JSON. Check the web app URL and that it is deployed for "Anyone".'
      : message);
  });
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function day(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function clock(date) {
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

// "2026-10-13 15:00-16:00" / "2026-10-13 (all day)" in the phone's timezone.
function when(event) {
  if (event.allDay) {
    return event.date + (event.endDate && event.endDate !== event.date ? '..' + event.endDate : '') +
           ' (all day)';
  }
  var start = new Date(event.start);
  var end = new Date(event.end);
  return day(start) + ' ' + clock(start) + '-' +
         (day(end) === day(start) ? '' : day(end) + ' ') + clock(end);
}

function line(id, event) {
  return id + ': ' + when(event) + ' ' + event.title +
         (event.location ? ' @ ' + event.location : '') +
         ' [' + event.calendar + (event.recurring ? ', recurring' : '') + ']';
}

// Short text for the watch's confirmation screen.
function summary(event, ja) {
  var t;
  if (event.allDay) {
    t = event.date.substring(5).replace('-', '/');
  } else {
    var start = new Date(event.start);
    t = (start.getMonth() + 1) + '/' + start.getDate() + ' ' + clock(start);
  }
  return (ja ? '「' + event.title + '」' : '"' + event.title + '" ') + t;
}

module.exports = {
  isConfigured: isConfigured,
  request: request,
  remember: remember,
  lookup: lookup,
  forgetEvent: forgetEvent,
  line: line,
  when: when,
  summary: summary,
  day: day
};
