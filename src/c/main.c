#include <pebble.h>
#include "comm.h"
#include "store.h"
#include "i18n.h"
#include "win_main.h"
#include "win_ask.h"
#include "win_list.h"
#include "win_alert.h"
#include "win_confirm.h"
#include "sound.h"

static void prv_wakeup_handler(WakeupId wakeup_id, int32_t cookie) {
  const int slot = store_find_by_cookie(cookie);
  if (slot >= 0) {
    win_alert_push(slot);
  }
}

static void prv_handle_launch(void) {
  switch (launch_reason()) {
    case APP_LAUNCH_WAKEUP: {
      WakeupId id = 0;
      int32_t cookie = 0;
      if (wakeup_get_launch_event(&id, &cookie)) {
        const int slot = store_find_by_cookie(cookie);
        if (slot >= 0) {
          win_alert_push(slot);
          return;
        }
      }
      break;
    }
    case APP_LAUNCH_QUICK_LAUNCH:
      // Holding the quick-launch button should drop straight into dictation.
      win_ask_push(NULL);
      return;
    default:
      break;
  }
}

static void prv_init(void) {
#if defined(PBL_TOUCH)
  // Third-party apps are opted out of the system touch bridge by default.
  // Opting in makes the menus and scroll views follow swipes and taps.
  app_touch_navigation_enable(true);
#endif
  store_init();
  sound_init();
  comm_init();
  wakeup_service_subscribe(prv_wakeup_handler);

  win_main_push();
  prv_handle_launch();

  // Give the phone the current schedule so the AI can answer questions about it.
  comm_sync_schedule();
}

static void prv_deinit(void) {
  win_confirm_deinit();
  win_alert_deinit();
  win_list_deinit();
  win_ask_deinit();
  win_main_deinit();
  comm_deinit();
  store_update_app_glance();
  store_deinit();
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
  return 0;
}
