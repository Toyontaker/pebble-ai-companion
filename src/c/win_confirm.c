#include "win_confirm.h"
#include "comm.h"
#include "i18n.h"

#define QUESTION_MAX 256

// Same layout grid as win_alert.c. Gabbro lowers everything and narrows the
// sides so the text stays inside the circle.
#if defined(PBL_PLATFORM_GABBRO)
#define TITLE_FONT  FONT_KEY_GOTHIC_24_BOLD
#define BODY_FONT   FONT_KEY_GOTHIC_24
#define HINT_FONT   FONT_KEY_GOTHIC_18
#define TITLE_TOP   30
#define TITLE_H     30
#define BODY_TOP    62
#define BODY_H      120
#define HINT_H      48
#define HINT_BOTTOM 30
#define SIDE_INSET  22
#elif defined(PBL_PLATFORM_EMERY)
#define TITLE_FONT  FONT_KEY_GOTHIC_24_BOLD
#define BODY_FONT   FONT_KEY_GOTHIC_24
#define HINT_FONT   FONT_KEY_GOTHIC_18
#define TITLE_TOP   8
#define TITLE_H     30
#define BODY_TOP    40
#define BODY_H      136
#define HINT_H      48
#define HINT_BOTTOM 0
#define SIDE_INSET  0
#else
#define TITLE_FONT  FONT_KEY_GOTHIC_18_BOLD
#define BODY_FONT   FONT_KEY_GOTHIC_18
#define HINT_FONT   FONT_KEY_GOTHIC_14
#define TITLE_TOP   4
#define TITLE_H     22
#define BODY_TOP    28
#define BODY_H      100
#define HINT_H      34
#define HINT_BOTTOM 0
#define SIDE_INSET  0
#endif

static Window    *s_window;
static TextLayer *s_title_layer;
static TextLayer *s_body_layer;
static TextLayer *s_hint_layer;

static char s_question[QUESTION_MAX];
static char s_hint[64];
static bool s_answered;

static void prv_answer(bool yes) {
  if (s_answered) {
    return;
  }
  s_answered = true;
  comm_confirm_reply(yes);
  window_stack_remove(s_window, true);
}

static void prv_yes(ClickRecognizerRef recognizer, void *context) {
  prv_answer(true);
}

static void prv_no(ClickRecognizerRef recognizer, void *context) {
  prv_answer(false);
}

static void prv_click_config(void *context) {
  window_single_click_subscribe(BUTTON_ID_UP, prv_yes);
  window_single_click_subscribe(BUTTON_ID_DOWN, prv_no);
  window_single_click_subscribe(BUTTON_ID_BACK, prv_no);
}

#if defined(PBL_TOUCH)
// Swipes mirror the buttons. A tap does nothing, so a stray touch can never
// approve a delete.
static void prv_swipe(const Recognizer *recognizer, RecognizerEvent event) {
  if (event != RecognizerEvent_Completed) {
    return;
  }
  switch (swipe_recognizer_get_direction(recognizer)) {
    case SwipeDirection_Up:   prv_answer(true); break;
    case SwipeDirection_Down: prv_answer(false); break;
    default: break;
  }
}
#endif

static TextLayer *prv_text(Layer *root, GRect frame, const char *font) {
  TextLayer *layer = text_layer_create(frame);
  text_layer_set_font(layer, fonts_get_system_font(font));
  text_layer_set_background_color(layer, GColorClear);
  text_layer_set_text_alignment(layer, GTextAlignmentCenter);
  text_layer_set_overflow_mode(layer, GTextOverflowModeTrailingEllipsis);
  layer_add_child(root, text_layer_get_layer(layer));
  return layer;
}

static void prv_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  const GRect bounds = layer_get_bounds(root);
  const int16_t w = bounds.size.w - 8 - (2 * SIDE_INSET);
  const int16_t x = 4 + SIDE_INSET;

  window_set_background_color(window, PBL_IF_COLOR_ELSE(GColorPastelYellow, GColorWhite));

  s_title_layer = prv_text(root, GRect(x, TITLE_TOP, w, TITLE_H), TITLE_FONT);
  s_body_layer = prv_text(root, GRect(x, BODY_TOP, w, BODY_H), BODY_FONT);
  text_layer_set_overflow_mode(s_body_layer, GTextOverflowModeWordWrap);
  s_hint_layer = prv_text(root, GRect(x, bounds.size.h - HINT_H - HINT_BOTTOM, w, HINT_H),
                          HINT_FONT);

  window_set_click_config_provider(window, prv_click_config);

#if defined(PBL_TOUCH)
  window_set_touch_bridge_disabled(window, true);
  window_attach_recognizer(window, swipe_recognizer_create(
      prv_swipe, NULL, SwipeDirection_Up | SwipeDirection_Down));
#endif
}

static void prv_unload(Window *window) {
  // Removed some other way (another app, the app closing): the phone is still
  // waiting, and silence must not read as consent.
  if (!s_answered) {
    s_answered = true;
    comm_confirm_reply(false);
  }
  text_layer_destroy(s_hint_layer);
  text_layer_destroy(s_body_layer);
  text_layer_destroy(s_title_layer);
  s_hint_layer = NULL;
  s_body_layer = NULL;
  s_title_layer = NULL;
}

void win_confirm_push(const char *question) {
  strncpy(s_question, question ? question : "", sizeof(s_question) - 1);
  s_question[sizeof(s_question) - 1] = 0;
  s_answered = false;

  if (!s_window) {
    s_window = window_create();
    window_set_window_handlers(s_window, (WindowHandlers) {
      .load = prv_load,
      .unload = prv_unload,
    });
  }
  if (!window_stack_contains_window(s_window)) {
    window_stack_push(s_window, true);
  }

  snprintf(s_hint, sizeof(s_hint), "%s\n%s", S(STR_CONFIRM_YES), S(STR_CONFIRM_NO));
  text_layer_set_text(s_title_layer, S(STR_CONFIRM_TITLE));
  text_layer_set_text(s_body_layer, s_question);
  text_layer_set_text(s_hint_layer, s_hint);

  vibes_short_pulse();
  light_enable_interaction();
}

void win_confirm_deinit(void) {
  if (s_window) {
    window_destroy(s_window);
    s_window = NULL;
  }
}
