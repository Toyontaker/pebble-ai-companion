// Client-side tools the model can call. Each one either pushes an action to
// the watch (timers/alarms/reminders live on the watch, so they still fire
// when the phone is out of range) or writes a timeline pin.

var timeline = require('./timeline');
var settings = require('./settings');
var calendar = require('./calendar');

// Watch-side ACT_KIND values, mirrored from src/c/comm.h.
var ACT = {
  TIMER: 1,
  ALARM: 2,
  REMINDER: 3,
  PINNED: 4,
  CANCEL: 5
};

var DEFINITIONS = [
  {
    name: 'set_timer',
    description: 'Start a countdown timer on the watch. Use for "in N minutes" requests.',
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Length of the timer in minutes.' },
        label: { type: 'string', description: 'Short label, max 30 characters.' }
      },
      required: ['minutes']
    }
  },
  {
    name: 'set_alarm',
    description: 'Set an alarm that rings at a wall-clock time.',
    input_schema: {
      type: 'object',
      properties: {
        at: {
          type: 'string',
          description: 'Local time as YYYY-MM-DDTHH:MM. Use the current time given in the system prompt to resolve "tomorrow", "in the morning" and so on.'
        },
        label: { type: 'string', description: 'Short label, max 30 characters.' }
      },
      required: ['at']
    }
  },
  {
    name: 'set_reminder',
    description: 'Create a reminder: it buzzes on the watch at the given time and, unless pin is false, also appears as a pin on the Pebble timeline.',
    input_schema: {
      type: 'object',
      properties: {
        at: { type: 'string', description: 'Local time as YYYY-MM-DDTHH:MM.' },
        label: { type: 'string', description: 'What to remind about. Max 30 characters.' },
        note: { type: 'string', description: 'Optional longer text for the timeline pin.' },
        pin: { type: 'boolean', description: 'Also add a timeline pin. Defaults to true.' }
      },
      required: ['at', 'label']
    }
  },
  {
    name: 'pin_note',
    description: 'Pin a note to the Pebble timeline without scheduling an alert. Use this to save an answer, a fact or an event the user wants to keep.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Pin title, max 60 characters.' },
        body: { type: 'string', description: 'Pin body text.' },
        at: { type: 'string', description: 'Optional local time as YYYY-MM-DDTHH:MM. Defaults to now.' }
      },
      required: ['title']
    }
  },
  {
    name: 'cancel_schedule',
    description: 'Cancel timers, alarms or reminders. Pass "*" to cancel everything, or a substring of the label to cancel matching entries.',
    input_schema: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Label substring, or "*" for all.' }
      },
      required: ['match']
    }
  },
  {
    name: 'list_schedule',
    description: 'List the timers, alarms and reminders currently held on the watch.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'remember_fact',
    description: 'Store a durable fact about the user (preferences, routines, names) so later conversations can use it.',
    input_schema: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'One short sentence.' }
      },
      required: ['fact']
    }
  }
];

// Only offered when the calendar bridge is configured (see definitions()).
var CALENDAR_DEFINITIONS = [
  {
    name: 'calendar_list_events',
    description: 'List events on the user\'s Google Calendar. Use for questions about appointments, meetings and plans ("what is on today", "when is the dentist"). Each event comes back with a short id such as e3 that the update and delete tools take.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start of the range, local YYYY-MM-DD or YYYY-MM-DDTHH:MM. Defaults to the start of today.' },
        to: { type: 'string', description: 'End of the range, same formats. A bare date includes that whole day. Defaults to the end of the from day.' },
        query: { type: 'string', description: 'Optional text the event title must contain.' }
      }
    }
  },
  {
    name: 'calendar_create_event',
    description: 'Add an event to the user\'s Google Calendar (their default calendar). Use this for appointments and plans; use set_reminder only when they want the watch to buzz.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title.' },
        start: { type: 'string', description: 'Local YYYY-MM-DDTHH:MM for a timed event, or YYYY-MM-DD for an all-day event.' },
        end: { type: 'string', description: 'Optional end in the same format as start. Timed events default to one hour.' },
        location: { type: 'string', description: 'Optional location.' },
        description: { type: 'string', description: 'Optional notes.' }
      },
      required: ['title', 'start']
    }
  },
  {
    name: 'calendar_update_event',
    description: 'Change an event found with calendar_list_events: rename, move or change the location. The user is asked to confirm on the watch first. Moving the start keeps the event length unless end is given.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Short id from calendar_list_events, e.g. e3.' },
        title: { type: 'string', description: 'New title.' },
        start: { type: 'string', description: 'New start, local YYYY-MM-DDTHH:MM (or YYYY-MM-DD for an all-day event).' },
        end: { type: 'string', description: 'New end, local YYYY-MM-DDTHH:MM.' },
        location: { type: 'string', description: 'New location.' }
      },
      required: ['id']
    }
  },
  {
    name: 'calendar_delete_event',
    description: 'Delete an event found with calendar_list_events. The user is asked to confirm on the watch first. For a recurring event only that one occurrence is deleted.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Short id from calendar_list_events, e.g. e3.' }
      },
      required: ['id']
    }
  }
];

// The tools to offer for this request.
function definitions() {
  return calendar.isConfigured() ? DEFINITIONS.concat(CALENDAR_DEFINITIONS) : DEFINITIONS.slice();
}

var KIND_NAMES = { 1: 'timer', 2: 'alarm', 3: 'reminder' };

// "kind,epoch,label;..." as serialised by store_serialize() on the watch.
function decodeSchedule(encoded) {
  var out = [];
  if (!encoded) {
    return out;
  }
  var rows = encoded.split(';');
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i]) {
      continue;
    }
    var first = rows[i].indexOf(',');
    var second = rows[i].indexOf(',', first + 1);
    if (first < 0 || second < 0) {
      continue;
    }
    out.push({
      kind: KIND_NAMES[parseInt(rows[i].substring(0, first), 10)] || 'item',
      at: new Date(parseInt(rows[i].substring(first + 1, second), 10) * 1000),
      label: rows[i].substring(second + 1)
    });
  }
  return out;
}

function describeSchedule(encoded) {
  var items = decodeSchedule(encoded);
  if (items.length === 0) {
    return 'The watch has no timers, alarms or reminders set.';
  }
  var lines = [];
  for (var i = 0; i < items.length; i++) {
    lines.push('- ' + items[i].kind + ' at ' + localString(items[i].at) +
               (items[i].label ? ' (' + items[i].label + ')' : ''));
  }
  return lines.join('\n');
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function localString(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
         ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

// Parses YYYY-MM-DDTHH:MM (or "YYYY-MM-DD HH:MM", or bare "HH:MM") as phone
// local time. Engines disagree about how Date() treats a timezone-less string,
// so build the Date from parts instead of parsing.
function parseLocal(text) {
  if (!text) {
    return null;
  }
  var full = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(text);
  if (full) {
    return new Date(+full[1], +full[2] - 1, +full[3], +full[4], +full[5], 0, 0);
  }
  var hhmm = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (hhmm) {
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +hhmm[1], +hhmm[2], 0, 0);
    if (d.getTime() <= now.getTime()) {
      d = new Date(d.getTime() + 86400000);
    }
    return d;
  }
  return null;
}

function parseDate(text) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0) : null;
}

// A calendar time from the model: { allDay, date, at (Date) } or null.
function parseWhen(text) {
  var date = parseDate(text);
  if (date) {
    return { allDay: true, date: calendar.day(date), at: date };
  }
  var at = parseLocal(text);
  return at ? { allDay: false, at: at } : null;
}

function trimLabel(label) {
  return (label || '').substring(0, 30);
}

// ctx: { schedule: string, emitAction: function(kind, epochSeconds, label),
//        confirm: function(question, callback(yes)) }
function execute(name, input, ctx, callback) {
  input = input || {};

  if (name === 'set_timer') {
    var minutes = Number(input.minutes);
    if (!(minutes > 0)) {
      callback('Error: minutes must be a positive number.');
      return;
    }
    var fires = new Date(Date.now() + Math.round(minutes * 60000));
    ctx.emitAction(ACT.TIMER, Math.floor(fires.getTime() / 1000), trimLabel(input.label));
    callback('Timer set for ' + minutes + ' minute(s); it goes off at ' + localString(fires) + '.');
    return;
  }

  if (name === 'set_alarm') {
    var alarmAt = parseLocal(input.at);
    if (!alarmAt) {
      callback('Error: could not read "at". Use YYYY-MM-DDTHH:MM.');
      return;
    }
    ctx.emitAction(ACT.ALARM, Math.floor(alarmAt.getTime() / 1000), trimLabel(input.label));
    callback('Alarm set for ' + localString(alarmAt) + '.');
    return;
  }

  if (name === 'set_reminder') {
    var remindAt = parseLocal(input.at);
    if (!remindAt) {
      callback('Error: could not read "at". Use YYYY-MM-DDTHH:MM.');
      return;
    }
    var label = trimLabel(input.label);
    ctx.emitAction(ACT.REMINDER, Math.floor(remindAt.getTime() / 1000), label);

    if (input.pin === false) {
      callback('Reminder set for ' + localString(remindAt) + '.');
      return;
    }
    var pin = timeline.buildPin(timeline.newId('rem'), remindAt, label, input.note || '', 0);
    timeline.putPin(pin, function (ok) {
      callback('Reminder set for ' + localString(remindAt) +
               (ok ? ' and pinned to the timeline.' : '. The timeline pin failed, the watch alert is still set.'));
    });
    return;
  }

  if (name === 'pin_note') {
    var pinAt = parseLocal(input.at) || new Date();
    var note = timeline.buildPin(timeline.newId('note'), pinAt,
                                 input.title || 'Note', input.body || '', 0);
    timeline.putPin(note, function (ok, err) {
      callback(ok ? ('Pinned to the timeline at ' + localString(pinAt) + '.')
                  : ('Could not pin: ' + err));
    });
    return;
  }

  if (name === 'cancel_schedule') {
    ctx.emitAction(ACT.CANCEL, 0, input.match || '*');
    callback(input.match === '*' ? 'Cancelled everything on the watch.'
                                 : ('Cancelled entries matching "' + input.match + '".'));
    return;
  }

  if (name === 'list_schedule') {
    callback(describeSchedule(ctx.schedule));
    return;
  }

  if (name === 'remember_fact') {
    if (!input.fact) {
      callback('Error: fact is required.');
      return;
    }
    var count = settings.remember(String(input.fact));
    callback('Remembered. ' + count + ' fact(s) stored.');
    return;
  }

  if (name.indexOf('calendar_') === 0) {
    executeCalendar(name, input, ctx, callback);
    return;
  }

  callback('Error: unknown tool ' + name);
}

function executeCalendar(name, input, ctx, callback) {
  if (!calendar.isConfigured()) {
    callback('Error: Google Calendar is not connected. The user can set it up in the AI Companion settings.');
    return;
  }
  var ja = settings.get('lang') !== 'en';

  if (name === 'calendar_list_events') {
    var from = parseWhen(input.from) || { allDay: true, at: parseDate(calendar.day(new Date())) };
    var to;
    if (input.to) {
      to = parseWhen(input.to);
      if (!to) {
        callback('Error: could not read "to". Use YYYY-MM-DD or YYYY-MM-DDTHH:MM.');
        return;
      }
    }
    // A bare date (or no "to" at all) means "through the end of that day".
    var toAt = to ? to.at : from.at;
    if (!to || to.allDay) {
      toAt = new Date(toAt.getFullYear(), toAt.getMonth(), toAt.getDate() + 1);
    }
    calendar.request('list', {
      from: from.at.getTime(), to: toAt.getTime(), query: input.query
    }, function (err, result) {
      if (err) {
        callback('Error: ' + err);
        return;
      }
      var events = result.events || [];
      if (events.length === 0) {
        callback('No events between ' + localString(from.at) + ' and ' + localString(toAt) + '.');
        return;
      }
      var lines = [];
      for (var i = 0; i < events.length; i++) {
        lines.push(calendar.line(calendar.remember(events[i]), events[i]));
      }
      if (result.truncated) {
        lines.push('(more events not shown; narrow the range)');
      }
      callback(lines.join('\n'));
    });
    return;
  }

  if (name === 'calendar_create_event') {
    var start = parseWhen(input.start);
    if (!start || !input.title) {
      callback('Error: title and start (YYYY-MM-DDTHH:MM or YYYY-MM-DD) are required.');
      return;
    }
    var end = input.end ? parseWhen(input.end) : null;
    var args = { title: input.title, location: input.location, description: input.description };
    if (start.allDay) {
      args.allDay = true;
      args.date = start.date;
      if (end && end.allDay) {
        args.endDate = end.date;
      }
    } else {
      args.start = start.at.getTime();
      if (end && !end.allDay) {
        args.end = end.at.getTime();
      }
    }
    calendar.request('create', args, function (err, result) {
      if (err) {
        callback('Error: ' + err);
        return;
      }
      var ev = result.event;
      callback('Added to Google Calendar: ' + calendar.line(calendar.remember(ev), ev));
    });
    return;
  }

  // Update and delete act on an event the model has already seen.
  var known = calendar.lookup(input.id);
  if (!known) {
    callback('Error: unknown event id "' + input.id + '". Call calendar_list_events first and use an id it returns.');
    return;
  }

  if (name === 'calendar_delete_event') {
    var question = ja ? calendar.summary(known, true) + 'を削除しますか？'
                      : 'Delete ' + calendar.summary(known, false) + '?';
    ctx.confirm(question, function (yes) {
      if (!yes) {
        callback('The user declined on the watch. Nothing was deleted.');
        return;
      }
      calendar.request('delete', { ref: known.ref }, function (err) {
        if (err) {
          callback('Error: ' + err);
          return;
        }
        calendar.forgetEvent(String(input.id).trim());
        callback('Deleted: ' + calendar.when(known) + ' ' + known.title +
                 (known.recurring ? ' (this occurrence only)' : '') + '.');
      });
    });
    return;
  }

  if (name === 'calendar_update_event') {
    var changes = { ref: known.ref };
    var parts = [];
    if (input.title) {
      changes.title = input.title;
      parts.push(ja ? '名前→' + input.title : 'title → ' + input.title);
    }
    if (input.start) {
      var newStart = parseWhen(input.start);
      if (!newStart) {
        callback('Error: could not read "start".');
        return;
      }
      if (newStart.allDay) {
        changes.date = newStart.date;
      } else {
        changes.start = newStart.at.getTime();
      }
      parts.push((ja ? '→' : '→ ') + (newStart.allDay ? newStart.date : localString(newStart.at)));
    }
    if (input.end) {
      var newEnd = parseLocal(input.end);
      if (!newEnd) {
        callback('Error: could not read "end".');
        return;
      }
      changes.end = newEnd.getTime();
      parts.push((ja ? '終了' : 'ends ') + localString(newEnd).substring(11));
    }
    if (input.location !== undefined) {
      changes.location = input.location;
      parts.push((ja ? '場所→' : 'at ') + input.location);
    }
    if (parts.length === 0) {
      callback('Error: nothing to change. Give title, start, end or location.');
      return;
    }
    var ask = ja ? calendar.summary(known, true) + 'を変更しますか？\n' + parts.join(' ')
                 : 'Change ' + calendar.summary(known, false) + '?\n' + parts.join(', ');
    ctx.confirm(ask, function (yes) {
      if (!yes) {
        callback('The user declined on the watch. Nothing was changed.');
        return;
      }
      calendar.request('update', changes, function (err, result) {
        if (err) {
          callback('Error: ' + err);
          return;
        }
        var ev = result.event;
        callback('Updated: ' + calendar.line(calendar.remember(ev), ev));
      });
    });
    return;
  }

  callback('Error: unknown tool ' + name);
}

// OpenAI's Responses API and Gemini's Interactions API both declare custom
// tools flat, with the schema under `parameters`; Anthropic nests it under
// `input_schema`. Same tools either way.
function flatDefinitions() {
  var defs = definitions();
  var out = [];
  for (var i = 0; i < defs.length; i++) {
    out.push({
      type: 'function',
      name: defs[i].name,
      description: defs[i].description,
      parameters: defs[i].input_schema
    });
  }
  return out;
}

module.exports = {
  ACT: ACT,
  DEFINITIONS: DEFINITIONS,
  definitions: definitions,
  flatDefinitions: flatDefinitions,
  execute: execute,
  describeSchedule: describeSchedule,
  localString: localString,
  parseLocal: parseLocal
};
