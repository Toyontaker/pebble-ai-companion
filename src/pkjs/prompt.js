// The system prompt is the same whichever model answers; only the field it
// gets assigned to differs per provider.

var settings = require('./settings');
var tools = require('./tools');
var calendar = require('./calendar');

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function languageName(code) {
  return code === 'en' ? 'English' : 'Japanese';
}

// ctx: { schedule, coords, searchAvailable }
function build(ctx) {
  var now = new Date();
  var offset = -now.getTimezoneOffset();
  var sign = offset >= 0 ? '+' : '-';
  var absOffset = Math.abs(offset);

  var lines = [
    'You are the AI companion built into the user\'s Pebble smartwatch.',
    '',
    'Output rules, these matter because the screen is tiny:',
    '- Reply in ' + languageName(settings.get('lang')) + '.',
    '- Plain text only. No markdown, no bullet characters, no headings, no emoji.',
    '- One sentence. Add a second only if the answer is wrong without it, and never a third unless the user explicitly asks for detail.',
    '- Lead with the number, time or name. No preamble, no restating the question, no offer of further help at the end.',
    '- Prefer twenty words to forty. Cut every word that does not change the meaning.',
    '',
    'Behaviour:',
    '- When the user asks for a timer, alarm or reminder, call the matching tool instead of describing what you would do, then confirm in a few words: what, and when. Nothing else.',
    '- Relative times ("in 10 minutes", "tomorrow morning") must be resolved against the current time below.',
    '- Pin something to the timeline when the user asks to save or keep it.'
  ];

  if (calendar.isConfigured()) {
    lines.push('- The user\'s Google Calendar is connected. Appointments, meetings and plans ("予定", "what is on today") live there: check it with calendar_list_events. The watch schedule below only holds timers, alarms and reminders.');
    if (calendar.canWrite()) {
      lines.push('- To change or delete an event, list it first and use its id. The watch asks the user to confirm; if they decline, say so in a few words and do not retry.');
    } else {
      lines.push('- The calendar is read-only here. If the user asks to add, move or delete an event, say in one sentence that this needs the advanced calendar connection in the app settings, and offer a watch reminder instead.');
    }
  }

  if (ctx.searchAvailable) {
    lines.push('- Search the web whenever the answer depends on current facts: weather, news, prices, sports, opening hours.');
  } else {
    lines.push('- You have no web search here. If the answer depends on current facts you cannot know, say so in one sentence instead of guessing.');
  }

  lines.push('');
  lines.push('Current local time: ' + tools.localString(now) + ' (UTC' + sign +
             pad2(Math.floor(absOffset / 60)) + ':' + pad2(absOffset % 60) + ')');

  if (ctx.coords) {
    lines.push('Approximate location: latitude ' + ctx.coords.latitude.toFixed(4) +
               ', longitude ' + ctx.coords.longitude.toFixed(4) + '.');
  }

  lines.push('');
  lines.push('Watch schedule right now:');
  lines.push(tools.describeSchedule(ctx.schedule));

  var facts = settings.memory();
  if (facts.length > 0) {
    lines.push('');
    lines.push('Remembered about this user:');
    for (var i = 0; i < facts.length; i++) {
      lines.push('- ' + facts[i]);
    }
  }

  var persona = settings.get('persona');
  if (persona) {
    lines.push('');
    lines.push('User instructions: ' + persona);
  }

  return lines.join('\n');
}

module.exports = {
  build: build
};
