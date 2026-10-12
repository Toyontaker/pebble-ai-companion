// OpenAI Responses API (POST /v1/responses).
//
// The built-in web search tool is declared alongside the custom function tools
// and runs on OpenAI's side; custom calls come back as `function_call` items
// and are answered with `function_call_output` items in the next request.

var http = require('../http');
var settings = require('../settings');
var tools = require('../tools');
var prompt = require('../prompt');

var MAX_TOOL_ITERATIONS = 4;
var MAX_OUTPUT_TOKENS = 4000;

var session = [];   // accumulated input items across turns

function collectText(output) {
  var text = '';
  for (var i = 0; i < output.length; i++) {
    var item = output[i];
    if (item.type !== 'message' || !item.content) {
      continue;
    }
    for (var j = 0; j < item.content.length; j++) {
      if (item.content[j].text) {
        text += item.content[j].text;
      }
    }
  }
  return text.replace(/\s+$/, '');
}

function collectFunctionCalls(output) {
  var calls = [];
  for (var i = 0; i < output.length; i++) {
    if (output[i].type === 'function_call') {
      calls.push(output[i]);
    }
  }
  return calls;
}

function usedSearch(output) {
  for (var i = 0; i < output.length; i++) {
    if (output[i].type === 'web_search_call') {
      return true;
    }
  }
  return false;
}

// Arguments arrive as a JSON string here, unlike Gemini's parsed object.
function parseArguments(raw) {
  if (!raw) {
    return {};
  }
  if (typeof raw === 'object') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.log('could not parse tool arguments: ' + raw);
    return {};
  }
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
    tools.execute(call.name, parseArguments(call.arguments), ctx, function (resultText) {
      results.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: String(resultText)
      });
      next();
    });
  }

  next();
}

function ask(question, ctx, cb) {
  var iterations = 0;

  // The developer role carries the system prompt; it is re-sent each turn
  // because the whole input array is what the model sees.
  var input = session.slice();
  if (input.length === 0) {
    input.push({ role: 'developer', content: prompt.build(ctx) });
  }
  input.push({ role: 'user', content: question });

  var toolList = tools.flatDefinitions();
  if (ctx.searchAvailable) {
    toolList.push({ type: 'web_search' });
  }

  function step() {
    iterations++;

    http.postJson(settings.baseUrl(), {
      'Authorization': 'Bearer ' + settings.apiKey()
    }, {
      model: settings.model(),
      input: input,
      tools: toolList,
      reasoning: { effort: settings.get('effort') },
      // Reasoning tokens count against this too, so leave headroom above what
      // a two-sentence answer needs.
      max_output_tokens: MAX_OUTPUT_TOKENS
    }, function (data) {
      var output = data.output || [];

      if (usedSearch(output)) {
        cb.onStatus('searching');
      }

      var calls = collectFunctionCalls(output);
      if (calls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
        cb.onStatus('tool');
        // Everything the model produced has to go back, not just the calls.
        for (var i = 0; i < output.length; i++) {
          input.push(output[i]);
        }
        runTools(calls, ctx, function (results) {
          for (var j = 0; j < results.length; j++) {
            input.push(results[j]);
          }
          step();
        });
        return;
      }

      var text = collectText(output);
      input.push({ role: 'assistant', content: text || '...' });
      session = input.slice(-20);
      cb.onDone(text || 'No answer came back.');
    }, cb.onError);
  }

  step();
}

function resetSession() {
  session = [];
}

module.exports = {
  id: 'openai',
  ask: ask,
  resetSession: resetSession
};
