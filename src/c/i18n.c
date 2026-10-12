#include "i18n.h"

static Lang s_lang = LANG_JA;

static const char *const s_ja[STR_COUNT] = {
  [STR_MENU_ASK]        = "話しかける",
  [STR_MENU_ASK_SUB]    = "AIに質問・検索",
  [STR_MENU_TIMER]      = "タイマー",
  [STR_MENU_TIMER_SUB]  = "カウントダウン",
  [STR_MENU_ALARM]      = "アラーム",
  [STR_MENU_ALARM_SUB]  = "指定時刻に鳴らす",
  [STR_MENU_REMIND]     = "リマインダー",
  [STR_MENU_REMIND_SUB] = "予定とピン",
  [STR_MENU_BRIEF]      = "今日のまとめ",
  [STR_MENU_BRIEF_SUB]  = "天気・予定・ニュース",
  [STR_MENU_ABOUT]      = "情報",
  [STR_MENU_ABOUT_SUB]  = "設定と使い方",

  [STR_TITLE_TIMER]     = "タイマー",
  [STR_TITLE_ALARM]     = "アラーム",
  [STR_TITLE_REMIND]    = "リマインダー",

  [STR_STATUS_THINKING] = "考えています...",
  [STR_STATUS_SEARCHING]= "検索中...",
  [STR_STATUS_TOOL]     = "実行中...",
  [STR_STATUS_PINNING]  = "ピン止め中...",
  [STR_STATUS_NOPHONE]  = "スマホに接続できません",
  [STR_STATUS_NOKEY]    = "APIキーが未設定です。スマホのPebbleアプリから設定してください。",
  [STR_STATUS_LISTENING]= "どうぞ",

  [STR_HINT_ANSWER]     = "選択:質問 長押し:ピン止め",
  [STR_HINT_PINNED]     = "ピン止めしました",
  [STR_HINT_PIN_FAIL]   = "ピン止めに失敗しました",

  [STR_ADD_TIMER]       = "＋ タイマーを追加",
  [STR_ADD_ALARM]       = "＋ アラームを追加",
  [STR_ADD_ASKAI]       = "＋ AIに頼む",
  [STR_EMPTY_LIST]      = "まだありません",
  [STR_DELETED]         = "削除しました",
  [STR_NUM_MINUTES]     = "何分後?",
  [STR_NUM_HOUR]        = "時",
  [STR_NUM_MINUTE]      = "分",

  [STR_FIRE_TIMER]      = "タイマー終了",
  [STR_FIRE_ALARM]      = "アラーム",
  [STR_FIRE_REMIND]     = "リマインダー",
  [STR_SNOOZE]          = "上:5分後に再通知",
  [STR_DISMISS]         = "下:停止",
  [STR_SNOOZED]         = "5分後に再通知します",

  [STR_QUICK_TITLE]     = "定型文",
  [STR_QUICK_1]         = "今日の天気は?",
  [STR_QUICK_2]         = "最新のニュースを教えて",
  [STR_QUICK_3]         = "10分のタイマーをセットして",
  [STR_QUICK_4]         = "今日の予定を教えて",

  [STR_ABOUT_BODY]      = "AI Companion\n\nAPIキー・モデル・言語はスマホのPebbleアプリの設定画面から変更できます。\n\n話しかけるとインターネット検索、タイマー、アラーム、リマインダー、タイムラインへのピン止め、Googleカレンダーの予定の確認・登録をAIが実行します。",
  [STR_DICT_FAIL]       = "聞き取れませんでした",
  [STR_SCHED_FULL]      = "登録できる上限に達しました",

  [STR_CONFIRM_TITLE]   = "確認",
  [STR_CONFIRM_YES]     = "上:実行する",
  [STR_CONFIRM_NO]      = "下:やめる",
};

static const char *const s_en[STR_COUNT] = {
  [STR_MENU_ASK]        = "Ask",
  [STR_MENU_ASK_SUB]    = "Question & web search",
  [STR_MENU_TIMER]      = "Timers",
  [STR_MENU_TIMER_SUB]  = "Countdown",
  [STR_MENU_ALARM]      = "Alarms",
  [STR_MENU_ALARM_SUB]  = "Ring at a set time",
  [STR_MENU_REMIND]     = "Reminders",
  [STR_MENU_REMIND_SUB] = "Events & pins",
  [STR_MENU_BRIEF]      = "Daily brief",
  [STR_MENU_BRIEF_SUB]  = "Weather, agenda, news",
  [STR_MENU_ABOUT]      = "About",
  [STR_MENU_ABOUT_SUB]  = "Settings & help",

  [STR_TITLE_TIMER]     = "Timers",
  [STR_TITLE_ALARM]     = "Alarms",
  [STR_TITLE_REMIND]    = "Reminders",

  [STR_STATUS_THINKING] = "Thinking...",
  [STR_STATUS_SEARCHING]= "Searching...",
  [STR_STATUS_TOOL]     = "Working...",
  [STR_STATUS_PINNING]  = "Pinning...",
  [STR_STATUS_NOPHONE]  = "Phone not connected",
  [STR_STATUS_NOKEY]    = "No API key. Open the app settings in the Pebble phone app.",
  [STR_STATUS_LISTENING]= "Listening",

  [STR_HINT_ANSWER]     = "Select: follow-up / Hold: pin",
  [STR_HINT_PINNED]     = "Pinned to your timeline",
  [STR_HINT_PIN_FAIL]   = "Could not pin",

  [STR_ADD_TIMER]       = "+ New timer",
  [STR_ADD_ALARM]       = "+ New alarm",
  [STR_ADD_ASKAI]       = "+ Ask the AI",
  [STR_EMPTY_LIST]      = "Nothing yet",
  [STR_DELETED]         = "Deleted",
  [STR_NUM_MINUTES]     = "Minutes",
  [STR_NUM_HOUR]        = "Hour",
  [STR_NUM_MINUTE]      = "Minute",

  [STR_FIRE_TIMER]      = "Timer done",
  [STR_FIRE_ALARM]      = "Alarm",
  [STR_FIRE_REMIND]     = "Reminder",
  [STR_SNOOZE]          = "Up: snooze 5 min",
  [STR_DISMISS]         = "Down: dismiss",
  [STR_SNOOZED]         = "Snoozed for 5 minutes",

  [STR_QUICK_TITLE]     = "Quick phrases",
  [STR_QUICK_1]         = "What's the weather today?",
  [STR_QUICK_2]         = "What's in the news?",
  [STR_QUICK_3]         = "Set a 10 minute timer",
  [STR_QUICK_4]         = "What's on my schedule?",

  [STR_ABOUT_BODY]      = "AI Companion\n\nAPI key, model and language live in the app settings inside the Pebble phone app.\n\nAsk it anything: it can search the web, set timers, alarms and reminders, pin notes to your timeline, and read or add Google Calendar events.",
  [STR_DICT_FAIL]       = "Didn't catch that",
  [STR_SCHED_FULL]      = "No free slots left",

  [STR_CONFIRM_TITLE]   = "Confirm",
  [STR_CONFIRM_YES]     = "Up: do it",
  [STR_CONFIRM_NO]      = "Down: cancel",
};

// Until the phone says otherwise: Japanese only when the watch itself runs a
// Japanese language pack, since system fonts cannot draw it otherwise.
void i18n_init_from_system(void) {
  const char *locale = i18n_get_system_locale();
  s_lang = (locale && strncmp(locale, "ja", 2) == 0) ? LANG_JA : LANG_EN;
}

void i18n_set_lang(Lang lang) {
  s_lang = (lang == LANG_EN) ? LANG_EN : LANG_JA;
}

Lang i18n_get_lang(void) {
  return s_lang;
}

const char *S(StrId id) {
  if (id >= STR_COUNT) {
    return "";
  }
  const char *v = (s_lang == LANG_EN) ? s_en[id] : s_ja[id];
  return v ? v : "";
}
