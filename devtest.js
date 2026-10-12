// Local harness: runs the PebbleKit JS bundle under Node with stubbed
// localStorage / XMLHttpRequest / Pebble, and drives one ask through each
// provider's tool loop against canned API responses.
//
// Not shipped to the watch. Run with: node devtest.js

var assert = require('assert');

// ---------------------------------------------------------------- stubs

var store = {};
global.localStorage = {
  getItem: function (k) { return store.hasOwnProperty(k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};

global.navigator = { geolocation: null };

var requests = [];        // every request the bundle made
var responses = [];       // scripted replies, shifted in order

global.XMLHttpRequest = function () {
  var self = this;
  this.headers = {};
  this.open = function (method, url) { self.method = method; self.url = url; };
  this.setRequestHeader = function (k, v) { self.headers[k] = v; };
  this.abort = function () {};
  this.send = function (body) {
    requests.push({ url: self.url, headers: self.headers, body: JSON.parse(body) });
    var next = responses.shift();
    if (!next) {
      throw new Error('no scripted response left for ' + self.url);
    }
    self.status = next.status || 200;
    self.responseText = JSON.stringify(next.body);
    setImmediate(function () { self.onload(); });
  };
};

var sent = [];            // AppMessages pushed to the watch
var listeners = {};

global.Pebble = {
  addEventListener: function (name, fn) {
    listeners[name] = (listeners[name] || []).concat(fn);
  },
  sendAppMessage: function (dict, ok) { sent.push(dict); if (ok) { ok(); } },
  getTimelineToken: function (ok, fail) { fail('no token in harness'); },
  openURL: function (url) { sent.push({ openURL: url }); }
};

function emit(name, event) {
  (listeners[name] || []).forEach(function (fn) { fn(event); });
}

// ---------------------------------------------------------------- helpers

var settings = require('./src/pkjs/settings');
var catalog = require('./src/pkjs/providers/catalog');
require('./src/pkjs/index');

function reset(providerId) {
  store = {};
  store.provider = providerId;
  store[settings.scopedKey('api_key', providerId)] = 'test-key';
  store.lang = 'en';
  requests = [];
  sent = [];
  responses = [];
  emit('ready');
  // Start each case with an empty schedule, the way a fresh watch syncs one.
  emit('appmessage', { payload: { REQ_CMD: 4, REQ_TEXT: '' } });
  sent = [];
}

function answerText() {
  return sent.filter(function (d) { return d.RES_TEXT !== undefined; })
             .map(function (d) { return d.RES_TEXT; }).join('');
}

function actions() {
  return sent.filter(function (d) { return d.ACT_KIND !== undefined; });
}

function ask(question) {
  emit('appmessage', { payload: { REQ_CMD: 1, REQ_TEXT: question } });
}

function settle(fn) {
  // The tool loop chains several async hops; give them all a chance to run.
  setTimeout(fn, 50);
}

function done(label) {
  console.log('  ok ' + label);
}

// ---------------------------------------------------------------- anthropic

function testAnthropic(next) {
  console.log('anthropic');
  reset('anthropic');

  responses.push({ body: {
    stop_reason: 'tool_use',
    content: [
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
      { type: 'tool_use', id: 'tu1', name: 'set_timer', input: { minutes: 10, label: 'Pasta' } }
    ]
  }});
  responses.push({ body: {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Timer set for 10 minutes.' }]
  }});

  ask('set a 10 minute pasta timer');

  settle(function () {
    var first = requests[0];
    assert.strictEqual(first.url, catalog.byId('anthropic').defaultBaseUrl);
    assert.strictEqual(first.headers['x-api-key'], 'test-key');
    assert.strictEqual(first.headers['anthropic-version'], '2023-06-01');
    assert.ok(first.body.system.indexOf('Pebble smartwatch') > -1, 'system prompt present');
    assert.ok(first.body.tools.some(function (t) { return t.name === 'set_timer' && t.input_schema; }),
              'custom tools use input_schema');
    assert.ok(first.body.tools.some(function (t) { return t.type === 'web_search_20260209'; }),
              'server web_search declared');
    assert.strictEqual(first.body.output_config.effort, 'low', 'effort sent as output_config.effort');
    done('request shape');

    var followUp = requests[1];
    var toolResult = followUp.body.messages[followUp.body.messages.length - 1];
    assert.strictEqual(toolResult.role, 'user');
    assert.strictEqual(toolResult.content[0].type, 'tool_result');
    assert.strictEqual(toolResult.content[0].tool_use_id, 'tu1');
    done('tool_result round trip');

    assert.strictEqual(actions().length, 1);
    assert.strictEqual(actions()[0].ACT_KIND, 1);      // ACT.TIMER
    assert.strictEqual(actions()[0].ACT_TEXT, 'Pasta');
    done('timer pushed to the watch');

    assert.strictEqual(answerText(), 'Timer set for 10 minutes.');
    assert.ok(sent.some(function (d) { return d.RES_STATUS === 2; }), 'searching status sent');
    done('answer delivered');
    next();
  });
}

// ------------------------------------------------------------------ openai

function testOpenAI(next) {
  console.log('openai');
  reset('openai');

  responses.push({ body: {
    output: [
      { type: 'web_search_call', id: 'ws1', status: 'completed' },
      { type: 'function_call', id: 'fc1', call_id: 'call_1', name: 'set_timer',
        arguments: '{"minutes":10,"label":"Pasta"}' }
    ]
  }});
  responses.push({ body: {
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Timer set.' }] }]
  }});

  ask('set a 10 minute pasta timer');

  settle(function () {
    var first = requests[0];
    assert.strictEqual(first.url, catalog.byId('openai').defaultBaseUrl);
    assert.strictEqual(first.headers.Authorization, 'Bearer test-key');
    assert.strictEqual(first.body.input[0].role, 'developer');
    assert.ok(first.body.input[0].content.indexOf('Pebble smartwatch') > -1);
    assert.ok(first.body.tools.some(function (t) {
      return t.type === 'function' && t.name === 'set_timer' && t.parameters;
    }), 'custom tools are flat with parameters');
    assert.ok(first.body.tools.some(function (t) { return t.type === 'web_search'; }));
    assert.strictEqual(first.body.reasoning.effort, 'low', 'effort sent as reasoning.effort');
    assert.ok(first.body.max_output_tokens > 0, 'output cap sent');
    done('request shape');

    var followUp = requests[1];
    var last = followUp.body.input[followUp.body.input.length - 1];
    assert.strictEqual(last.type, 'function_call_output');
    assert.strictEqual(last.call_id, 'call_1');
    // The model's own items have to be echoed back, not just the result.
    assert.ok(followUp.body.input.some(function (i) { return i.type === 'function_call'; }),
              'model output echoed');
    done('function_call_output round trip');

    assert.strictEqual(actions()[0].ACT_KIND, 1);
    assert.strictEqual(answerText(), 'Timer set.');
    done('answer delivered');
    next();
  });
}

// ------------------------------------------------------------------ gemini

function testGemini(next) {
  console.log('gemini');
  reset('gemini');

  responses.push({ body: {
    id: 'interaction_1',
    steps: [
      { type: 'google_search_call', id: 'gs1' },
      { type: 'function_call', id: 'call_a', name: 'set_timer',
        arguments: { minutes: 10, label: 'Pasta' } }
    ]
  }});
  responses.push({ body: {
    id: 'interaction_2',
    steps: [
      { type: 'thought', content: [{ type: 'text', text: 'internal reasoning' }] },
      { type: 'model_output', content: [{ type: 'text', text: 'Timer set.' }] }
    ]
  }});

  ask('set a 10 minute pasta timer');

  settle(function () {
    var first = requests[0];
    assert.strictEqual(first.url, catalog.byId('gemini').defaultBaseUrl);
    assert.strictEqual(first.headers['x-goog-api-key'], 'test-key');
    assert.ok(first.body.system_instruction.indexOf('Pebble smartwatch') > -1);
    assert.ok(first.body.tools.some(function (t) { return t.type === 'google_search'; }));
    assert.ok(first.body.tools.some(function (t) {
      return t.type === 'function' && t.name === 'set_timer' && t.parameters;
    }));
    assert.strictEqual(first.body.generation_config.thinking_level, 'low',
                       'effort sent as generation_config.thinking_level');
    done('request shape');

    var followUp = requests[1];
    assert.strictEqual(followUp.body.previous_interaction_id, 'interaction_1');
    assert.strictEqual(followUp.body.input[0].type, 'function_result');
    assert.strictEqual(followUp.body.input[0].call_id, 'call_a');
    assert.strictEqual(followUp.body.input[0].result[0].type, 'text');
    assert.ok(!followUp.body.system_instruction, 'instruction not resent down the chain');
    done('function_result round trip');

    assert.strictEqual(actions()[0].ACT_KIND, 1);
    // The thought step must not leak into the answer.
    assert.strictEqual(answerText(), 'Timer set.');
    done('answer delivered');
    next();
  });
}

// ------------------------------------------------------- errors and config

function testErrorAndSearchOff(next) {
  console.log('errors and search toggle');
  reset('anthropic');
  store.web_search = 'false';

  responses.push({ status: 401, body: { error: { message: 'invalid x-api-key' } } });
  ask('hello');

  settle(function () {
    assert.ok(!requests[0].body.tools.some(function (t) { return t.type && t.type.indexOf('web_search') === 0; }),
              'search tool omitted when disabled');
    assert.ok(requests[0].body.system.indexOf('no web search') > -1,
              'prompt tells the model search is unavailable');
    done('search can be turned off');

    assert.ok(sent.some(function (d) { return d.RES_STATUS === 4; }), 'error status sent');
    // The label tells the user on the watch which provider actually ran.
    assert.strictEqual(answerText(), 'Anthropic Claude: invalid x-api-key');
    done('API error surfaced to the watch, named by provider');
    next();
  });
}

// A key pasted on a phone keyboard often arrives with stray whitespace. Left
// in, the newline makes setRequestHeader drop the header and the server
// reports a missing credential.
function testKeyHygiene(next) {
  console.log('credential hygiene');
  reset('anthropic');
  settings.save({ api_key_anthropic: '  sk-ant-pasted\n' });
  assert.strictEqual(settings.apiKey(), 'sk-ant-pasted');
  done('whitespace is trimmed on save');

  // And a value stored by an older build is cleaned on the way out.
  store[settings.scopedKey('api_key', 'anthropic')] = 'sk-ant-legacy\n';
  assert.strictEqual(settings.apiKey(), 'sk-ant-legacy');
  done('a dirty stored value is trimmed on read');

  responses.push({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] } });
  ask('hello');
  settle(function () {
    assert.strictEqual(requests[0].headers['x-api-key'], 'sk-ant-legacy',
                       'the header carries the clean key');
    done('header is sent with a clean value');
    next();
  });
}

// A tool call that changes the schedule has to be visible to the next tool
// call in the same turn, before the watch has echoed anything back.
function testScheduleMirror(next) {
  console.log('schedule mirror');
  reset('anthropic');

  responses.push({ body: {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tu1', name: 'set_timer',
                input: { minutes: 10, label: 'Pasta' } }]
  }});
  responses.push({ body: {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tu2', name: 'list_schedule', input: {} }]
  }});
  responses.push({ body: {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Nine minutes left.' }]
  }});

  ask('set a pasta timer, then tell me what is scheduled');

  settle(function () {
    var listing = requests[2].body.messages
      .filter(function (m) { return m.role === 'user' && m.content[0] &&
                                    m.content[0].tool_use_id === 'tu2'; })[0];
    assert.ok(listing, 'list_schedule result present');
    assert.ok(listing.content[0].content.indexOf('timer') > -1,
              'the timer just created shows up: ' + listing.content[0].content);
    assert.ok(listing.content[0].content.indexOf('Pasta') > -1);
    done('a new timer is visible to list_schedule right away');

    // And cancelling clears it again.
    responses.push({ body: {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu3', name: 'cancel_schedule',
                  input: { match: '*' } }]
    }});
    responses.push({ body: {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu4', name: 'list_schedule', input: {} }]
    }});
    responses.push({ body: {
      stop_reason: 'end_turn', content: [{ type: 'text', text: 'All clear.' }]
    }});
    requests = [];
    ask('cancel everything, then tell me what is left');

    settle(function () {
      var after = requests[2].body.messages
        .filter(function (m) { return m.role === 'user' && m.content[0] &&
                                      m.content[0].tool_use_id === 'tu4'; })[0];
      assert.ok(after.content[0].content.indexOf('no timers') > -1,
                'cancel clears the mirror: ' + after.content[0].content);
      done('cancel is reflected right away');
      next();
    });
  });
}

// Saving must not freeze today's defaults into storage, or a later change to
// the catalog would never reach an existing install.
function testDefaultsStayLive(next) {
  console.log('provider defaults');
  store = {};
  var page = require('./src/pkjs/config_page');
  var payload = page ? settings.all() : {};
  payload.provider = 'openai';
  settings.save(payload);

  assert.strictEqual(store[settings.scopedKey('model', 'openai')], undefined,
                     'default model is not written to storage');
  assert.strictEqual(store[settings.scopedKey('base_url', 'gemini')], undefined,
                     'default endpoint is not written to storage');
  assert.strictEqual(settings.model(), catalog.byId('openai').defaultModel);
  done('defaults keep coming from the catalog after a save');

  // An explicit override is still kept.
  payload[settings.scopedKey('model', 'openai')] = 'gpt-custom';
  settings.save(payload);
  assert.strictEqual(settings.model(), 'gpt-custom');
  done('an explicit model override survives');

  // Switching provider swaps key, model and endpoint together.
  store = { provider: 'anthropic' };
  var anthropic = { key: settings.apiKey(), model: settings.model(), url: settings.baseUrl() };
  store.provider = 'gemini';
  var gemini = { key: settings.apiKey(), model: settings.model(), url: settings.baseUrl() };
  assert.notStrictEqual(anthropic.model, gemini.model);
  assert.notStrictEqual(anthropic.url, gemini.url);
  assert.strictEqual(gemini.model, catalog.byId('gemini').defaultModel);
  assert.strictEqual(gemini.url, catalog.byId('gemini').defaultBaseUrl);
  done('switching provider swaps model and endpoint');
  next();
}

// The bug this guards: a save made while the dropdown said one provider and
// the fields still showed another's left Gemini pointing at Anthropic's
// endpoint, so the request went to the wrong API with no usable credential.
function testEndpointFollowsProvider(next) {
  console.log('endpoint follows provider');

  store = {
    provider: 'gemini',
    api_key_gemini: 'AIza-test',
    base_url_gemini: catalog.byId('anthropic').defaultBaseUrl,   // the corruption
    model_gemini: catalog.byId('anthropic').defaultModel
  };
  settings.repair();

  assert.strictEqual(settings.baseUrl(), catalog.byId('gemini').defaultBaseUrl,
                     'a foreign endpoint is dropped and the default returns');
  assert.strictEqual(settings.model(), catalog.byId('gemini').defaultModel);
  done('an install already holding the wrong endpoint repairs itself');

  // A real override must survive the repair.
  store.base_url_gemini = 'https://my-gateway.example/v1beta/interactions';
  settings.repair();
  assert.strictEqual(settings.baseUrl(), 'https://my-gateway.example/v1beta/interactions');
  done('a genuine override is left alone');

  // And the page no longer hands back defaults as if they were typed.
  store = { provider: 'gemini' };
  var values = settings.all();
  assert.strictEqual(values[settings.scopedKey('base_url', 'gemini')], '',
                     'endpoint comes back empty when not overridden');
  assert.strictEqual(values[settings.scopedKey('model', 'anthropic')], '');
  done('defaults are placeholders, not values');

  // Saving that page state stores no endpoint at all, so it keeps following.
  settings.save(values);
  assert.strictEqual(store.base_url_gemini, undefined);
  assert.strictEqual(settings.baseUrl(), catalog.byId('gemini').defaultBaseUrl);
  done('saving does not freeze the endpoint');
  next();
}

function testConfigPage() {
  console.log('config page');
  var page = require('./src/pkjs/config_page');
  for (var i = 0; i < catalog.ALL.length; i++) {
    store = { provider: catalog.ALL[i].id };
    var html = page.html(settings.all());
    assert.ok(html.indexOf('id="provider"') > -1);
    assert.ok(html.indexOf(catalog.ALL[i].defaultModel) > -1,
              catalog.ALL[i].id + ' default model offered');
  }
  store = {};
  var url = page.dataUrl();
  assert.ok(url.indexOf('data:text/html;charset=utf-8,') === 0);
  assert.ok(url.length < 60000, 'data URL stays a sane length (' + url.length + ')');
  done('renders for every provider, data URL ' + url.length + ' chars');
}

// ---------------------------------------------------------------- calendar

var BRIDGE = 'https://script.google.com/macros/s/test/exec';

function lastToolResult(request) {
  var msgs = request.body.messages;
  return msgs[msgs.length - 1].content[0].content;
}

function bridgeRequests() {
  return requests.filter(function (r) { return r.url === BRIDGE; });
}

function testCalendar(next) {
  console.log('google calendar');

  // Not connected: the model is not even offered the tools.
  reset('anthropic');
  responses.push({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hi.' }] } });
  ask('hello');

  settle(function () {
    assert.ok(!requests[0].body.tools.some(function (t) { return t.name && t.name.indexOf('calendar_') === 0; }),
              'calendar tools hidden without a bridge');
    assert.ok(requests[0].body.system.indexOf('Google Calendar') === -1);
    done('tools hidden until the bridge is set up');

    reset('anthropic');
    store.cal_url = BRIDGE;
    store.cal_secret = 's3cret';
    var start = new Date(2026, 9, 13, 15, 0).getTime();

    responses.push({ body: { stop_reason: 'tool_use', content: [
      { type: 'tool_use', id: 'tl', name: 'calendar_list_events', input: { from: '2026-10-13' } }
    ]}});
    responses.push({ body: { ok: true, truncated: false, events: [
      { ref: 'me@x|ev1|' + start, title: 'Dentist', calendar: 'Me', allDay: false,
        recurring: false, location: '', start: start, end: start + 3600000 }
    ]}});
    responses.push({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Dentist at 15:00.' }] } });
    ask('what is on tomorrow');

    settle(function () {
      assert.ok(requests[0].body.tools.some(function (t) { return t.name === 'calendar_list_events'; }));
      assert.ok(requests[0].body.system.indexOf('Google Calendar is connected') > -1);
      var listed = bridgeRequests()[0];
      assert.strictEqual(listed.body.secret, 's3cret');
      assert.strictEqual(listed.body.op, 'list');
      assert.strictEqual(listed.body.from, new Date(2026, 9, 13).getTime());
      assert.strictEqual(listed.body.to, new Date(2026, 9, 14).getTime(), 'a bare date covers the whole day');
      done('list goes to the bridge with the secret and a whole-day range');

      var result = lastToolResult(requests[2]);
      var id = /^(e\d+): 2026-10-13 15:00-16:00 Dentist \[Me\]$/.exec(result);
      assert.ok(id, 'listing uses short ids and local times: ' + result);
      assert.ok(result.indexOf('ev1') === -1, 'bridge refs stay on the phone');
      done('model sees short ids, not refs');

      // Delete, declined on the watch: nothing reaches the bridge.
      sent = [];
      requests = [];
      responses.push({ body: { stop_reason: 'tool_use', content: [
        { type: 'tool_use', id: 'td', name: 'calendar_delete_event', input: { id: id[1] } }
      ]}});
      responses.push({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Kept it.' }] } });
      ask('delete the dentist');

      settle(function () {
        var confirm = sent.filter(function (d) { return d.CONFIRM_TEXT !== undefined; });
        assert.strictEqual(confirm.length, 1, 'watch asked to confirm');
        assert.ok(confirm[0].CONFIRM_TEXT.indexOf('Dentist') > -1);
        assert.strictEqual(requests.length, 1, 'tool loop waits for the answer');
        emit('appmessage', { payload: { REQ_CMD: 6, REQ_ARG: 0 } });

        settle(function () {
          assert.strictEqual(bridgeRequests().length, 0, 'declined delete never reaches the bridge');
          assert.ok(lastToolResult(requests[1]).indexOf('declined') > -1);
          done('declining on the watch cancels the delete');

          // Delete, approved.
          sent = [];
          requests = [];
          responses.push({ body: { stop_reason: 'tool_use', content: [
            { type: 'tool_use', id: 'td2', name: 'calendar_delete_event', input: { id: id[1] } }
          ]}});
          responses.push({ body: { ok: true, event: { title: 'Dentist' } } });
          responses.push({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Deleted.' }] } });
          ask('yes really delete it');

          settle(function () {
            emit('appmessage', { payload: { REQ_CMD: 6, REQ_ARG: 1 } });
            settle(function () {
              var del = bridgeRequests()[0];
              assert.strictEqual(del.body.op, 'delete');
              assert.strictEqual(del.body.ref, 'me@x|ev1|' + start);
              assert.ok(lastToolResult(requests[2]).indexOf('Deleted: 2026-10-13 15:00-16:00 Dentist') === 0);
              assert.strictEqual(answerText(), 'Deleted.');
              done('approving on the watch deletes by ref');

              // Unknown ids are refused without a round trip.
              requests = [];
              responses.push({ body: { stop_reason: 'tool_use', content: [
                { type: 'tool_use', id: 'tx', name: 'calendar_update_event', input: { id: 'e999', title: 'x' } }
              ]}});
              responses.push({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: '?' }] } });
              ask('rename it');
              settle(function () {
                assert.strictEqual(bridgeRequests().length, 0);
                assert.ok(lastToolResult(requests[1]).indexOf('unknown event id') > -1);
                done('an invented id is refused');

                // Create: timed event, local time to epoch ms, default length left to the bridge.
                requests = [];
                responses.push({ body: { stop_reason: 'tool_use', content: [
                  { type: 'tool_use', id: 'tc', name: 'calendar_create_event',
                    input: { title: 'Lunch', start: '2026-10-14T12:30' } }
                ]}});
                responses.push({ body: { ok: true, event: {
                  ref: 'me@x|ev2|1', title: 'Lunch', calendar: 'Me', allDay: false, recurring: false,
                  location: '', start: new Date(2026, 9, 14, 12, 30).getTime(),
                  end: new Date(2026, 9, 14, 13, 30).getTime() } } });
                responses.push({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Added.' }] } });
                ask('lunch tomorrow 12:30');
                settle(function () {
                  var made = bridgeRequests()[0].body;
                  assert.strictEqual(made.op, 'create');
                  assert.strictEqual(made.start, new Date(2026, 9, 14, 12, 30).getTime());
                  assert.ok(!made.hasOwnProperty('end'), 'no end sent when the model gave none');
                  assert.ok(lastToolResult(requests[2]).indexOf('Added to Google Calendar') === 0);
                  done('create sends epoch ms and confirms back');

                  // All-day create carries the date string, not a timestamp.
                  requests = [];
                  responses.push({ body: { stop_reason: 'tool_use', content: [
                    { type: 'tool_use', id: 'ta', name: 'calendar_create_event',
                      input: { title: 'Trip', start: '2026-10-20', end: '2026-10-22' } }
                  ]}});
                  responses.push({ body: { ok: true, event: {
                    ref: 'me@x|ev3|2', title: 'Trip', calendar: 'Me', allDay: true, recurring: false,
                    location: '', date: '2026-10-20', endDate: '2026-10-22' } } });
                  responses.push({ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Added.' }] } });
                  ask('trip from the 20th to the 22nd');
                  settle(function () {
                    var allDay = bridgeRequests()[0].body;
                    assert.strictEqual(allDay.allDay, true);
                    assert.strictEqual(allDay.date, '2026-10-20');
                    assert.strictEqual(allDay.endDate, '2026-10-22');
                    assert.ok(!allDay.hasOwnProperty('start'));
                    done('all-day create sends dates');
                    next();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

// ------------------------------------------------------------------- sound

function testSoundSetting(next) {
  console.log('sound setting');
  reset('anthropic');
  emit('ready');
  assert.strictEqual(sent[sent.length - 1].CFG_SOUND, 1, 'sound is on by default');
  done('on by default');

  var page = require('./src/pkjs/config_page').html(settings.all());
  assert.ok(page.indexOf('id="sound" checked') > -1, 'checkbox starts ticked');

  sent = [];
  emit('webviewclosed', { response: encodeURIComponent(JSON.stringify({ sound: 'false' })) });
  assert.strictEqual(store.sound, 'false');
  assert.strictEqual(sent[sent.length - 1].CFG_SOUND, 0, 'watch told to go quiet');
  page = require('./src/pkjs/config_page').html(settings.all());
  assert.ok(page.indexOf('id="sound">') > -1, 'checkbox renders unticked');
  done('turning it off is saved and sent to the watch');
  next();
}

// ----------------------------------------------------------------- runner

// Each case is async, so run them as a chain rather than nesting by hand.
var CASES = [
  testAnthropic,
  testOpenAI,
  testGemini,
  testErrorAndSearchOff,
  testKeyHygiene,
  testScheduleMirror,
  testDefaultsStayLive,
  testEndpointFollowsProvider,
  testCalendar,
  testSoundSetting
];

(function runNext(i) {
  if (i >= CASES.length) {
    testConfigPage();
    console.log('\nall checks passed');
    return;
  }
  CASES[i](function () { runNext(i + 1); });
}(0));
