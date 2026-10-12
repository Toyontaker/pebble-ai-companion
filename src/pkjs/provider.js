// Provider registry. Only one provider is active at a time; the settings pick
// which one, and each module owns its own request shape, tool loop and
// conversation state.

var http = require('./http');
var settings = require('./settings');
var catalog = require('./providers/catalog');

var REGISTRY = [
  require('./providers/anthropic'),
  require('./providers/openai'),
  require('./providers/gemini')
];

function byId(id) {
  for (var i = 0; i < REGISTRY.length; i++) {
    if (REGISTRY[i].id === id) {
      return REGISTRY[i];
    }
  }
  return REGISTRY[0];
}

function current() {
  return byId(settings.providerId());
}

// ctx: { schedule, coords, emitAction }
// cb:  { onStatus(name), onDone(text), onError(message) }
function ask(question, ctx, cb) {
  var meta = catalog.byId(settings.providerId());
  var key = settings.apiKey();

  console.log('provider=' + meta.id + ' model=' + settings.model() +
              ' endpoint=' + settings.baseUrl() + ' keyLength=' + key.length);

  if (!key) {
    cb.onError('No API key for ' + meta.label + '. Open the app settings in the Pebble phone app.');
    return;
  }

  // Naming the provider in the error is what tells the user, on the watch,
  // which one the app actually ran — the usual cause of a credential error is
  // that it is not the one they meant.
  var labelled = {
    onStatus: cb.onStatus,
    onDone: cb.onDone,
    onError: function (message) { cb.onError(meta.label + ': ' + message); }
  };

  ctx.searchAvailable = meta.supportsSearch && settings.getBool('web_search');
  current().ask(question, ctx, labelled);
}

function resetSession() {
  for (var i = 0; i < REGISTRY.length; i++) {
    REGISTRY[i].resetSession();
  }
}

function abort() {
  http.abort();
}

module.exports = {
  byId: byId,
  current: current,
  ask: ask,
  abort: abort,
  resetSession: resetSession
};
