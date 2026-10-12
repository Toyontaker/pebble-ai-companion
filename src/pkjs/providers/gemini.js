// Google Gemini Interactions API (POST /v1beta/interactions).
//
// Gemini keeps the conversation server-side: each response carries an id that
// the next request references through previous_interaction_id, so the tool
// loop and the follow-up turns both ride that chain instead of resending the
// whole history.

var http = require('../http');
var settings = require('../settings');
var tools = require('../tools');
var prompt = require('../prompt');

var MAX_TOOL_ITERATIONS = 4;
var API_REVISION = '2026-05-20';

var lastInteractionId = null;

function stepsOf(data) {
  return data.steps || [];
}

// Text lives in the content blocks of the model's output steps. Reasoning
// steps carry text too, so skip anything that looks like a thought.
function collectText(data) {
  if (typeof data.output_text === 'string' && data.output_text) {
    return data.output_text.replace(/\s+$/, '');
  }
  var steps = stepsOf(data);
  var text = '';
  for (var i = 0; i < steps.length; i++) {
    var type = steps[i].type || '';
    if (type.indexOf('thought') !== -1 || type.indexOf('thinking') !== -1) {
      continue;
    }
    var content = steps[i].content;
    if (!content || !content.length) {
      continue;
    }
    for (var j = 0; j < content.length; j++) {
      if (content[j].text) {
        text += content[j].text;
      }
    }
  }
  return text.replace(/\s+$/, '');
}

function collectFunctionCalls(data) {
  var steps = stepsOf(data);
  var calls = [];
  for (var i = 0; i < steps.length; i++) {
    if (steps[i].type === 'function_call') {
      calls.push(steps[i]);
    }
  }
  return calls;
}

function usedSearch(data) {
  var steps = stepsOf(data);
  for (var i = 0; i < steps.length; i++) {
    if ((steps[i].type || '').indexOf('search') !== -1) {
      return true;
    }
  }
  return false;
}

function runTools(calls, ctx, done) {
  var results = [];
  var index = 0;

  function next() {
    if (index >= calls.length) {
      done(results);
      return;
    }
    var call = calls[index++];
    // Gemini hands back parsed arguments, not a JSON string.
    tools.execute(call.name, call.arguments || {}, ctx, function (resultText) {
      results.push({
        type: 'function_result',
        name: call.name,
        call_id: call.id,
        result: [{ type: 'text', text: String(resultText) }]
      });
      next();
    });
  }

  next();
}

function ask(question, ctx, cb) {
  var iterations = 0;

  var toolList = tools.flatDefinitions();
  if (ctx.searchAvailable) {
    toolList.push({ type: 'google_search' });
  }

  function send(input, previousId, isFirstTurn) {
    iterations++;

    var body = {
      model: settings.model(),
      input: input,
      tools: toolList,
      generation_config: { thinking_level: settings.get('effort') }
    };
    if (previousId) {
      body.previous_interaction_id = previousId;
    }
    // The instruction is inherited down the interaction chain, so it only
    // needs to go out when a fresh chain starts.
    if (isFirstTurn && !previousId) {
      body.system_instruction = prompt.build(ctx);
    }

    http.postJson(settings.baseUrl(), {
      'x-goog-api-key': settings.apiKey(),
      'Api-Revision': API_REVISION
    }, body, function (data) {
      if (data.id) {
        lastInteractionId = data.id;
      }

      if (usedSearch(data)) {
        cb.onStatus('searching');
      }

      var calls = collectFunctionCalls(data);
      if (calls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
        cb.onStatus('tool');
        runTools(calls, ctx, function (results) {
          send(results, data.id, false);
        });
        return;
      }

      var text = collectText(data);
      cb.onDone(text || 'No answer came back.');
    }, cb.onError);
  }

  send(question, lastInteractionId, true);
}

function resetSession() {
  lastInteractionId = null;
}

module.exports = {
  id: 'gemini',
  ask: ask,
  resetSession: resetSession
};
