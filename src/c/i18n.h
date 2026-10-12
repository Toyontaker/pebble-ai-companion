#pragma once
#include <pebble.h>

// UI language. Japanese strings only render on watches that have a Japanese
// language pack installed (system fonts otherwise draw tofu boxes), so the
// language is a user setting rather than a compile-time constant.
typedef enum {
  LANG_JA = 0,
  LANG_EN = 1,
} Lang;

typedef enum {
  STR_MENU_ASK = 0,
  STR_MENU_ASK_SUB,
  STR_MENU_TIMER,
  STR_MENU_TIMER_SUB,
  STR_MENU_ALARM,
  STR_MENU_ALARM_SUB,
  STR_MENU_REMIND,
  STR_MENU_REMIND_SUB,
  STR_MENU_BRIEF,
  STR_MENU_BRIEF_SUB,
  STR_MENU_ABOUT,
  STR_MENU_ABOUT_SUB,

  STR_TITLE_TIMER,
  STR_TITLE_ALARM,
  STR_TITLE_REMIND,

  STR_STATUS_THINKING,
  STR_STATUS_SEARCHING,
  STR_STATUS_TOOL,
  STR_STATUS_PINNING,
  STR_STATUS_NOPHONE,
  STR_STATUS_NOKEY,
  STR_STATUS_LISTENING,

  STR_HINT_ANSWER,
  STR_HINT_PINNED,
  STR_HINT_PIN_FAIL,

  STR_ADD_TIMER,
  STR_ADD_ALARM,
  STR_ADD_ASKAI,
  STR_EMPTY_LIST,
  STR_DELETED,
  STR_NUM_MINUTES,
  STR_NUM_HOUR,
  STR_NUM_MINUTE,

  STR_FIRE_TIMER,
  STR_FIRE_ALARM,
  STR_FIRE_REMIND,
  STR_SNOOZE,
  STR_DISMISS,
  STR_SNOOZED,

  STR_QUICK_1,
  STR_QUICK_2,
  STR_QUICK_3,
  STR_QUICK_4,
  STR_QUICK_TITLE,

  STR_ABOUT_BODY,
  STR_DICT_FAIL,
  STR_SCHED_FULL,

  STR_CONFIRM_TITLE,
  STR_CONFIRM_YES,
  STR_CONFIRM_NO,

  STR_COUNT
} StrId;

void i18n_init_from_system(void);
void i18n_set_lang(Lang lang);
Lang i18n_get_lang(void);
const char *S(StrId id);
