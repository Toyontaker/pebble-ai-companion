var settings = require('./settings');
var provider = require('./provider');
var timeline = require('./timeline');
var tools = require('./tools');
var configPage = require('./config_page');
var calendar = require('./calendar');

// Mirrors the enums in src/c/comm.h.
var CMD = { ASK: 1, BRIEF: 2, PIN: 3, SYNC: 4, ABORT: 5, CONFIRM: 6 };
var ST = {
  IDLE: 0, THINKING: 1, SEARCHING: 2, TOOL: 3,
  ERROR: 4, PINNING: 5, PINNED: 6, PIN_FAIL: 7
};

// The watch keeps a 1KB answer buffer; leave headroom for the terminator.
var ANSWER_BYTE_BUDGET = 960;
var CHUNK_CHARS = 80;
var HISTORY_TTL_MS = 10 * 60 * 1000;
// How long a confirmation waits on the watch before it counts as "no".
var CONFIRM_TIMEOUT_MS = 60 * 1000;
var CONFIRM_TEXT_MAX = 200;

// The conversation itself lives inside the active provider module, since each
// API carries it differently.
var state = {
  schedule: '',
  activeCtx: null,     // the ctx handed to the provider for the request in flight
  lastExchangeAt: 0,
  lastAnswer: '',
  lastQuestion: '',
  busy: false,
  confirm: null        // { callback, timer } while the watch shows a yes/no
};

// ------------------------------------------------------------- outbox queue

// AppMessage only carries one message at a time, so serialise sends and retry
// the transient failures rather than dropping half an answer.
var outbox = [];
var sending = false;

function enqueue(dict) {
  outbox.push({ dict: dict, tries: 0 });
  pump();
}

function pump() {
  if (sending || outbox.length === 0) {
    return;
  }
  sending = true;
  var entry = outbox[0];
  Pebble.sendAppMessage(entry.dict, function () {
    outbox.shift();
    sending = false;
    pump();
  }, function (e) {
    sending = false;
    entry.tries++;
    if (entry.tries >= 3) {
      // Not the whole event: it can echo the message, which may be an answer.
      console.log('dropping message after 3 attempts: ' +
                  ((e && e.error && e.error.message) || 'unknown error'));
      outbox.shift();
    }
    setTimeout(pump, 250);
  });
}

function sendStatus(status) {
  enqueue({ RES_STATUS: status });
}

// The watch stores the answer as UTF-8, so budgets are counted in bytes and
// cuts have to land on whole code points.
function utf8Length(text) {
  var bytes = 0;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xD800 && code <= 0xDBFF) {
      bytes += 4;
      i++;                       // skip the low surrogate
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function isHighSurrogate(text, index) {
  var code = text.charCodeAt(index);
  return code >= 0xD800 && code <= 0xDBFF;
}

function truncateToBytes(text, budget) {
  if (utf8Length(text) <= budget) {
    return text;
  }
  var end = text.length;
  while (end > 0 && utf8Length(text.substring(0, end)) > budget - 3) {
    end -= 4;
  }
  if (end > 0 && isHighSurrogate(text, end - 1)) {
    end--;
  }
  return text.substring(0, Math.max(end, 0)) + '...';
}

function sendAnswer(text) {
  var body = truncateToBytes(text, ANSWER_BYTE_BUDGET);
  if (body.length === 0) {
    enqueue({ RES_TEXT: '', RES_MORE: 0 });
    return;
  }
  var start = 0;
  while (start < body.length) {
    var end = Math.min(start + CHUNK_CHARS, body.length);
    if (end < body.length && isHighSurrogate(body, end - 1)) {
      end--;                     // never split a surrogate pair
    }
    enqueue({ RES_TEXT: body.substring(start, end), RES_MORE: end < body.length ? 1 : 0 });
    start = end;
  }
}

// The watch echoes its schedule back after applying an action, but that round
// trip is slower than the next tool call in the same turn, so keep the local
// copy in step immediately. The watch's next sync overwrites this.
function updateScheduleMirror(kind, epochSeconds, label) {
  if (kind === tools.ACT.CANCEL) {
    if (!label || label === '*') {
      state.schedule = '';
      return;
    }
    state.schedule = state.schedule.split(';').filter(function (row) {
      return row && row.substring(row.indexOf(',', row.indexOf(',') + 1) + 1).indexOf(label) === -1;
    }).join(';');
    if (state.schedule) {
      state.schedule += ';';
    }
    return;
  }
  if (kind === tools.ACT.TIMER || kind === tools.ACT.ALARM || kind === tools.ACT.REMINDER) {
    state.schedule += kind + ',' + epochSeconds + ',' + (label || '') + ';';
  }
}

function sendAction(kind, epochSeconds, label) {
  enqueue({ ACT_KIND: kind, ACT_TIME: epochSeconds, ACT_TEXT: label || '' });
  updateScheduleMirror(kind, epochSeconds, label);
  // The provider holds a reference to ctx for the whole tool loop, so the
  // update has to land there too or list_schedule reads a stale snapshot.
  if (state.activeCtx) {
    state.activeCtx.schedule = state.schedule;
  }
}

function sendReady() {
  enqueue({
    READY: settings.isConfigured() ? 1 : 0,
    CFG_LANG: settings.get('lang') === 'en' ? 1 : 0,
    CFG_SOUND: settings.getBool('sound') ? 1 : 0
  });
}

// ------------------------------------------------------------ confirmation

// Asks the user yes/no on the watch. Destructive tools (calendar update and
// delete) go through here so a misheard request cannot change anything on its
// own. No answer within the timeout counts as no.
function askConfirm(question, callback) {
  settleConfirm(false);
  var entry = { callback: callback, timer: null };
  entry.timer = setTimeout(function () {
    if (state.confirm === entry) {
      console.log('confirmation timed out');
      settleConfirm(false);
    }
  }, CONFIRM_TIMEOUT_MS);
  state.confirm = entry;
  enqueue({ CONFIRM_TEXT: truncateToBytes(question, CONFIRM_TEXT_MAX) });
}

function settleConfirm(yes) {
  var entry = state.confirm;
  if (!entry) {
    return;
  }
  state.confirm = null;
  clearTimeout(entry.timer);
  entry.callback(yes);
}

// An aborted request must not resume its tool loop when a late answer arrives.
function dropConfirm() {
  if (state.confirm) {
    clearTimeout(state.confirm.timer);
    state.confirm = null;
  }
}

// ------------------------------------------------------------------ location

function withLocation(callback) {
  if (!settings.getBool('location') || !navigator.geolocation) {
    callback(null);
    return;
  }
  var settled = false;
  navigator.geolocation.getCurrentPosition(function (position) {
    if (!settled) { settled = true; callback(position.coords); }
  }, function (error) {
    console.log('geolocation error: ' + error.message);
    if (!settled) { settled = true; callback(null); }
  }, { timeout: 6000, maximumAge: 300000, enableHighAccuracy: false });
}

// ------------------------------------------------------------------- asking

function runAsk(question) {
  if (state.busy) {
    dropConfirm();
    provider.abort();
  }
  // A question asked long after the last one starts a fresh conversation
  // rather than dragging stale context along.
  if (Date.now() - state.lastExchangeAt > HISTORY_TTL_MS) {
    provider.resetSession();
  }

  state.busy = true;
  state.lastQuestion = question;
  sendStatus(ST.THINKING);

  withLocation(function (coords) {
    var ctx = {
      schedule: state.schedule,
      coords: coords,
      emitAction: sendAction,
      confirm: askConfirm
    };
    state.activeCtx = ctx;

    provider.ask(question, ctx, {
      onStatus: function (name) {
        sendStatus(name === 'searching' ? ST.SEARCHING : ST.TOOL);
      },
      onDone: function (text) {
        state.busy = false;
        state.activeCtx = null;
        state.lastAnswer = text;
        state.lastExchangeAt = Date.now();
        sendAnswer(text);
      },
      onError: function (message) {
        state.busy = false;
        state.activeCtx = null;
        sendStatus(ST.ERROR);
        sendAnswer(message);
      }
    });
  });
}

function briefingPrompt() {
  var ja = settings.get('lang') === 'ja';
  if (calendar.isConfigured()) {
    return ja
      ? '今日のまとめをお願いします。今の天気と今日の予想、Google カレンダーの今日の予定（ウォッチのタイマー等もあれば一緒に）、そして注目のニュースを1つ。それぞれ1文ずつ、合計3文以内で。'
      : 'Give me my daily briefing: the current weather and today outlook, today\'s Google Calendar events (plus anything on my watch schedule), and one notable news item. One sentence each, three sentences total.';
  }
  return ja
    ? '今日のまとめをお願いします。今の天気と今日の予想、ウォッチに入っている予定、そして注目のニュースを1つ。それぞれ1文ずつ、合計3文以内で。'
    : 'Give me my daily briefing: the current weather and today outlook, what is on my watch schedule, and one notable news item. One sentence each, three sentences total.';
}

// ------------------------------------------------------------------ pinning

function pinLastAnswer(title) {
  if (!state.lastAnswer) {
    sendStatus(ST.PIN_FAIL);
    return;
  }
  sendStatus(ST.PINNING);
  var pin = timeline.buildPin(timeline.newId('ans'), new Date(),
                              title || 'AI Companion', state.lastAnswer, 0);
  timeline.putPin(pin, function (ok, error) {
    if (!ok) {
      console.log('pin failed: ' + error);
    }
    sendStatus(ok ? ST.PINNED : ST.PIN_FAIL);
  });
}

// ------------------------------------------------------------------- events

Pebble.addEventListener('ready', function () {
  console.log('AI Companion PebbleKit JS ready');
  settings.repair();
  sendReady();
});

Pebble.addEventListener('appmessage', function (e) {
  var payload = e.payload || {};
  var cmd = payload.REQ_CMD;
  var text = payload.REQ_TEXT || '';

  switch (cmd) {
    case CMD.ASK:
      if (text) {
        runAsk(text);
      }
      break;
    case CMD.BRIEF:
      runAsk(briefingPrompt());
      break;
    case CMD.PIN:
      pinLastAnswer(text);
      break;
    case CMD.SYNC:
      state.schedule = text;
      break;
    case CMD.ABORT:
      dropConfirm();
      provider.abort();
      state.busy = false;
      break;
    case CMD.CONFIRM:
      settleConfirm(payload.REQ_ARG === 1);
      break;
    default:
      break;
  }
});

Pebble.addEventListener('showConfiguration', function () {
  Pebble.openURL(configPage.dataUrl());
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response) {
    return;
  }
  var incoming;
  try {
    incoming = JSON.parse(decodeURIComponent(e.response));
  } catch (err) {
    console.log('could not parse settings: ' + err);
    return;
  }
  if (incoming.forget === 'true') {
    settings.forgetAll();
  }
  settings.save(incoming);
  // A different provider, model or persona invalidates the running conversation.
  provider.resetSession();
  sendReady();
});
