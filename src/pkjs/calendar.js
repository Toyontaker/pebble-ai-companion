// Google Calendar, in one of two modes (settings.calendarMode()):
//
// - 'ical' (light): read-only, from the calendar's "secret address in iCal
//   format". Nothing to deploy; the feed is fetched and expanded on the phone.
// - 'gas' (advanced): read and write through the Apps Script bridge in
//   gas/Code.gs, which the user deploys in their own account. Google's device
//   OAuth flow does not cover Calendar scopes and PebbleKit JS has no browser
//   for the normal one, hence the bridge and its shared secret.
//
// The model never sees refs (calendar id | event id | start). It gets short
// ids like "e3" instead, mapped here, so it cannot invent a ref and has to
// list events before it can change one.

var http = require('./http');
var settings = require('./settings');
var ical = require('./ical');

var MAX_KNOWN = 60;
// Google refreshes the iCal feed slowly anyway; refetching more often than
// this only costs battery and data.
var FEED_TTL_MS = 5 * 60 * 1000;

var known = {};      // short id -> event as returned by list
var order = [];      // short ids, oldest first, for eviction
var nextId = 1;

var feed = { url: '', at: 0, parsed: null };

function mode() {
  return settings.calendarMode();
}

function isConfigured() {
  return mode() !== 'off';
}

// Only the Apps Script bridge can create, change or delete events.
function canWrite() {
  return mode() === 'gas';
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

// The secret iCal address is often copied as webcal://.
function feedUrl() {
  return settings.get('cal_ical_url').replace(/^webcal:\/\//i, 'https://');
}

function withFeed(callback) {
  var url = feedUrl();
  if (feed.parsed && feed.url === url && Date.now() - feed.at < FEED_TTL_MS) {
    callback(null, feed.parsed);
    return;
  }
  http.getText(url, function (text) {
    if (text.indexOf('BEGIN:VCALENDAR') === -1) {
      callback('That address did not return an iCal calendar. Copy the "Secret address in iCal format" from Google Calendar settings.');
      return;
    }
    var parsed;
    try {
      parsed = ical.parse(text);
    } catch (e) {
      callback('Could not read the calendar feed: ' + e);
      return;
    }
    feed = { url: url, at: Date.now(), parsed: parsed };
    callback(null, parsed);
  }, function (message) {
    callback(message === 'HTTP 404'
      ? 'Google says that calendar address does not exist. It changes when it is reset; copy it again.'
      : message);
  });
}

// Events overlapping [from, to) ms, in the same shape whichever mode is on.
// callback(error, { events, truncated })
function listEvents(from, to, query, callback) {
  if (mode() === 'gas') {
    request('list', { from: from, to: to, query: query }, callback);
    return;
  }
  withFeed(function (err, parsed) {
    if (err) {
      callback(err);
      return;
    }
    var events = ical.expand(parsed, from, to);
    if (query) {
      var q = String(query).toLowerCase();
      events = events.filter(function (e) { return e.title.toLowerCase().indexOf(q) > -1; });
    }
    var limit = 30;
    callback(null, { events: events.slice(0, limit), truncated: events.length > limit });
  });
}

// Apps Script bridge. callback(error, result)
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
  mode: mode,
  isConfigured: isConfigured,
  canWrite: canWrite,
  listEvents: listEvents,
  request: request,
  remember: remember,
  lookup: lookup,
  forgetEvent: forgetEvent,
  line: line,
  when: when,
  summary: summary,
  day: day
};
