// A small iCalendar (.ics) reader for the read-only calendar mode: Google
// Calendar's "secret address in iCal format". It parses VEVENTs and expands
// recurring ones into the occurrences that fall inside a time range.
//
// Covered: DTSTART/DTEND/DURATION as UTC, floating, TZID or all-day dates;
// RRULE FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY
// (with ordinals such as 2SU or -1FR), BYMONTHDAY and BYMONTH; EXDATE;
// RECURRENCE-ID overrides; STATUS:CANCELLED. Timezones come from the feed's
// own VTIMEZONE blocks (Google always includes them), so this does not need
// Intl, which PebbleKit JS may not have. Anything unrecognised falls back to
// the phone's local time rather than failing the whole calendar.

var DAY_MS = 86400000;
var MAX_STEPS = 3000;   // per recurring event, a guard against runaway rules
var WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// ------------------------------------------------------------------ lexing

function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(value) {
  return value.replace(/\\([\\;,nN])/g, function (m, c) {
    return (c === 'n' || c === 'N') ? '\n' : c;
  });
}

// "DTSTART;TZID=Asia/Tokyo:20261013T150000" -> { name, params, value }
function parseLine(line) {
  var colon = -1;
  var quoted = false;
  for (var i = 0; i < line.length; i++) {
    var c = line.charAt(i);
    if (c === '"') {
      quoted = !quoted;
    } else if (c === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) {
    return null;
  }
  var head = line.substring(0, colon).split(';');
  var params = {};
  for (var j = 1; j < head.length; j++) {
    var eq = head[j].indexOf('=');
    if (eq > 0) {
      params[head[j].substring(0, eq).toUpperCase()] = head[j].substring(eq + 1).replace(/^"|"$/g, '');
    }
  }
  return { name: head[0].toUpperCase(), params: params, value: line.substring(colon + 1) };
}

// ------------------------------------------------------- dates and zones

// Wall-clock fields; no timezone attached yet.
function parseStamp(value) {
  var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(String(value).trim());
  if (!m) {
    return null;
  }
  return {
    y: +m[1], mo: +m[2], d: +m[3],
    h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0, s: m[6] ? +m[6] : 0,
    dateOnly: !m[4],
    utc: m[7] === 'Z'
  };
}

function offsetMinutes(text) {
  var m = /^([+-])(\d{2})(\d{2})/.exec(String(text || ''));
  if (!m) {
    return null;
  }
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
}

function weekday(y, mo, d) {
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function daysInMonth(y, mo) {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

// The day of the month for "the 2nd Sunday" (n=2) or "the last Friday" (n=-1).
function nthWeekday(y, mo, wd, n) {
  if (n > 0) {
    var first = weekday(y, mo, 1);
    var day = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
    return day <= daysInMonth(y, mo) ? day : null;
  }
  var last = daysInMonth(y, mo);
  var lastWd = weekday(y, mo, last);
  var back = last - ((lastWd - wd + 7) % 7) + (n + 1) * 7;
  return back >= 1 ? back : null;
}

// Wall-clock fields as a sortable number of minutes (no zone involved).
function wallMinutes(f) {
  return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi) / 60000;
}

// When an observance (STANDARD/DAYLIGHT) starts in a given year, in wall time
// of the offset in force before it.
function observanceStart(obs, year) {
  var start = obs.start;
  if (!obs.rule) {
    return start.y === year ? wallMinutes(start) : (start.y < year ? -Infinity : Infinity);
  }
  var month = obs.rule.BYMONTH ? +obs.rule.BYMONTH : start.mo;
  var day = start.d;
  var by = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(obs.rule.BYDAY || '');
  if (by) {
    day = nthWeekday(year, month, WEEKDAYS[by[2]], by[1] ? +by[1] : 1);
  }
  if (!day) {
    return Infinity;
  }
  return wallMinutes({ y: year, mo: month, d: day, h: start.h, mi: start.mi });
}

// UTC offset (minutes) in force at the given wall-clock time in zone tz.
function zoneOffset(tz, f) {
  var obs = tz.observances;
  if (obs.length === 1) {
    return obs[0].to;
  }
  var t = wallMinutes(f);
  var best = null;
  var bestStart = -Infinity;
  var latest = null;
  var latestStart = -Infinity;
  for (var i = 0; i < obs.length; i++) {
    var s = observanceStart(obs[i], f.y);
    if (s <= t && s > bestStart) {
      best = obs[i];
      bestStart = s;
    }
    if (s !== Infinity && s > latestStart) {
      latest = obs[i];
      latestStart = s;
    }
  }
  // Before this year's first transition the previous year's last one holds.
  return (best || latest || obs[0]).to;
}

// Wall-clock fields in a zone -> epoch ms.
function toInstant(f, tzid, zones) {
  if (f.utc) {
    return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s);
  }
  var tz = tzid && zones[tzid];
  if (tz && tz.observances.length) {
    return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) - zoneOffset(tz, f) * 60000;
  }
  // Floating time, or a zone the feed did not describe: use the phone's.
  return new Date(f.y, f.mo - 1, f.d, f.h, f.mi, f.s).getTime();
}

function dateKey(f) {
  return f.y + '-' + (f.mo < 10 ? '0' : '') + f.mo + '-' + (f.d < 10 ? '0' : '') + f.d;
}

function addDays(f, n) {
  var dt = new Date(Date.UTC(f.y, f.mo - 1, f.d + n));
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
           h: f.h, mi: f.mi, s: f.s, dateOnly: f.dateOnly, utc: f.utc };
}

function parseDuration(text) {
  var m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(text || ''));
  if (!m) {
    return null;
  }
  var ms = ((+m[2] || 0) * 7 * DAY_MS) + ((+m[3] || 0) * DAY_MS) +
           ((+m[4] || 0) * 3600000) + ((+m[5] || 0) * 60000) + ((+m[6] || 0) * 1000);
  return m[1] === '-' ? -ms : ms;
}

function parseRule(value) {
  var rule = {};
  var parts = String(value).split(';');
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if (eq > 0) {
      rule[parts[i].substring(0, eq).toUpperCase()] = parts[i].substring(eq + 1);
    }
  }
  return rule;
}

// ----------------------------------------------------------------- parsing

function parse(text) {
  var lines = unfold(text).split('\n');
  var zones = {};
  var events = [];
  var name = '';
  var stack = [];
  var cur = null;
  var zone = null;
  var obs = null;

  for (var i = 0; i < lines.length; i++) {
    if (!lines[i]) {
      continue;
    }
    var p = parseLine(lines[i]);
    if (!p) {
      continue;
    }
    if (p.name === 'BEGIN') {
      var kind = p.value.toUpperCase();
      stack.push(kind);
      if (kind === 'VEVENT') {
        cur = { exdates: [] };
      } else if (kind === 'VTIMEZONE') {
        zone = { observances: [] };
      } else if ((kind === 'STANDARD' || kind === 'DAYLIGHT') && zone) {
        obs = {};
      }
      continue;
    }
    if (p.name === 'END') {
      var ended = stack.pop();
      if (ended === 'VEVENT' && cur) {
        if (cur.start) {
          events.push(cur);
        }
        cur = null;
      } else if (ended === 'VTIMEZONE' && zone) {
        if (zone.id) {
          zones[zone.id] = zone;
        }
        zone = null;
      } else if ((ended === 'STANDARD' || ended === 'DAYLIGHT') && obs && zone) {
        if (obs.start && obs.to !== null && obs.to !== undefined) {
          zone.observances.push(obs);
        }
        obs = null;
      }
      continue;
    }

    var top = stack[stack.length - 1];
    if (top === 'VCALENDAR' && p.name === 'X-WR-CALNAME') {
      name = unescapeText(p.value);
    } else if (top === 'VTIMEZONE' && zone && p.name === 'TZID') {
      zone.id = p.value;
    } else if ((top === 'STANDARD' || top === 'DAYLIGHT') && obs) {
      if (p.name === 'DTSTART') { obs.start = parseStamp(p.value); }
      if (p.name === 'TZOFFSETTO') { obs.to = offsetMinutes(p.value); }
      if (p.name === 'RRULE') { obs.rule = parseRule(p.value); }
    } else if (top === 'VEVENT' && cur) {
      switch (p.name) {
        case 'UID': cur.uid = p.value; break;
        case 'SUMMARY': cur.title = unescapeText(p.value); break;
        case 'LOCATION': cur.location = unescapeText(p.value); break;
        case 'STATUS': cur.status = p.value.toUpperCase(); break;
        case 'RRULE': cur.rule = parseRule(p.value); break;
        case 'DURATION': cur.duration = parseDuration(p.value); break;
        case 'DTSTART':
          cur.start = parseStamp(p.value);
          cur.tzid = p.params.TZID;
          break;
        case 'DTEND':
          cur.end = parseStamp(p.value);
          cur.endTzid = p.params.TZID;
          break;
        case 'RECURRENCE-ID':
          cur.recurrenceId = parseStamp(p.value);
          cur.recurrenceTzid = p.params.TZID;
          break;
        case 'EXDATE':
          var values = p.value.split(',');
          for (var k = 0; k < values.length; k++) {
            var ex = parseStamp(values[k]);
            if (ex) {
              cur.exdates.push({ stamp: ex, tzid: p.params.TZID });
            }
          }
          break;
        default:
          break;
      }
    }
  }
  return { name: name, zones: zones, events: events };
}

// --------------------------------------------------------------- expanding

// Candidate wall-clock dates for one period of the rule, in order.
function periodDates(ev, rule, period) {
  var s = ev.start;
  var interval = +(rule.INTERVAL || 1);
  var byday = rule.BYDAY ? rule.BYDAY.split(',') : null;
  var out = [];
  var freq = rule.FREQ;

  if (freq === 'DAILY') {
    out.push(addDays(s, period * interval));
    return out;
  }

  if (freq === 'WEEKLY') {
    // Weeks start on Monday (RFC 5545 default WKST).
    var monday = addDays(s, -((weekday(s.y, s.mo, s.d) + 6) % 7) + period * interval * 7);
    var days = byday ? byday.map(function (b) { return WEEKDAYS[b.slice(-2)]; })
                     : [weekday(s.y, s.mo, s.d)];
    days.sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); });
    for (var i = 0; i < days.length; i++) {
      out.push(addDays(monday, (days[i] + 6) % 7));
    }
    return out;
  }

  if (freq === 'MONTHLY' || freq === 'YEARLY') {
    var months = [];
    if (freq === 'MONTHLY') {
      var total = (s.mo - 1) + period * interval;
      months.push({ y: s.y + Math.floor(total / 12), mo: (total % 12) + 1 });
    } else {
      var y = s.y + period * interval;
      var list = rule.BYMONTH ? rule.BYMONTH.split(',').map(Number) : [s.mo];
      list.sort(function (a, b) { return a - b; });
      for (var mIdx = 0; mIdx < list.length; mIdx++) {
        months.push({ y: y, mo: list[mIdx] });
      }
    }
    for (var j = 0; j < months.length; j++) {
      var mo = months[j];
      var dim = daysInMonth(mo.y, mo.mo);
      var dayList = [];
      if (byday) {
        for (var b = 0; b < byday.length; b++) {
          var m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(byday[b]);
          if (!m) {
            continue;
          }
          if (m[1]) {
            var nth = nthWeekday(mo.y, mo.mo, WEEKDAYS[m[2]], +m[1]);
            if (nth) { dayList.push(nth); }
          } else {
            for (var dd = 1; dd <= dim; dd++) {
              if (weekday(mo.y, mo.mo, dd) === WEEKDAYS[m[2]]) { dayList.push(dd); }
            }
          }
        }
      } else if (rule.BYMONTHDAY) {
        var mdays = rule.BYMONTHDAY.split(',');
        for (var md = 0; md < mdays.length; md++) {
          var n = +mdays[md];
          var day = n > 0 ? n : dim + n + 1;
          if (day >= 1 && day <= dim) { dayList.push(day); }
        }
      } else if (s.d <= dim) {
        dayList.push(s.d);   // e.g. the 31st: months without one are skipped
      }
      dayList.sort(function (a, b) { return a - b; });
      for (var k = 0; k < dayList.length; k++) {
        if (k > 0 && dayList[k] === dayList[k - 1]) { continue; }
        out.push({ y: mo.y, mo: mo.mo, d: dayList[k], h: s.h, mi: s.mi, s: s.s,
                   dateOnly: s.dateOnly, utc: s.utc });
      }
    }
    return out;
  }
  return null;   // unsupported frequency
}

function occurrenceKey(f, ev, zones) {
  return ev.start.dateOnly ? dateKey(f) : String(toInstant(f, ev.tzid, zones));
}

function lengthOf(ev, zones) {
  if (ev.end) {
    if (ev.start.dateOnly) {
      return Math.round((Date.UTC(ev.end.y, ev.end.mo - 1, ev.end.d) -
                         Date.UTC(ev.start.y, ev.start.mo - 1, ev.start.d)) / DAY_MS) * DAY_MS;
    }
    return toInstant(ev.end, ev.endTzid || ev.tzid, zones) - toInstant(ev.start, ev.tzid, zones);
  }
  if (ev.duration !== undefined && ev.duration !== null) {
    return ev.duration;
  }
  return ev.start.dateOnly ? DAY_MS : 0;
}

// One concrete occurrence in the shape calendar.js expects.
function occurrence(ev, f, length, calName, zones) {
  var item = {
    ref: 'ical|' + (ev.uid || ev.title) + '|' + dateKey(f) + 'T' + f.h + ':' + f.mi,
    title: ev.title || '(no title)',
    calendar: calName,
    allDay: !!f.dateOnly,
    recurring: !!ev.rule || !!ev.recurrenceId,
    location: ev.location || ''
  };
  if (f.dateOnly) {
    var days = Math.max(1, Math.round(length / DAY_MS));
    item.date = dateKey(f);
    item.endDate = dateKey(addDays(f, days - 1));
    // Phone-local span, for range checks only.
    item._from = new Date(f.y, f.mo - 1, f.d).getTime();
    item._to = new Date(f.y, f.mo - 1, f.d + days).getTime();
  } else {
    item.start = toInstant(f, ev.tzid, zones);
    item.end = item.start + length;
    item._from = item.start;
    item._to = Math.max(item.end, item.start + 1);
  }
  return item;
}

function overlaps(item, from, to) {
  return item._from < to && item._to > from;
}

// Every occurrence overlapping [from, to), sorted by start.
function expand(cal, from, to) {
  var zones = cal.zones;
  var name = cal.name || 'Calendar';
  var out = [];

  // Instances rewritten or cancelled individually, keyed by uid + original time.
  var overridden = {};
  for (var i = 0; i < cal.events.length; i++) {
    var ov = cal.events[i];
    if (ov.recurrenceId) {
      var keyEv = { start: ov.recurrenceId, tzid: ov.recurrenceTzid || ov.tzid };
      overridden[ov.uid + '|' + occurrenceKey(ov.recurrenceId, keyEv, zones)] = true;
    }
  }

  for (var e = 0; e < cal.events.length; e++) {
    var ev = cal.events[e];
    if (ev.status === 'CANCELLED') {
      continue;
    }
    var length = lengthOf(ev, zones);

    if (!ev.rule || ev.recurrenceId) {
      var single = occurrence(ev, ev.start, length, name, zones);
      if (overlaps(single, from, to)) {
        out.push(single);
      }
      continue;
    }

    var rule = ev.rule;
    var exdates = {};
    for (var x = 0; x < ev.exdates.length; x++) {
      var exEv = { start: ev.exdates[x].stamp, tzid: ev.exdates[x].tzid || ev.tzid };
      exdates[occurrenceKey(ev.exdates[x].stamp, exEv, zones)] = true;
    }
    var count = rule.COUNT ? +rule.COUNT : Infinity;
    var until = null;
    if (rule.UNTIL) {
      var u = parseStamp(rule.UNTIL);
      if (u) {
        until = u.dateOnly ? new Date(u.y, u.mo - 1, u.d, 23, 59, 59).getTime()
                           : toInstant(u, u.utc ? null : ev.tzid, zones);
      }
    }
    var startInstant = toInstant(ev.start, ev.tzid, zones);
    var seen = 0;
    var done = false;

    // A long-running rule without COUNT can start near the range instead of
    // at DTSTART (a daily event from years ago would otherwise use up
    // MAX_STEPS first). COUNT needs every occurrence counted, so no skipping.
    var firstPeriod = 0;
    // Longest possible period length, so the skip can only fall short.
    var periodDays = { DAILY: 1, WEEKLY: 7, MONTHLY: 31, YEARLY: 366 }[rule.FREQ];
    if (!rule.COUNT && periodDays) {
      var span = periodDays * DAY_MS * +(rule.INTERVAL || 1);
      firstPeriod = Math.max(0, Math.floor((from - length - startInstant) / span) - 2);
    }

    for (var period = firstPeriod; period < firstPeriod + MAX_STEPS && !done; period++) {
      var dates = periodDates(ev, rule, period);
      if (!dates) {
        // Unsupported rule: show the first occurrence rather than nothing.
        var first = occurrence(ev, ev.start, length, name, zones);
        if (overlaps(first, from, to)) { out.push(first); }
        break;
      }
      for (var d = 0; d < dates.length; d++) {
        var f = dates[d];
        var at = toInstant(f, ev.tzid, zones);
        if (at < startInstant) {
          continue;   // dates before DTSTART in the first period
        }
        if ((until !== null && at > until) || seen >= count) {
          done = true;
          break;
        }
        seen++;
        if (at - length > to) {
          done = true;
          break;
        }
        var key = occurrenceKey(f, ev, zones);
        if (exdates[key] || overridden[ev.uid + '|' + key]) {
          continue;
        }
        var item = occurrence(ev, f, length, name, zones);
        if (overlaps(item, from, to)) {
          out.push(item);
        } else if (item._from >= to) {
          done = true;
          break;
        }
      }
    }
  }

  out.sort(function (a, b) { return a._from - b._from; });
  for (var o = 0; o < out.length; o++) {
    delete out[o]._from;
    delete out[o]._to;
  }
  return out;
}

module.exports = {
  parse: parse,
  expand: expand
};
