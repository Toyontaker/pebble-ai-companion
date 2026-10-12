#include "win_list.h"
#include "win_ask.h"
#include "comm.h"
#include "i18n.h"

static Window   *s_window;
static MenuLayer *s_menu;
static SchedKind s_kind = KIND_TIMER;
static bool      s_ticking;

static NumberWindow *s_nw_minutes;
static NumberWindow *s_nw_hour;
static NumberWindow *s_nw_minute;
static int32_t       s_pending_hour;

static char s_title[SCHED_LABEL_LEN];
static char s_sub[32];
static char s_header[40];

// ------------------------------------------------------------------ helpers

static StrId prv_title_id(void) {
  switch (s_kind) {
    case KIND_ALARM:    return STR_TITLE_ALARM;
    case KIND_REMINDER: return STR_TITLE_REMIND;
    default:            return STR_TITLE_TIMER;
  }
}

static StrId prv_add_id(void) {
  switch (s_kind) {
    case KIND_ALARM:    return STR_ADD_ALARM;
    case KIND_REMINDER: return STR_ADD_ASKAI;
    default:            return STR_ADD_TIMER;
  }
}

static void prv_format_when(const SchedItem *item, char *out, size_t out_len) {
  const time_t now = time(NULL);
  if (s_kind == KIND_TIMER) {
    long remaining = (long)(item->fire_at - now);
    if (remaining < 0) {
      remaining = 0;
    }
    snprintf(out, out_len, "%ld:%02ld", remaining / 60, remaining % 60);
    return;
  }
  struct tm *t = localtime(&item->fire_at);
  const bool today = (item->fire_at - now) < 12 * 60 * 60;
  strftime(out, out_len, today ? "%H:%M" : "%m/%d %H:%M", t);
}

static void prv_tick(struct tm *tick_time, TimeUnits units_changed) {
  win_list_reload();
}

static void prv_set_tick(bool on) {
  if (on == s_ticking) {
    return;
  }
  if (on) {
    tick_timer_service_subscribe(SECOND_UNIT, prv_tick);
  } else {
    tick_timer_service_unsubscribe();
  }
  s_ticking = on;
}

// --------------------------------------------------------------- number flow

static void prv_minutes_selected(NumberWindow *nw, void *context) {
  const int32_t minutes = number_window_get_value(nw);
  store_add(KIND_TIMER, time(NULL) + (minutes * 60), "");
  comm_sync_schedule();
  window_stack_remove(number_window_get_window(nw), false);
  win_list_reload();
}

static void prv_push_minutes(void) {
  if (!s_nw_minutes) {
    s_nw_minutes = number_window_create(S(STR_NUM_MINUTES), (NumberWindowCallbacks) {
      .selected = prv_minutes_selected,
    }, NULL);
    number_window_set_min(s_nw_minutes, 1);
    number_window_set_max(s_nw_minutes, 180);
    number_window_set_step_size(s_nw_minutes, 1);
  }
  number_window_set_value(s_nw_minutes, 10);
  window_stack_push(number_window_get_window(s_nw_minutes), true);
}

static void prv_minute_selected(NumberWindow *nw, void *context) {
  const int32_t minute = number_window_get_value(nw);

  const time_t now = time(NULL);
  struct tm t = *localtime(&now);
  t.tm_hour = s_pending_hour;
  t.tm_min = minute;
  t.tm_sec = 0;
  time_t fire_at = mktime(&t);
  if (fire_at <= now) {
    fire_at += 24 * 60 * 60;
  }

  store_add(KIND_ALARM, fire_at, "");
  comm_sync_schedule();
  window_stack_remove(number_window_get_window(nw), false);
  win_list_reload();
}

static void prv_hour_selected(NumberWindow *nw, void *context) {
  s_pending_hour = number_window_get_value(nw);
  if (!s_nw_minute) {
    s_nw_minute = number_window_create(S(STR_NUM_MINUTE), (NumberWindowCallbacks) {
      .selected = prv_minute_selected,
    }, NULL);
    number_window_set_min(s_nw_minute, 0);
    number_window_set_max(s_nw_minute, 55);
    number_window_set_step_size(s_nw_minute, 5);
  }
  number_window_set_value(s_nw_minute, 0);
  window_stack_remove(number_window_get_window(nw), false);
  window_stack_push(number_window_get_window(s_nw_minute), true);
}

static void prv_push_hour(void) {
  if (!s_nw_hour) {
    s_nw_hour = number_window_create(S(STR_NUM_HOUR), (NumberWindowCallbacks) {
      .selected = prv_hour_selected,
    }, NULL);
    number_window_set_min(s_nw_hour, 0);
    number_window_set_max(s_nw_hour, 23);
    number_window_set_step_size(s_nw_hour, 1);
  }
  const time_t now = time(NULL);
  number_window_set_value(s_nw_hour, (localtime(&now)->tm_hour + 1) % 24);
  window_stack_push(number_window_get_window(s_nw_hour), true);
}

// ------------------------------------------------------------ menu callbacks

static uint16_t prv_num_rows(MenuLayer *menu, uint16_t section, void *ctx) {
  return store_count(s_kind) + 1;
}

static int16_t prv_header_height(MenuLayer *menu, uint16_t section, void *ctx) {
  return MENU_CELL_BASIC_HEADER_HEIGHT;
}

static void prv_draw_header(GContext *gctx, const Layer *cell, uint16_t section, void *ctx) {
  snprintf(s_header, sizeof(s_header), "%s", S(prv_title_id()));
#if defined(PBL_ROUND)
  // The basic header is left-aligned, which the round bezel clips. Centre it.
  const GRect bounds = layer_get_bounds(cell);
  graphics_context_set_text_color(gctx, GColorBlack);
  graphics_draw_text(gctx, s_header, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD),
                     GRect(0, -2, bounds.size.w, bounds.size.h + 2),
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);
#else
  menu_cell_basic_header_draw(gctx, cell, s_header);
#endif
}

static void prv_draw_row(GContext *gctx, const Layer *cell, MenuIndex *idx, void *ctx) {
  const int count = store_count(s_kind);
  if (idx->row >= count) {
    menu_cell_basic_draw(gctx, cell, S(prv_add_id()), NULL, NULL);
    return;
  }
  const int slot = store_nth_of_kind(s_kind, idx->row);
  const SchedItem *item = store_at(slot);
  if (!item) {
    return;
  }
  prv_format_when(item, s_sub, sizeof(s_sub));
  if (item->label[0]) {
    snprintf(s_title, sizeof(s_title), "%s", item->label);
    menu_cell_basic_draw(gctx, cell, s_title, s_sub, NULL);
  } else {
    menu_cell_basic_draw(gctx, cell, s_sub, NULL, NULL);
  }
}

static void prv_select(MenuLayer *menu, MenuIndex *idx, void *ctx) {
  const int count = store_count(s_kind);
  if (idx->row >= count) {
    switch (s_kind) {
      case KIND_TIMER:    prv_push_minutes(); break;
      case KIND_ALARM:    prv_push_hour(); break;
      case KIND_REMINDER: win_ask_push(NULL); break;
      default: break;
    }
    return;
  }
  const int slot = store_nth_of_kind(s_kind, idx->row);
  if (store_remove(slot)) {
    vibes_short_pulse();
    comm_sync_schedule();
    win_list_reload();
  }
}

// ------------------------------------------------------------ window plumbing

static void prv_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_menu = menu_layer_create(layer_get_bounds(root));
  menu_layer_set_callbacks(s_menu, NULL, (MenuLayerCallbacks) {
    .get_num_rows = prv_num_rows,
    .get_header_height = prv_header_height,
    .draw_header = prv_draw_header,
    .draw_row = prv_draw_row,
    .select_click = prv_select,
  });
  menu_layer_set_click_config_onto_window(s_menu, window);
#if defined(PBL_ROUND)
  menu_layer_set_center_focused(s_menu, true);
#endif
#if defined(PBL_COLOR)
  menu_layer_set_highlight_colors(s_menu, GColorOrange, GColorBlack);
#endif
  layer_add_child(root, menu_layer_get_layer(s_menu));
}

static void prv_unload(Window *window) {
  prv_set_tick(false);
  menu_layer_destroy(s_menu);
  s_menu = NULL;
}

static void prv_appear(Window *window) {
  prv_set_tick(s_kind == KIND_TIMER);
  win_list_reload();
}

static void prv_disappear(Window *window) {
  prv_set_tick(false);
}

void win_list_push(SchedKind kind) {
  s_kind = kind;
  if (!s_window) {
    s_window = window_create();
    window_set_window_handlers(s_window, (WindowHandlers) {
      .load = prv_load,
      .unload = prv_unload,
      .appear = prv_appear,
      .disappear = prv_disappear,
    });
  }
  if (!window_stack_contains_window(s_window)) {
    window_stack_push(s_window, true);
  } else {
    win_list_reload();
  }
}

void win_list_reload(void) {
  if (s_menu) {
    menu_layer_reload_data(s_menu);
  }
}

void win_list_deinit(void) {
  if (s_nw_minutes) { number_window_destroy(s_nw_minutes); s_nw_minutes = NULL; }
  if (s_nw_hour)    { number_window_destroy(s_nw_hour);    s_nw_hour = NULL; }
  if (s_nw_minute)  { number_window_destroy(s_nw_minute);  s_nw_minute = NULL; }
  if (s_window)     { window_destroy(s_window);            s_window = NULL; }
}
