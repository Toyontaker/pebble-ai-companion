// The settings page. It is handed to Pebble.openURL() as a self-contained
// data: URL so the app needs no hosting; the same markup can be served from a
// static host instead if you prefer (see README).

var settings = require('./settings');
var catalog = require('./providers/catalog');

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Safe to drop inside a <script> block: the only sequence that could close it
// early is "</", and escaping "<" removes it.
function json(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function option(value, label, current) {
  return '<option value="' + esc(value) + '"' +
         (value === current ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function strings(ja) {
  return ja ? {
    title: 'AI Companion 設定',
    provider: 'プロバイダ',
    key: 'APIキー',
    keyHint: 'キーはこのスマホの中だけに保存され、選んだプロバイダ以外には送信されません。プロバイダごとに別々に保存されます。',
    model: 'モデル',
    modelHint: '空欄ならプロバイダの既定モデルを使います。上書きしたいときだけ入力してください。',
    effort: '思考の深さ',
    effortHint: '低いほど速く、安く返ってきます。3社とも対応（Claude: effort / OpenAI: reasoning.effort / Gemini: thinking_level）。',
    lang: '言語',
    web: 'インターネット検索を許可',
    webHint: '各プロバイダの組み込み検索（Claude: web_search / OpenAI: web search / Gemini: google_search）を使います。',
    loc: '現在地を送る（天気・周辺情報用）',
    sound: '音を鳴らす',
    soundHint: 'アラーム・タイマー・リマインダーのメロディと、回答が届いたときのチャイム。スピーカーのある Pebble Time 2 のみ。オフでも振動はします。',
    persona: '追加の指示（口調・呼び方など）',
    cal: 'Google カレンダー連携',
    calUrl: 'ウェブアプリの URL',
    calSecret: '合言葉（SECRET）',
    calHint: 'Apps Script（gas/Code.gs）を自分のアカウントにデプロイして、/exec で終わる URL と、スクリプトに設定した SECRET を入れてください。手順は README にあります。両方空欄ならカレンダー機能はオフです。',
    timeline: 'タイムラインAPI',
    timelineHint: 'Rebbleをお使いの場合は https://timeline-api.rebble.io/v1/user/pins/ に変更してください。',
    base: 'APIエンドポイント',
    baseHint: '空欄ならプロバイダの既定エンドポイントを使います。互換ゲートウェイを経由する場合のみ入力してください。',
    forget: '記憶した内容を消去する',
    save: '保存',
    advanced: '詳細設定'
  } : {
    title: 'AI Companion settings',
    provider: 'Provider',
    key: 'API key',
    keyHint: 'The key is stored on this phone only and goes to the selected provider alone. Each provider keeps its own key.',
    model: 'Model',
    modelHint: 'Leave empty to use the provider default. Fill it in only to override.',
    effort: 'Reasoning effort',
    effortHint: 'Lower is faster and cheaper. All three providers support it.',
    lang: 'Language',
    web: 'Allow web search',
    webHint: 'Uses each provider\'s built-in search (Claude: web_search, OpenAI: web search, Gemini: google_search).',
    loc: 'Share my location (weather, nearby places)',
    sound: 'Play sounds',
    soundHint: 'Melody for alarms, timers and reminders, and a chime when an answer arrives. Pebble Time 2 only (it has the speaker). Vibration stays on either way.',
    persona: 'Extra instructions (tone, how to address you)',
    cal: 'Google Calendar',
    calUrl: 'Web app URL',
    calSecret: 'Secret',
    calHint: 'Deploy the Apps Script in gas/Code.gs to your own account, then paste the URL ending in /exec and the SECRET you set on the script. Steps are in the README. Leave both empty to turn calendar features off.',
    timeline: 'Timeline API',
    timelineHint: 'On Rebble, change this to https://timeline-api.rebble.io/v1/user/pins/',
    base: 'API endpoint',
    baseHint: 'Leave empty to use the provider default. Fill it in only to route through a compatible gateway.',
    forget: 'Erase remembered facts',
    save: 'Save',
    advanced: 'Advanced'
  };
}

function providerOptions(current) {
  var out = '';
  for (var i = 0; i < catalog.ALL.length; i++) {
    out += option(catalog.ALL[i].id, catalog.ALL[i].label, current);
  }
  return out;
}

function html(current) {
  var t = strings(settings.get('lang') === 'ja');

  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(t.title) + '</title><style>' +
    'body{margin:0;padding:18px;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'background:#f5f4f0;color:#1a1a18}' +
    'h1{font-size:19px;margin:0 0 18px}' +
    'label{display:block;margin:16px 0 5px;font-weight:600;font-size:13px}' +
    'input[type=text],input[type=password],select,textarea{width:100%;box-sizing:border-box;' +
    'padding:10px;border:1px solid #ccc9c0;border-radius:8px;font-size:15px;background:#fff}' +
    'textarea{height:70px;resize:vertical}' +
    '.hint{font-size:12px;color:#6b6862;margin-top:4px}' +
    '.row{display:flex;align-items:center;gap:9px;margin:14px 0}' +
    '.row input{width:auto;margin:0}' +
    '.row label{margin:0;font-weight:400;font-size:14px}' +
    'details{margin-top:22px}summary{font-weight:600;font-size:13px;cursor:pointer}' +
    'button{width:100%;margin-top:24px;padding:14px;border:0;border-radius:8px;' +
    'background:#c96442;color:#fff;font-size:16px;font-weight:600}' +
    '[hidden]{display:none}' +
    '</style></head><body>' +
    '<h1>' + esc(t.title) + '</h1>' +

    '<label for="provider">' + esc(t.provider) + '</label>' +
    '<select id="provider">' + providerOptions(current.provider) + '</select>' +

    '<label for="api_key">' + esc(t.key) + '</label>' +
    '<input type="password" id="api_key">' +
    '<div class="hint">' + esc(t.keyHint) + '</div>' +

    '<label for="model">' + esc(t.model) + '</label>' +
    '<input type="text" id="model" list="model_list" autocapitalize="off" autocorrect="off" spellcheck="false">' +
    '<datalist id="model_list"></datalist>' +
    '<div class="hint">' + esc(t.modelHint) + '</div>' +

    '<div id="effort_wrap">' +
    '<label for="effort">' + esc(t.effort) + '</label><select id="effort">' +
    option('low', 'low', current.effort) +
    option('medium', 'medium', current.effort) +
    option('high', 'high', current.effort) +
    '</select><div class="hint">' + esc(t.effortHint) + '</div></div>' +

    '<label for="lang">' + esc(t.lang) + '</label><select id="lang">' +
    option('ja', '日本語', current.lang) +
    option('en', 'English', current.lang) +
    '</select>' +

    '<div class="row"><input type="checkbox" id="web_search"' +
    (current.web_search === 'true' ? ' checked' : '') + '>' +
    '<label for="web_search">' + esc(t.web) + '</label></div>' +
    '<div class="hint">' + esc(t.webHint) + '</div>' +

    '<div class="row"><input type="checkbox" id="location"' +
    (current.location === 'true' ? ' checked' : '') + '>' +
    '<label for="location">' + esc(t.loc) + '</label></div>' +

    '<div class="row"><input type="checkbox" id="sound"' +
    (current.sound === 'true' ? ' checked' : '') + '>' +
    '<label for="sound">' + esc(t.sound) + '</label></div>' +
    '<div class="hint">' + esc(t.soundHint) + '</div>' +

    '<label for="persona">' + esc(t.persona) + '</label>' +
    '<textarea id="persona">' + esc(current.persona) + '</textarea>' +

    '<details' + (current.cal_url ? ' open' : '') + '><summary>' + esc(t.cal) + '</summary>' +
    '<label for="cal_url">' + esc(t.calUrl) + '</label>' +
    '<input type="text" id="cal_url" value="' + esc(current.cal_url) + '" placeholder="https://script.google.com/macros/s/.../exec"' +
    ' autocapitalize="off" autocorrect="off" spellcheck="false">' +
    '<label for="cal_secret">' + esc(t.calSecret) + '</label>' +
    '<input type="password" id="cal_secret" value="' + esc(current.cal_secret) + '">' +
    '<div class="hint">' + esc(t.calHint) + '</div>' +
    '</details>' +

    '<details><summary>' + esc(t.advanced) + '</summary>' +
    '<label for="base_url">' + esc(t.base) + '</label>' +
    '<input type="text" id="base_url" autocapitalize="off" autocorrect="off" spellcheck="false">' +
    '<div class="hint">' + esc(t.baseHint) + '</div>' +
    '<label for="timeline_base">' + esc(t.timeline) + '</label>' +
    '<input type="text" id="timeline_base" value="' + esc(current.timeline_base) + '">' +
    '<div class="hint">' + esc(t.timelineHint) + '</div>' +
    '<div class="row"><input type="checkbox" id="forget"><label for="forget">' +
    esc(t.forget) + '</label></div>' +
    '</details>' +

    '<button id="save">' + esc(t.save) + '</button>' +

    '<script>' +
    'var PROVIDERS=' + json(catalog.ALL) + ';' +
    'var V=' + json(current) + ';' +
    'var SCOPED=["api_key","model","base_url"];' +
    'function el(id){return document.getElementById(id);}' +
    'function meta(id){for(var i=0;i<PROVIDERS.length;i++){if(PROVIDERS[i].id===id)return PROVIDERS[i];}return PROVIDERS[0];}' +
    // Remember what is on screen before the fields are repointed at another provider.
    'function stash(id){for(var i=0;i<SCOPED.length;i++){V[SCOPED[i]+"_"+id]=el(SCOPED[i]).value;}}' +
    // Model and endpoint are overrides, not values: an empty box means "use
    // whatever this provider's default is", and the default shows as the
    // placeholder. Pre-filling them would turn today's default into a stored
    // user value that no longer follows the provider.
    'function load(id){' +
    'var m=meta(id);' +
    'for(var i=0;i<SCOPED.length;i++){V[SCOPED[i]+"_"+id]=V[SCOPED[i]+"_"+id]||"";el(SCOPED[i]).value=V[SCOPED[i]+"_"+id];}' +
    'el("api_key").placeholder=m.keyHint;' +
    'el("model").placeholder=m.defaultModel;' +
    'el("base_url").placeholder=m.defaultBaseUrl;' +
    'var list=el("model_list");list.innerHTML="";' +
    'for(var j=0;j<m.models.length;j++){var o=document.createElement("option");o.value=m.models[j];list.appendChild(o);}' +
    'el("effort_wrap").hidden=!m.supportsEffortSetting;' +
    '}' +
    'var shown=el("provider").value;' +
    'load(shown);' +
    // Some mobile webviews defer a <select> change event until blur, so the
    // swap is driven from several events and, at save time, from the DOM
    // rather than from the cached id.
    'function swap(){var id=el("provider").value;if(id===shown){return;}stash(shown);shown=id;load(shown);}' +
    'el("provider").addEventListener("change",swap);' +
    'el("provider").addEventListener("input",swap);' +
    'el("provider").addEventListener("blur",swap);' +
    // At save time the dropdown is the truth, and whatever is in the boxes is
    // what the user meant for the provider they have selected. Do not reload
    // here: that would discard what they just typed.
    'el("save").addEventListener("click",function(){' +
    'shown=el("provider").value;' +
    'stash(shown);' +
    'var out={provider:shown,effort:el("effort").value,lang:el("lang").value,' +
    'web_search:el("web_search").checked?"true":"false",' +
    'location:el("location").checked?"true":"false",' +
    'sound:el("sound").checked?"true":"false",' +
    'persona:el("persona").value,timeline_base:el("timeline_base").value,' +
    'cal_url:el("cal_url").value,cal_secret:el("cal_secret").value,' +
    'forget:el("forget").checked?"true":"false"};' +
    'for(var i=0;i<PROVIDERS.length;i++){for(var j=0;j<SCOPED.length;j++){' +
    'var k=SCOPED[j]+"_"+PROVIDERS[i].id;out[k]=V[k]||"";}}' +
    'var back=document.location.hash.indexOf("return_to=")>-1?' +
    'decodeURIComponent(document.location.hash.split("return_to=")[1]):"pebblejs://close#";' +
    'document.location=back+encodeURIComponent(JSON.stringify(out));});' +
    '</script></body></html>';
}

function dataUrl() {
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html(settings.all()));
}

module.exports = {
  html: html,
  dataUrl: dataUrl
};
