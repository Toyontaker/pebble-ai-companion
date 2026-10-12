// Settings live in the phone's localStorage and are edited from the Pebble
// app's configuration page. Everything is stored as a string.
//
// API key, model and endpoint are stored per provider, so switching provider
// and switching back does not lose the credentials you already entered.

var catalog = require('./providers/catalog');

var DEFAULTS = {
  provider: 'anthropic',
  effort: 'low',
  lang: 'ja',
  web_search: 'true',
  location: 'true',
  // Speaker cues on watches that have one (Time 2). Stored on the watch too,
  // since alarms fire while the phone is away.
  sound: 'true',
  persona: '',
  // Google Calendar bridge (gas/Code.gs). Both empty means no calendar tools.
  cal_url: '',
  cal_secret: '',
  // Only used when the Pebble app has no local pins (see timeline.js).
  // Rebble users generally need https://timeline-api.rebble.io/v1/user/pins/
  timeline_base: 'https://timeline-api.getpebble.com/v1/user/pins/'
};

var KEYS = Object.keys(DEFAULTS);

// Per-provider keys are suffixed: api_key_openai, model_gemini, and so on.
var PER_PROVIDER_FIELDS = ['api_key', 'model', 'base_url'];

function scopedKey(field, id) {
  return field + '_' + id;
}

// Pasting into a phone keyboard drags in stray whitespace surprisingly often,
// and a key with a newline in it makes setRequestHeader drop the header
// entirely, which reads as "no key sent" at the other end. Trim on the way in
// and on the way out, so values stored by an older build get cleaned too.
function trim(text) {
  return String(text).replace(/^[\s　]+/, '').replace(/[\s　]+$/, '');
}

function raw(key) {
  var v = localStorage.getItem(key);
  return (v === null || v === undefined) ? '' : trim(v);
}

function get(key) {
  var v = raw(key);
  return v === '' ? DEFAULTS[key] : v;
}

function getBool(key) {
  return get(key) === 'true';
}

function providerId() {
  var id = raw('provider');
  return catalog.IDS.indexOf(id) === -1 ? DEFAULTS.provider : id;
}

// --- resolved values for the active provider -------------------------------

function apiKey() {
  return raw(scopedKey('api_key', providerId()));
}

function model() {
  return raw(scopedKey('model', providerId())) || catalog.byId(providerId()).defaultModel;
}

function baseUrl() {
  return raw(scopedKey('base_url', providerId())) || catalog.byId(providerId()).defaultBaseUrl;
}

function isConfigured() {
  return apiKey().length > 0;
}

// --- persistence -----------------------------------------------------------

// Everything the config page needs to render, including the values of the
// providers that are not currently selected. Per-provider values come back
// raw: empty means "no override", and the page shows the catalog default as a
// placeholder. Filling defaults in here is what used to freeze one provider's
// endpoint onto another.
function all() {
  var out = {};
  for (var i = 0; i < KEYS.length; i++) {
    out[KEYS[i]] = get(KEYS[i]);
  }
  out.provider = providerId();

  for (var j = 0; j < catalog.ALL.length; j++) {
    var id = catalog.ALL[j].id;
    for (var k = 0; k < PER_PROVIDER_FIELDS.length; k++) {
      out[scopedKey(PER_PROVIDER_FIELDS[k], id)] = raw(scopedKey(PER_PROVIDER_FIELDS[k], id));
    }
  }
  return out;
}

function put(key, value) {
  var text = (value === null || value === undefined) ? '' : trim(value);
  if (text === '') {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, text);
  }
}

function defaultFor(field, id) {
  var entry = catalog.byId(id);
  if (field === 'model') {
    return entry.defaultModel;
  }
  if (field === 'base_url') {
    return entry.defaultBaseUrl;
  }
  return '';
}

function save(obj) {
  for (var i = 0; i < KEYS.length; i++) {
    if (obj.hasOwnProperty(KEYS[i])) {
      put(KEYS[i], obj[KEYS[i]]);
    }
  }
  for (var j = 0; j < catalog.ALL.length; j++) {
    for (var k = 0; k < PER_PROVIDER_FIELDS.length; k++) {
      var field = PER_PROVIDER_FIELDS[k];
      var key = scopedKey(field, catalog.ALL[j].id);
      if (!obj.hasOwnProperty(key)) {
        continue;
      }
      // The config page shows the default in the box, so a plain save would
      // freeze today's default into storage. Store nothing when the value is
      // still the default, and the catalog keeps deciding.
      var value = obj[key];
      put(key, value === defaultFor(field, catalog.ALL[j].id) ? '' : value);
    }
  }
}

// An earlier build pre-filled the model and endpoint boxes with the defaults
// and wrote them back on save, so a save made while the provider dropdown and
// the fields disagreed could leave one provider holding another's endpoint —
// which then sends the request to the wrong API with the wrong credential.
// A stored value that is some other provider's default was never typed by
// anyone, so drop it and let the catalog decide again.
function repair() {
  for (var i = 0; i < catalog.ALL.length; i++) {
    var id = catalog.ALL[i].id;
    for (var k = 0; k < PER_PROVIDER_FIELDS.length; k++) {
      var field = PER_PROVIDER_FIELDS[k];
      if (field === 'api_key') {
        continue;
      }
      var value = raw(scopedKey(field, id));
      if (!value) {
        continue;
      }
      for (var j = 0; j < catalog.ALL.length; j++) {
        if (catalog.ALL[j].id !== id && value === defaultFor(field, catalog.ALL[j].id)) {
          console.log('dropping ' + scopedKey(field, id) + ': it is ' +
                      catalog.ALL[j].id + "'s default, not a real override");
          localStorage.removeItem(scopedKey(field, id));
          break;
        }
      }
    }
  }
}

// --- long-term memory the AI can add to via the remember_fact tool ---------

function memory() {
  try {
    var stored = localStorage.getItem('memory');
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function remember(fact) {
  var facts = memory();
  if (facts.indexOf(fact) === -1) {
    facts.push(fact);
  }
  while (facts.length > 20) {
    facts.shift();
  }
  localStorage.setItem('memory', JSON.stringify(facts));
  return facts.length;
}

function forgetAll() {
  localStorage.removeItem('memory');
}

module.exports = {
  KEYS: KEYS,
  DEFAULTS: DEFAULTS,
  scopedKey: scopedKey,
  get: get,
  getBool: getBool,
  providerId: providerId,
  apiKey: apiKey,
  model: model,
  baseUrl: baseUrl,
  all: all,
  save: save,
  isConfigured: isConfigured,
  repair: repair,
  memory: memory,
  remember: remember,
  forgetAll: forgetAll
};
