#include "win_main.h"
#include "win_ask.h"
#include "win_list.h"
#include "store.h"
#include "comm.h"
#include "i18n.h"

#if defined(PBL_PLATFORM_EMERY) || defined(PBL_PLATFORM_GABBRO)
#define ABOUT_FONT FONT_KEY_GOTHIC_24
#else
#define ABOUT_FONT FONT_KEY_GOTHIC_18
#endif

typedef enum {
  ROW_ASK = 0,
  ROW_TIMER,
  ROW_ALARM,
  ROW_REMIND,
  ROW_BRIEF,
  ROW_ABOUT,
  ROW_COUNT,
} MainRow;

static Window    *s_window;
static MenuLayer *s_menu;

static Window      *s_about_window;
static ScrollLayer *s_about_scroll;
static TextLayer   *s_about_text;

static char s_subtitle[32];

// ------------------------------------------------------------------- about

static void prv_about_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  const GRect bounds = layer_get_bounds(root);

  s_about_scroll = scroll_layer_create(bounds);
  scroll_layer_set_click_config_onto_window(s_about_scroll, window);
  scroll_layer_set_shadow_hidden(s_about_scroll, true);

  const int16_t w = bounds.size.w - 8;
  s_about_text = text_layer_create(GRect(4, 0, w, 2000));
  text_layer_set_font(s_about_text, fonts_get_system_font(ABOUT_FONT));
  text_layer_set_background_color(s_about_text, GColorClear);
  text_layer_set_overflow_mode(s_about_text, GTextOverflowModeWordWrap);
  text_layer_set_text_alignment(s_about_text,
                                PBL_IF_ROUND_ELSE(GTextAlignmentCenter, GTextAlignmentLeft));
  text_layer_set_text(s_about_text, S(STR_ABOUT_BODY));

  // Measured after joining the window so the round text flow is applied.
  scroll_layer_add_child(s_about_scroll, text_layer_get_layer(s_about_text));
  layer_add_child(root, scroll_layer_get_layer(s_about_scroll));
#if defined(PBL_ROUND)
  text_layer_enable_screen_text_flow_and_paging(s_about_text, 8);
  scroll_layer_set_paging(s_about_scroll, true);
#endif

  const GSize used = text_layer_get_content_size(s_about_text);
  layer_set_frame(text_layer_get_layer(s_about_text), GRect(4, 0, w, used.h + 12));
  scroll_layer_set_content_size(s_about_scroll, GSize(bounds.size.w, used.h + 12));
}

static void prv_about_unload(Window *window) {
  text_layer_destroy(s_about_text);
  scroll_layer_destroy(s_about_scroll);
  s_about_text = NULL;
  s_about_scroll = NULL;
}

static void prv_push_about(void) {
  if (!s_about_window) {
    s_about_window = window_create();
    window_set_window_handlers(s_about_window, (WindowHandlers) {
      .load = prv_about_load,
      .unload = prv_about_unload,
    });
  }
  if (!window_stack_contains_window(s_about_window)) {
    window_stack_push(s_about_window, true);
  }
}

// -------------------------------------------------------------- main menu

static uint16_t prv_num_rows(MenuLayer *menu, uint16_t section, void *ctx) {
  return ROW_COUNT;
}

static const char *prv_subtitle_for(MainRow row) {
  int count = 0;
  switch (row) {
    case ROW_TIMER:  count = store_count(KIND_TIMER); break;
    case ROW_ALARM:  count = store_count(KIND_ALARM); break;
    case ROW_REMIND: count = store_count(KIND_REMINDER); break;
    default: return NULL;
  }
  if (count == 0) {
    return S(STR_EMPTY_LIST);
  }
  snprintf(s_subtitle, sizeof(s_subtitle), "%d", count);
  return s_subtitle;
}

static void prv_draw_row(GContext *gctx, const Layer *cell, MenuIndex *idx, void *ctx) {
  const MainRow row = (MainRow)idx->row;
  const char *title = "";
  const char *subtitle = NULL;

  switch (row) {
    case ROW_ASK:    title = S(STR_MENU_ASK);    subtitle = S(STR_MENU_ASK_SUB); break;
    case ROW_TIMER:  title = S(STR_MENU_TIMER);  subtitle = prv_subtitle_for(row); break;
    case ROW_ALARM:  title = S(STR_MENU_ALARM);  subtitle = prv_subtitle_for(row); break;
    case ROW_REMIND: title = S(STR_MENU_REMIND); subtitle = prv_subtitle_for(row); break;
    case ROW_BRIEF:  title = S(STR_MENU_BRIEF);  subtitle = S(STR_MENU_BRIEF_SUB); break;
    case ROW_ABOUT:  title = S(STR_MENU_ABOUT);  subtitle = S(STR_MENU_ABOUT_SUB); break;
    default: break;
  }
  menu_cell_basic_draw(gctx, cell, title, subtitle, NULL);
}

static void prv_select(MenuLayer *menu, MenuIndex *idx, void *ctx) {
  switch ((MainRow)idx->row) {
    case ROW_ASK:    win_ask_push(NULL); break;
    case ROW_TIMER:  win_list_push(KIND_TIMER); break;
    case ROW_ALARM:  win_list_push(KIND_ALARM); break;
    case ROW_REMIND: win_list_push(KIND_REMINDER); break;
    case ROW_BRIEF:  win_ask_push_brief(); break;
    case ROW_ABOUT:  prv_push_about(); break;
    default: break;
  }
}

static void prv_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_menu = menu_layer_create(layer_get_bounds(root));
  menu_layer_set_callbacks(s_menu, NULL, (MenuLayerCallbacks) {
    .get_num_rows = prv_num_rows,
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
  menu_layer_destroy(s_menu);
  s_menu = NULL;
}

static void prv_appear(Window *window) {
  if (s_menu) {
    menu_layer_reload_data(s_menu);
  }
}

void win_main_push(void) {
  if (!s_window) {
    s_window = window_create();
    window_set_window_handlers(s_window, (WindowHandlers) {
      .load = prv_load,
      .unload = prv_unload,
      .appear = prv_appear,
    });
  }
  if (!window_stack_contains_window(s_window)) {
    window_stack_push(s_window, true);
  }
}

void win_main_deinit(void) {
  if (s_about_window) {
    window_destroy(s_about_window);
    s_about_window = NULL;
  }
  if (s_window) {
    window_destroy(s_window);
    s_window = NULL;
  }
}
