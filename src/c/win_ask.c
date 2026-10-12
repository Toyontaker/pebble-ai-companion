#include "win_ask.h"
#include "comm.h"
#include "i18n.h"
#include "store.h"
#include "sound.h"

// Emery's 200x228 screen fits a larger type scale than the 144x168 models.
// The answer is the reason the screen exists, so it gets the big type and the
// hint bar drops to a size that still fits a Japanese line.
// Gabbro (round 260x260) uses the same type scale. Its footer cannot be a bar
// on the bottom edge, where the circle is too narrow for a line of text, so it
// becomes two lines of plain text lifted off the edge (see prv_window_load).
#if defined(PBL_PLATFORM_GABBRO)
#define FOOTER_H 36
#define FOOTER_BOTTOM 18
#define FOOTER_INSET 40
#define BODY_FONT FONT_KEY_GOTHIC_28
#define FOOTER_FONT FONT_KEY_GOTHIC_14
#elif defined(PBL_PLATFORM_EMERY)
#define FOOTER_H 24
#define BODY_FONT FONT_KEY_GOTHIC_28
#define FOOTER_FONT FONT_KEY_GOTHIC_14
#else
#define FOOTER_H 22
#define BODY_FONT FONT_KEY_GOTHIC_18
#define FOOTER_FONT FONT_KEY_GOTHIC_14
#endif

#ifndef FOOTER_BOTTOM
#define FOOTER_BOTTOM 0
#define FOOTER_INSET 2
#endif

#define BODY_PAD 6
// Inset for text flow on round screens: how far the text keeps from the bezel.
#define FLOW_INSET 8
#define QUESTION_MAX 200

static Window      *s_window;
static ScrollLayer *s_scroll;
static TextLayer   *s_body;
static TextLayer   *s_footer;

static Window      *s_quick_window;
static MenuLayer   *s_quick_menu;

#if defined(PBL_MICROPHONE)
static DictationSession *s_dictation;
#endif

static char s_question[QUESTION_MAX];
static char s_footer_text[64];
static bool s_awaiting;

static const StrId s_quick_ids[] = {
  STR_QUICK_1, STR_QUICK_2, STR_QUICK_3, STR_QUICK_4,
};
#define QUICK_COUNT (int)(sizeof(s_quick_ids) / sizeof(s_quick_ids[0]))

static void prv_start_dictation(void);

// ---------------------------------------------------------------- rendering

static void prv_layout_body(void) {
  if (!s_body || !s_scroll) {
    return;
  }
  const GRect frame = layer_get_frame(scroll_layer_get_layer(s_scroll));
  const int16_t w = frame.size.w - (2 * BODY_PAD);

  layer_set_frame(text_layer_get_layer(s_body), GRect(BODY_PAD, 0, w, 2000));
  const GSize used = text_layer_get_content_size(s_body);
  const int16_t h = used.h + 12;
  layer_set_frame(text_layer_get_layer(s_body), GRect(BODY_PAD, 0, w, h));
  scroll_layer_set_content_size(s_scroll, GSize(frame.size.w, h));
}

static void prv_set_body(const char *text) {
  if (!s_body) {
    return;
  }
  text_layer_set_text(s_body, text);
  prv_layout_body();
}

static void prv_set_footer(const char *text) {
  if (!s_footer) {
    return;
  }
  strncpy(s_footer_text, text ? text : "", sizeof(s_footer_text) - 1);
  s_footer_text[sizeof(s_footer_text) - 1] = 0;
  text_layer_set_text(s_footer, s_footer_text);
}

// ------------------------------------------------------------- comm handlers

static void prv_on_status(uint8_t status) {
  switch (status) {
    case ST_THINKING:
      s_awaiting = true;
      prv_set_body(S(STR_STATUS_THINKING));
      prv_set_footer("");
      break;
    case ST_SEARCHING:
      prv_set_footer(S(STR_STATUS_SEARCHING));
      break;
    case ST_TOOL:
      prv_set_footer(S(STR_STATUS_TOOL));
      break;
    case ST_PINNING:
      prv_set_footer(S(STR_STATUS_PINNING));
      break;
    case ST_PINNED:
      vibes_short_pulse();
      prv_set_footer(S(STR_HINT_PINNED));
      break;
    case ST_PIN_FAIL:
      prv_set_footer(S(STR_HINT_PIN_FAIL));
      break;
    case ST_ERROR:
      s_awaiting = false;
      prv_set_footer("");
      break;
    default:
      break;
  }
}

static void prv_on_text(const char *accumulated, bool done) {
  prv_set_body(accumulated);
  if (done) {
    s_awaiting = false;
    prv_set_footer(S(STR_HINT_ANSWER));
    vibes_short_pulse();
    sound_answer();
  }
}

static void prv_on_action(uint8_t kind, const char *label, time_t when) {
  if (kind == ACT_PINNED) {
    prv_set_footer(S(STR_HINT_PINNED));
  }
}

// ------------------------------------------------------------------ sending

static void prv_send_question(const char *question) {
  if (!comm_connected()) {
    prv_set_body(S(STR_STATUS_NOPHONE));
    return;
  }
  if (!comm_phone_ready()) {
    prv_set_body(S(STR_STATUS_NOKEY));
    return;
  }
  strncpy(s_question, question, QUESTION_MAX - 1);
  s_question[QUESTION_MAX - 1] = 0;
  s_awaiting = true;
  prv_set_body(S(STR_STATUS_THINKING));
  prv_set_footer("");
  comm_ask(s_question);
}

// ---------------------------------------------------------------- dictation

#if defined(PBL_MICROPHONE)
static void prv_dictation_cb(DictationSession *session, DictationSessionStatus status,
                             char *transcription, void *context) {
  if (status == DictationSessionStatusSuccess && transcription && transcription[0]) {
    prv_send_question(transcription);
  } else if (!s_awaiting && comm_answer()[0] == 0) {
    prv_set_body(S(STR_DICT_FAIL));
    prv_set_footer(S(STR_HINT_ANSWER));
  }
}
#endif

static void prv_start_dictation(void) {
#if defined(PBL_MICROPHONE)
  if (!s_dictation) {
    s_dictation = dictation_session_create(QUESTION_MAX, prv_dictation_cb, NULL);
  }
  if (s_dictation) {
    dictation_session_start(s_dictation);
    return;
  }
#endif
  win_ask_push_quick_phrases();
}

// ------------------------------------------------------------------ buttons

static void prv_select_click(ClickRecognizerRef recognizer, void *context) {
  prv_start_dictation();
}

static void prv_select_long(ClickRecognizerRef recognizer, void *context) {
  if (comm_answer()[0] == 0) {
    return;
  }
  prv_set_footer(S(STR_STATUS_PINNING));
  comm_pin_last(s_question[0] ? s_question : S(STR_MENU_ASK));
}

static void prv_click_config(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, prv_select_click);
  window_long_click_subscribe(BUTTON_ID_SELECT, 0, prv_select_long, NULL);
}

// ------------------------------------------------------------ window plumbing

static void prv_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  const GRect bounds = layer_get_bounds(root);
  const GRect scroll_frame = GRect(0, 0, bounds.size.w, bounds.size.h - FOOTER_H - FOOTER_BOTTOM);

  s_scroll = scroll_layer_create(scroll_frame);
  scroll_layer_set_shadow_hidden(s_scroll, true);
  // Callbacks first: set_click_config_onto_window installs the scroll layer's
  // provider, which in turn calls ours.
  scroll_layer_set_callbacks(s_scroll, (ScrollLayerCallbacks) {
    .click_config_provider = prv_click_config,
  });
  scroll_layer_set_click_config_onto_window(s_scroll, window);

  s_body = text_layer_create(GRect(BODY_PAD, 0, scroll_frame.size.w - (2 * BODY_PAD), 2000));
  text_layer_set_font(s_body, fonts_get_system_font(BODY_FONT));
  text_layer_set_background_color(s_body, GColorClear);
  text_layer_set_text_alignment(s_body, PBL_IF_ROUND_ELSE(GTextAlignmentCenter, GTextAlignmentLeft));
  text_layer_set_overflow_mode(s_body, GTextOverflowModeWordWrap);
  scroll_layer_add_child(s_scroll, text_layer_get_layer(s_body));
  layer_add_child(root, scroll_layer_get_layer(s_scroll));
#if defined(PBL_ROUND)
  // Must come after the layer is in the window: the flow follows the circle in
  // screen coordinates, and paging scrolls a screenful at a time so no line
  // ends up in the clipped corners.
  text_layer_enable_screen_text_flow_and_paging(s_body, FLOW_INSET);
  scroll_layer_set_paging(s_scroll, true);
#endif

  s_footer = text_layer_create(GRect(FOOTER_INSET, bounds.size.h - FOOTER_H - FOOTER_BOTTOM,
                                     bounds.size.w - (2 * FOOTER_INSET), FOOTER_H));
  text_layer_set_font(s_footer, fonts_get_system_font(FOOTER_FONT));
  text_layer_set_text_alignment(s_footer, GTextAlignmentCenter);
#if defined(PBL_ROUND)
  text_layer_set_overflow_mode(s_footer, GTextOverflowModeWordWrap);
  text_layer_set_background_color(s_footer, GColorClear);
  text_layer_set_text_color(s_footer, GColorDarkGray);
#else
  text_layer_set_background_color(s_footer, PBL_IF_COLOR_ELSE(GColorDarkGray, GColorBlack));
  text_layer_set_text_color(s_footer, GColorWhite);
#endif
  layer_add_child(root, text_layer_get_layer(s_footer));

  comm_set_handlers(prv_on_status, prv_on_text, prv_on_action);
  prv_set_body(comm_answer()[0] ? comm_answer() : S(STR_STATUS_THINKING));
  prv_set_footer("");
}

static void prv_window_unload(Window *window) {
  comm_set_handlers(NULL, NULL, NULL);
  if (s_awaiting) {
    comm_abort();
    s_awaiting = false;
  }
  text_layer_destroy(s_footer);
  text_layer_destroy(s_body);
  scroll_layer_destroy(s_scroll);
  s_footer = NULL;
  s_body = NULL;
  s_scroll = NULL;
}

static void prv_ensure_window(void) {
  if (!s_window) {
    s_window = window_create();
    window_set_window_handlers(s_window, (WindowHandlers) {
      .load = prv_window_load,
      .unload = prv_window_unload,
    });
  }
  if (!window_stack_contains_window(s_window)) {
    window_stack_push(s_window, true);
  }
}

void win_ask_push(const char *question) {
  comm_clear_answer();
  s_question[0] = 0;
  prv_ensure_window();
  if (question && question[0]) {
    prv_send_question(question);
  } else {
    prv_set_body(S(STR_STATUS_LISTENING));
    prv_start_dictation();
  }
}

void win_ask_push_brief(void) {
  comm_clear_answer();
  strncpy(s_question, S(STR_MENU_BRIEF), QUESTION_MAX - 1);
  s_question[QUESTION_MAX - 1] = 0;
  prv_ensure_window();
  if (!comm_connected()) {
    prv_set_body(S(STR_STATUS_NOPHONE));
    return;
  }
  if (!comm_phone_ready()) {
    prv_set_body(S(STR_STATUS_NOKEY));
    return;
  }
  s_awaiting = true;
  prv_set_body(S(STR_STATUS_THINKING));
  comm_brief();
}

// ------------------------------------------------------------ quick phrases

static uint16_t prv_quick_rows(MenuLayer *menu, uint16_t section, void *ctx) {
  return QUICK_COUNT;
}

static void prv_quick_draw(GContext *gctx, const Layer *cell, MenuIndex *idx, void *ctx) {
  menu_cell_basic_draw(gctx, cell, S(s_quick_ids[idx->row]), NULL, NULL);
}

static void prv_quick_select(MenuLayer *menu, MenuIndex *idx, void *ctx) {
  const char *phrase = S(s_quick_ids[idx->row]);
  window_stack_remove(s_quick_window, false);
  win_ask_push(phrase);
}

static void prv_quick_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  const GRect bounds = layer_get_bounds(root);
  s_quick_menu = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_quick_menu, NULL, (MenuLayerCallbacks) {
    .get_num_rows = prv_quick_rows,
    .draw_row = prv_quick_draw,
    .select_click = prv_quick_select,
  });
  menu_layer_set_click_config_onto_window(s_quick_menu, window);
#if defined(PBL_ROUND)
  menu_layer_set_center_focused(s_quick_menu, true);
#endif
#if defined(PBL_COLOR)
  menu_layer_set_highlight_colors(s_quick_menu, GColorOrange, GColorBlack);
#endif
  layer_add_child(root, menu_layer_get_layer(s_quick_menu));
}

static void prv_quick_unload(Window *window) {
  menu_layer_destroy(s_quick_menu);
  s_quick_menu = NULL;
}

void win_ask_push_quick_phrases(void) {
  if (!s_quick_window) {
    s_quick_window = window_create();
    window_set_window_handlers(s_quick_window, (WindowHandlers) {
      .load = prv_quick_load,
      .unload = prv_quick_unload,
    });
  }
  if (!window_stack_contains_window(s_quick_window)) {
    window_stack_push(s_quick_window, true);
  }
}

void win_ask_deinit(void) {
  if (s_quick_window) {
    window_destroy(s_quick_window);
    s_quick_window = NULL;
  }
  if (s_window) {
    window_destroy(s_window);
    s_window = NULL;
  }
#if defined(PBL_MICROPHONE)
  if (s_dictation) {
    dictation_session_destroy(s_dictation);
    s_dictation = NULL;
  }
#endif
}
