// Live smoke test against a real provider. Unlike devtest.js this spends money
// and needs network, so it is never part of the normal loop.
//
//   PROVIDER=gemini API_KEY=... node livetest.js
//   PROVIDER=gemini API_KEY=... node livetest.js --verbose   (dump raw HTTP)
//
// The key is read from the environment and never written to disk.

var PROVIDER = process.env.PROVIDER || 'gemini';
var API_KEY = process.env.API_KEY || '';
var VERBOSE = process.argv.indexOf('--verbose') > -1;

if (!API_KEY) {
  console.error('set API_KEY in the environment');
  process.exit(1);
}

// ---------------------------------------------------------------- stubs

var store = {};
global.localStorage = {
  getItem: function (k) { return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
global.navigator = { geolocation: null };

// Minimal XMLHttpRequest over fetch: only the surface src/pkjs/http.js uses.
global.XMLHttpRequest = function () {
  var self = this;
  var headers = {};
  this.open = function (method, url) { self.method = method; self.url = url; };
  this.setRequestHeader = function (k, v) { headers[k] = v; };
  this.abort = function () { if (self.controller) { self.controller.abort(); } };
  this.send = function (body) {
    self.controller = new AbortController();
    var timer = setTimeout(function () {
      self.controller.abort();
      if (self.ontimeout) { self.ontimeout(); }
    }, self.timeout || 60000);

    if (VERBOSE) {
      console.log('\n--> ' + self.method + ' ' + self.url);
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    }

    fetch(self.url, {
      method: self.method,
      headers: headers,
      body: body,
      signal: self.controller.signal
    }).then(function (res) {
      return res.text().then(function (text) { return { res: res, text: text }; });
    }).then(function (r) {
      clearTimeout(timer);
      self.status = r.res.status;
      self.responseText = r.text;
      if (VERBOSE) {
        console.log('\n<-- ' + r.res.status);
        try {
          console.log(JSON.stringify(JSON.parse(r.text), null, 2));
        } catch (e) {
          console.log(r.text);
        }
      }
      if (self.onload) { self.onload(); }
    }).catch(function (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') { return; }
      console.log('fetch failed: ' + e.message);
      if (self.onerror) { self.onerror(e); }
    });
  };
};

var sent = [];
var listeners = {};
global.Pebble = {
  addEventListener: function (name, fn) {
    listeners[name] = (listeners[name] || []).concat(fn);
  },
  sendAppMessage: function (dict, ok) { sent.push(dict); if (ok) { ok(); } },
  getTimelineToken: function (ok, fail) { fail('no timeline token in harness'); },
  openURL: function () {}
};

function emit(name, event) {
  (listeners[name] || []).forEach(function (fn) { fn(event); });
}

// ---------------------------------------------------------------- harness

var settings = require('./src/pkjs/settings');
require('./src/pkjs/index');

store.provider = PROVIDER;
store[settings.scopedKey('api_key', PROVIDER)] = API_KEY;
store.lang = 'ja';
if (process.env.MODEL) {
  store[settings.scopedKey('model', PROVIDER)] = process.env.MODEL;
}

emit('ready');

var STATUS_NAMES = { 1: 'thinking', 2: 'searching', 3: 'tool', 4: 'error' };

function run(question, onDone) {
  sent = [];
  console.log('\n=== ' + question);
  emit('appmessage', { payload: { REQ_CMD: 1, REQ_TEXT: question } });

  var waited = 0;
  var timer = setInterval(function () {
    waited += 500;
    var finished = sent.some(function (d) { return d.RES_MORE === 0; });
    if (!finished && waited < 90000) {
      return;
    }
    clearInterval(timer);

    sent.filter(function (d) { return d.RES_STATUS !== undefined; })
        .forEach(function (d) {
          console.log('  status: ' + (STATUS_NAMES[d.RES_STATUS] || d.RES_STATUS));
        });
    sent.filter(function (d) { return d.ACT_KIND !== undefined; })
        .forEach(function (d) {
          console.log('  action: kind=' + d.ACT_KIND + ' at=' +
                      new Date(d.ACT_TIME * 1000).toISOString() +
                      ' label="' + d.ACT_TEXT + '"');
        });
    var answer = sent.filter(function (d) { return d.RES_TEXT !== undefined; })
                     .map(function (d) { return d.RES_TEXT; }).join('');
    console.log('  answer (' + answer.length + ' chars): ' + answer);
    console.log('  took ' + (waited / 1000) + 's');
    onDone();
  }, 500);
}

var QUESTIONS = process.argv.slice(2).filter(function (a) { return a.indexOf('--') !== 0; });
if (QUESTIONS.length === 0) {
  QUESTIONS = [
    '今日の東京の天気は?',
    'パスタのタイマーを10分でセットして',
    'さっきのタイマー、あと何分だっけ?'
  ];
}

(function nextQuestion(i) {
  if (i >= QUESTIONS.length) {
    console.log('\ndone');
    process.exit(0);
  }
  run(QUESTIONS[i], function () { nextQuestion(i + 1); });
}(0));
