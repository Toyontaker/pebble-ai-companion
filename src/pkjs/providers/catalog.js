// Static provider metadata. Deliberately dependency-free: settings, the
// provider dispatcher and the config page all read from it, and anything it
// required would become a cycle.
//
// Defaults are each provider's mid tier, not its flagship: a watch answer is
// two sentences, and the flagship costs more and makes the user wait longer
// for no visible gain. Where a provider publishes a rolling alias, the default
// uses it so the app follows the current release without an app update. The
// flagship stays one tap away in the model suggestions.

var CATALOG = [
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-5',
    defaultBaseUrl: 'https://api.anthropic.com/v1/messages',
    // Anthropic ids carry no date suffix, so these are already stable.
    models: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
    keyHint: 'sk-ant-...',
    // Server-side web_search tool, declared alongside the custom tools.
    supportsSearch: true,
    supportsEffortSetting: true
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-5.6-terra',
    defaultBaseUrl: 'https://api.openai.com/v1/responses',
    // No rolling aliases here; OpenAI versions these explicitly.
    models: ['gpt-5.6-terra', 'gpt-6-astra', 'gpt-5.6-luna'],
    keyHint: 'sk-...',
    // Built-in web_search tool on the Responses API.
    supportsSearch: true,
    supportsEffortSetting: true
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-flash-latest',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    models: ['gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest'],
    keyHint: 'AIza...',
    // google_search grounding, combinable with function declarations.
    supportsSearch: true,
    supportsEffortSetting: true
  }
];

var IDS = [];
for (var i = 0; i < CATALOG.length; i++) {
  IDS.push(CATALOG[i].id);
}

function byId(id) {
  for (var j = 0; j < CATALOG.length; j++) {
    if (CATALOG[j].id === id) {
      return CATALOG[j];
    }
  }
  return CATALOG[0];
}

module.exports = {
  ALL: CATALOG,
  IDS: IDS,
  byId: byId
};
