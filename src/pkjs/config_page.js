// The settings page. It is handed to Pebble.openURL() as a self-contained
// data: URL so the app needs no hosting; the same markup can be served from a
// static host instead if you prefer (see README).

var settings = require('./settings');
var catalog = require('./providers/catalog');

var REPO = 'https://github.com/Toyontaker/pebble-ai-companion';
var LINKS = {
  codeGs: REPO + '/blob/main/gas/Code.gs',
  calendarGuide: REPO + '/blob/main/docs/CALENDAR.md',
  privacy: REPO + '/blob/main/PRIVACY.md'
};

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
    loc: '現在地を AI に送る（天気・周辺情報用）',
    locHint: 'オンにすると、質問のたびにおおよその現在地（緯度・経度）を、選んだプロバイダに送ります。',
    sound: '音を鳴らす',
    soundHint: 'アラーム・タイマー・リマインダーのメロディと、回答が届いたときのチャイム。スピーカーのある Pebble Time 2 のみ。オフでも振動はします。',
    persona: '追加の指示（口調・呼び方など）',
    cal: 'Google カレンダー連携',
    calMode: '連携方法',
    calOff: 'オフ',
    calIcal: 'ライト（予定を読むだけ）',
    calGas: '上級者向け（追加・変更・削除も）',
    calIcalUrl: 'iCal 形式の非公開アドレス',
    calIcalHint: 'パソコンで Google カレンダーを開き、設定 → 対象のカレンダー →「カレンダーの統合」にある「iCal 形式の非公開アドレス」を貼ってください。予定の変更が反映されるまで時間がかかることがあります。',
    calUrl: 'ウェブアプリの URL',
    calSecret: '合言葉（SECRET）',
    calGasHint: 'Apps Script を自分の Google アカウントにデプロイして、/exec で終わる URL と、スクリプトに設定した SECRET を入れてください。',
    calCode: 'Code.gs を開く（GitHub）',
    calGuide: '設定手順を見る',
    base: 'APIエンドポイント',
    baseHint: '空欄ならプロバイダの既定エンドポイントを使います。互換ゲートウェイを経由する場合のみ入力してください。',
    forget: '記憶した内容を消去する',
    privacy: 'プライバシーポリシー',
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
    loc: 'Send my location to the AI (weather, nearby places)',
    locHint: 'When on, your approximate location (latitude and longitude) goes to the selected provider with each question.',
    sound: 'Play sounds',
    soundHint: 'Melody for alarms, timers and reminders, and a chime when an answer arrives. Pebble Time 2 only (it has the speaker). Vibration stays on either way.',
    persona: 'Extra instructions (tone, how to address you)',
    cal: 'Google Calendar',
    calMode: 'Connection',
    calOff: 'Off',
    calIcal: 'Light (read events only)',
    calGas: 'Advanced (add, change and delete too)',
    calIcalUrl: 'Secret address in iCal format',
    calIcalHint: 'On a computer, open Google Calendar settings, pick the calendar, and under "Integrate calendar" copy the "Secret address in iCal format". Changes can take a while to show up in it.',
    calUrl: 'Web app URL',
    calSecret: 'Secret',
    calGasHint: 'Deploy the Apps Script to your own Google account, then paste the URL ending in /exec and the SECRET you set on the script.',
    calCode: 'Open Code.gs (GitHub)',
    calGuide: 'Setup guide',
    base: 'API endpoint',
    baseHint: 'Leave empty to use the provider default. Fill it in only to route through a compatible gateway.',
    forget: 'Erase remembered facts',
    privacy: 'Privacy policy',
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
    'a{color:#c96442}.links{font-size:13px;margin-top:8px}.links a{margin-right:14px}' +
    '.foot{text-align:center;font-size:13px;margin-top:18px}' +
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
    '<div class="hint">' + esc(t.locHint) + '</div>' +

    '<div class="row"><input type="checkbox" id="sound"' +
    (current.sound === 'true' ? ' checked' : '') + '>' +
    '<label for="sound">' + esc(t.sound) + '</label></div>' +
    '<div class="hint">' + esc(t.soundHint) + '</div>' +

    '<label for="persona">' + esc(t.persona) + '</label>' +
    '<textarea id="persona">' + esc(current.persona) + '</textarea>' +

    '<details' + (current.cal_mode !== 'off' ? ' open' : '') + '><summary>' + esc(t.cal) + '</summary>' +
    '<label for="cal_mode">' + esc(t.calMode) + '</label><select id="cal_mode">' +
    option('off', t.calOff, current.cal_mode) +
    option('ical', t.calIcal, current.cal_mode) +
    option('gas', t.calGas, current.cal_mode) +
    '</select>' +
    '<div id="cal_ical">' +
    '<label for="cal_ical_url">' + esc(t.calIcalUrl) + '</label>' +
    '<input type="password" id="cal_ical_url" value="' + esc(current.cal_ical_url) + '"' +
    ' placeholder="https://calendar.google.com/calendar/ical/.../private-.../basic.ics"' +
    ' autocapitalize="off" autocorrect="off" spellcheck="false">' +
    '<div class="hint">' + esc(t.calIcalHint) + '</div>' +
    '</div>' +
    '<div id="cal_gas">' +
    '<label for="cal_url">' + esc(t.calUrl) + '</label>' +
    '<input type="text" id="cal_url" value="' + esc(current.cal_url) + '" placeholder="https://script.google.com/macros/s/.../exec"' +
    ' autocapitalize="off" autocorrect="off" spellcheck="false">' +
    '<label for="cal_secret">' + esc(t.calSecret) + '</label>' +
    '<input type="password" id="cal_secret" value="' + esc(current.cal_secret) + '">' +
    '<div class="hint">' + esc(t.calGasHint) + '</div>' +
    '<div class="links"><a href="' + esc(LINKS.codeGs) + '" target="_blank" rel="noopener">' + esc(t.calCode) + '</a></div>' +
    '</div>' +
    '<div class="links"><a href="' + esc(LINKS.calendarGuide) + '" target="_blank" rel="noopener">' + esc(t.calGuide) + '</a></div>' +
    '</details>' +

    '<details><summary>' + esc(t.advanced) + '</summary>' +
    '<label for="base_url">' + esc(t.base) + '</label>' +
    '<input type="text" id="base_url" autocapitalize="off" autocorrect="off" spellcheck="false">' +
    '<div class="hint">' + esc(t.baseHint) + '</div>' +
    '<div class="row"><input type="checkbox" id="forget"><label for="forget">' +
    esc(t.forget) + '</label></div>' +
    '</details>' +

    '<button id="save">' + esc(t.save) + '</button>' +
    '<div class="foot"><a href="' + esc(LINKS.privacy) + '" target="_blank" rel="noopener">' + esc(t.privacy) + '</a></div>' +

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
    // Show only the fields for the chosen calendar connection.
    'function calShow(){var m=el("cal_mode").value;el("cal_ical").hidden=m!=="ical";el("cal_gas").hidden=m!=="gas";}' +
    'el("cal_mode").addEventListener("change",calShow);' +
    'el("cal_mode").addEventListener("input",calShow);' +
    'calShow();' +
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
    'persona:el("persona").value,' +
    'cal_mode:el("cal_mode").value,cal_ical_url:el("cal_ical_url").value,' +
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
