#include "win_alert.h"
#include "win_list.h"
#include "comm.h"
#include "i18n.h"
#include "sound.h"

#define SNOOZE_SECONDS 300
#define VIBE_REPEATS 6
#define VIBE_INTERVAL_MS 3000

// Gabbro's round 260x260 screen clips the corners, so everything sits lower
// and the hint is lifted off the bottom edge and narrowed (SIDE_INSET).
#if defined(PBL_PLATFORM_GABBRO)
#define KIND_FONT   FONT_KEY_GOTHIC_28_BOLD
#define LABEL_FONT  FONT_KEY_GOTHIC_24
#define HINT_FONT   FONT_KEY_GOTHIC_18
#define KIND_TOP    40
#define KIND_H      38
#define LABEL_TOP   84
#define LABEL_H     90
#define HINT_H      48
#define HINT_BOTTOM 34
#define SIDE_INSET  24
#elif defined(PBL_PLATFORM_EMERY)
#define KIND_FONT   FONT_KEY_GOTHIC_28_BOLD
#define LABEL_FONT  FONT_KEY_GOTHIC_24
#define HINT_FONT   FONT_KEY_GOTHIC_18
#define KIND_TOP    26
#define KIND_H      38
#define LABEL_TOP   72
#define LABEL_H     80
#define HINT_H      48
#else
#define KIND_FONT   FONT_KEY_GOTHIC_24_BOLD
#define LABEL_FONT  FONT_KEY_GOTHIC_18
#define HINT_FONT   FONT_KEY_GOTHIC_14
#define KIND_TOP    16
#define KIND_H      32
#define LABEL_TOP   52
#define LABEL_H     60
#define HINT_H      34
#endif

#ifndef HINT_BOTTOM
#define HINT_BOTTOM 0
#endif
#ifndef SIDE_INSET
#define SIDE_INSET  0
#endif

static Window    *s_window;
static TextLayer *s_kind_layer;
static TextLayer *s_label_layer;
static TextLayer *s_hint_layer;

static AppTimer *s_vibe_timer;
static int       s_vibes_left;
static int       s_slot = -1;
static char      s_label[SCHED_LABEL_LEN];
static char      s_hint[64];

static void prv_stop_vibes(void) {
  if (s_vibe_timer) {
    app_timer_cancel(s_vibe_timer);
    s_vibe_timer = NULL;
  }
  s_vibes_left = 0;
  sound_stop();
}

static void prv_vibe(void *ctx) {
  s_vibe_timer = NULL;
  if (s_vibes_left <= 0) {
    return;
  }
  s_vibes_left--;
  vibes_double_pulse();
  sound_alert();
  light_enable_interaction();
  s_vibe_timer = app_timer_register(VIBE_INTERVAL_MS, prv_vibe, NULL);
}

static void prv_dismiss(ClickRecognizerRef recognizer, void *context) {
  prv_stop_vibes();
  if (s_slot >= 0) {
    store_remove(s_slot);
    comm_sync_schedule();
    win_list_reload();
    s_slot = -1;
  }
  window_stack_remove(s_window, true);
}

static void prv_snooze(ClickRecognizerRef recognizer, void *context) {
  prv_stop_vibes();
  if (s_slot >= 0) {
    const SchedItem *item = store_at(s_slot);
    const SchedKind kind = item ? (SchedKind)item->kind : KIND_REMINDER;
    store_remove(s_slot);
    store_add(kind, time(NULL) + SNOOZE_SECONDS, s_label);
    comm_sync_schedule();
    win_list_reload();
    s_slot = -1;
  }
  window_stack_remove(s_window, true);
}

static void prv_click_config(void *context) {
  window_single_click_subscribe(BUTTON_ID_UP, prv_snooze);
  window_single_click_subscribe(BUTTON_ID_DOWN, prv_dismiss);
  window_single_click_subscribe(BUTTON_ID_SELECT, prv_dismiss);
}

#if defined(PBL_TOUCH)
// Swipes mirror the buttons the hint names: up snoozes, down dismisses. A bare
// tap does nothing, so brushing the screen cannot silence an alarm.
static void prv_swipe(const Recognizer *recognizer, RecognizerEvent event) {
  if (event != RecognizerEvent_Completed) {
    return;
  }
  switch (swipe_recognizer_get_direction(recognizer)) {
    case SwipeDirection_Up:   prv_snooze(NULL, NULL); break;
    case SwipeDirection_Down: prv_dismiss(NULL, NULL); break;
    default: break;
  }
}
#endif

static void prv_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  const GRect bounds = layer_get_bounds(root);

  window_set_background_color(window, PBL_IF_COLOR_ELSE(GColorOrange, GColorWhite));

  s_kind_layer = text_layer_create(GRect(4 + SIDE_INSET, KIND_TOP,
                                            bounds.size.w - 8 - (2 * SIDE_INSET), KIND_H));
  text_layer_set_font(s_kind_layer, fonts_get_system_font(KIND_FONT));
  text_layer_set_background_color(s_kind_layer, GColorClear);
  text_layer_set_text_alignment(s_kind_layer, GTextAlignmentCenter);
  layer_add_child(root, text_layer_get_layer(s_kind_layer));

  s_label_layer = text_layer_create(GRect(6 + SIDE_INSET, LABEL_TOP,
                                             bounds.size.w - 12 - (2 * SIDE_INSET), LABEL_H));
  text_layer_set_font(s_label_layer, fonts_get_system_font(LABEL_FONT));
  text_layer_set_background_color(s_label_layer, GColorClear);
  text_layer_set_text_alignment(s_label_layer, GTextAlignmentCenter);
  text_layer_set_overflow_mode(s_label_layer, GTextOverflowModeWordWrap);
  layer_add_child(root, text_layer_get_layer(s_label_layer));

  s_hint_layer = text_layer_create(GRect(4 + SIDE_INSET, bounds.size.h - HINT_H - HINT_BOTTOM,
                                            bounds.size.w - 8 - (2 * SIDE_INSET), HINT_H));
  text_layer_set_font(s_hint_layer, fonts_get_system_font(HINT_FONT));
  text_layer_set_background_color(s_hint_layer, GColorClear);
  text_layer_set_text_alignment(s_hint_layer, GTextAlignmentCenter);
  layer_add_child(root, text_layer_get_layer(s_hint_layer));

  window_set_click_config_provider(window, prv_click_config);

#if defined(PBL_TOUCH)
  // The window owns the recognizer and frees it on unload.
  window_set_touch_bridge_disabled(window, true);
  window_attach_recognizer(window, swipe_recognizer_create(
      prv_swipe, NULL, SwipeDirection_Up | SwipeDirection_Down));
#endif
}

static void prv_unload(Window *window) {
  prv_stop_vibes();
  text_layer_destroy(s_hint_layer);
  text_layer_destroy(s_label_layer);
  text_layer_destroy(s_kind_layer);
  s_hint_layer = NULL;
  s_label_layer = NULL;
  s_kind_layer = NULL;
}

void win_alert_push(int slot) {
  const SchedItem *item = store_at(slot);
  if (!item || item->kind == KIND_NONE) {
    return;
  }
  s_slot = slot;
  strncpy(s_label, item->label, sizeof(s_label) - 1);
  s_label[sizeof(s_label) - 1] = 0;

  StrId kind_id = STR_FIRE_REMIND;
  if (item->kind == KIND_TIMER) {
    kind_id = STR_FIRE_TIMER;
  } else if (item->kind == KIND_ALARM) {
    kind_id = STR_FIRE_ALARM;
  }

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

  snprintf(s_hint, sizeof(s_hint), "%s\n%s", S(STR_SNOOZE), S(STR_DISMISS));
  text_layer_set_text(s_kind_layer, S(kind_id));
  text_layer_set_text(s_label_layer, s_label);
  text_layer_set_text(s_hint_layer, s_hint);

  prv_stop_vibes();
  s_vibes_left = VIBE_REPEATS;
  prv_vibe(NULL);
}

void win_alert_deinit(void) {
  prv_stop_vibes();
  if (s_window) {
    window_destroy(s_window);
    s_window = NULL;
  }
}
