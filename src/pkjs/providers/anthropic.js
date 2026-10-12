// Anthropic Messages API.

var http = require('../http');
var settings = require('../settings');
var tools = require('../tools');
var prompt = require('../prompt');

var MAX_TOOL_ITERATIONS = 4;
var MAX_TOKENS = 2000;

var session = [];   // conversation history as Messages API messages

// Dynamic-filtering web search needs a recent model; older ones take the
// original tool type.
function webSearchType(model) {
  var modern = ['claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7',
                'claude-opus-4-6', 'claude-sonnet-5', 'claude-sonnet-4-6',
                'claude-fable-5'];
  for (var i = 0; i < modern.length; i++) {
    if (model.indexOf(modern[i]) === 0) {
      return 'web_search_20260209';
    }
  }
  return 'web_search_20250305';
}

// effort lives in output_config and is rejected by the 4.5-era models.
function supportsEffort(model) {
  return model.indexOf('haiku') === -1 && model.indexOf('-4-5') === -1;
}

function collectText(content) {
  var text = '';
  for (var i = 0; i < content.length; i++) {
    if (content[i].type === 'text' && content[i].text) {
      text += content[i].text;
    }
  }
  return text.replace(/\s+$/, '');
}

function collectToolUses(content) {
  var uses = [];
  for (var i = 0; i < content.length; i++) {
    if (content[i].type === 'tool_use') {
      uses.push(content[i]);
    }
  }
  return uses;
}

function usedServerTool(content) {
  for (var i = 0; i < content.length; i++) {
    if (content[i].type === 'server_tool_use') {
      return true;
    }
  }
  return false;
}

// Runs the tool_use blocks one at a time and hands back all tool_result blocks
// as a single user message, which is what the API expects.
function runTools(uses, ctx, done) {
  var results = [];
  var index = 0;

  function next() {
    if (index >= uses.length) {
      done(results);
      return;
    }
    var use = uses[index++];
    tools.execute(use.name, use.input, ctx, function (resultText) {
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: String(resultText)
      });
      next();
    });
  }

  next();
}

function ask(question, ctx, cb) {
  var model = settings.model();
  var systemPrompt = prompt.build(ctx);
  var iterations = 0;

  var messages = session.slice();
  messages.push({ role: 'user', content: question });

  var toolList = tools.definitions();
  if (ctx.searchAvailable) {
    toolList.push({ type: webSearchType(model), name: 'web_search', max_uses: 4 });
  }

  function step() {
    iterations++;

    var body = {
      model: model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: messages,
      tools: toolList
    };
    if (supportsEffort(model)) {
      body.output_config = { effort: settings.get('effort') };
    }

    http.postJson(settings.baseUrl(), {
      'x-api-key': settings.apiKey(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    }, body, function (data) {
      var content = data.content || [];

      if (data.stop_reason === 'refusal') {
        cb.onError('The request was declined.');
        return;
      }

      if (usedServerTool(content)) {
        cb.onStatus('searching');
      }

      // pause_turn means a server tool is mid-flight; echo the turn back to
      // let it continue.
      if (data.stop_reason === 'pause_turn' && iterations < MAX_TOOL_ITERATIONS) {
        messages.push({ role: 'assistant', content: content });
        step();
        return;
      }

      var uses = collectToolUses(content);
      if (uses.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
        cb.onStatus('tool');
        messages.push({ role: 'assistant', content: content });
        runTools(uses, ctx, function (results) {
          messages.push({ role: 'user', content: results });
          step();
        });
        return;
      }

      var text = collectText(content);
      messages.push({ role: 'assistant', content: text || '...' });
      session = messages.slice(-16);
      cb.onDone(text || 'No answer came back.');
    }, cb.onError);
  }

  step();
}

function resetSession() {
  session = [];
}

module.exports = {
  id: 'anthropic',
  ask: ask,
  resetSession: resetSession
};
