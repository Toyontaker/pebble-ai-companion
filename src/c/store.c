#include "store.h"

#define PERSIST_KEY_VERSION 100
#define PERSIST_KEY_ITEM_BASE 200
#define STORE_VERSION 1

// The firmware allows at most 8 pending wakeups per app, and refuses two that
// land within a minute of each other, so the table is a best-effort projection
// of the schedule rather than a mirror of it.
#define WAKEUP_MAX 8
#define WAKEUP_MIN_GAP 60

static SchedItem s_items[SCHED_MAX_ITEMS];

static void prv_save_slot(int i) {
  persist_write_data(PERSIST_KEY_ITEM_BASE + i, &s_items[i], sizeof(SchedItem));
}

void store_init(void) {
  memset(s_items, 0, sizeof(s_items));
  if (persist_read_int(PERSIST_KEY_VERSION) != STORE_VERSION) {
    for (int i = 0; i < SCHED_MAX_ITEMS; i++) {
      persist_delete(PERSIST_KEY_ITEM_BASE + i);
    }
    persist_write_int(PERSIST_KEY_VERSION, STORE_VERSION);
    return;
  }
  for (int i = 0; i < SCHED_MAX_ITEMS; i++) {
    if (persist_exists(PERSIST_KEY_ITEM_BASE + i)) {
      persist_read_data(PERSIST_KEY_ITEM_BASE + i, &s_items[i], sizeof(SchedItem));
    }
  }
  store_expire_past();
}

void store_deinit(void) {
  for (int i = 0; i < SCHED_MAX_ITEMS; i++) {
    prv_save_slot(i);
  }
}

int store_add(SchedKind kind, time_t fire_at, const char *label) {
  for (int i = 0; i < SCHED_MAX_ITEMS; i++) {
    if (s_items[i].kind != KIND_NONE) {
      continue;
    }
    s_items[i].kind = (uint8_t)kind;
    s_items[i].active = 1;
    s_items[i].wakeup_id = -1;
    s_items[i].fire_at = fire_at;
    strncpy(s_items[i].label, label ? label : "", SCHED_LABEL_LEN - 1);
    s_items[i].label[SCHED_LABEL_LEN - 1] = 0;
    prv_save_slot(i);
    store_reschedule_wakeups();
    return i;
  }
  return -1;
}

bool store_remove(int index) {
  if (index < 0 || index >= SCHED_MAX_ITEMS || s_items[index].kind == KIND_NONE) {
    return false;
  }
  if (s_items[index].wakeup_id >= 0) {
    wakeup_cancel(s_items[index].wakeup_id);
  }
  memset(&s_items[index], 0, sizeof(SchedItem));
  prv_save_slot(index);
  store_reschedule_wakeups();
  return true;
}

int store_remove_matching(SchedKind kind, const char *needle) {
  const bool match_all = (needle == NULL) || (needle[0] == 0) ||
                         (needle[0] == '*' && needle[1] == 0);
  int removed = 0;
  for (int i = 0; i < SCHED_MAX_ITEMS; i++) {
    if (s_items[i].kind == KIND_NONE) {
      continue;
    }
    if (kind != KIND_NONE && s_items[i].kind != (uint8_t)kind) {
      continue;
    }
    if (!match_all && strstr(s_items[i].label, needle) == NULL) {
      continue;
    }
    if (s_items[i].wakeup_id >= 0) {
      wakeup_cancel(s_items[i].wakeup_id);
    }
    memset(&s_items[i], 0, sizeof(SchedItem));
    prv_save_slot(i);
    removed++;
  }
  if (removed > 0) {
    store_reschedule_wakeups();
  }
  return removed;
}

int store_count(SchedKind kind) {
  int n = 0;
  for (int i = 0; i < SCHED_MAX_ITEMS; i++) {
    if (s_items[i].kind == KIND_NONE) {
      continue;
    }
    if (kind == KIND_NONE || s_items[i].kind == (uint8_t)kind) {
      n++;
    }
  }
  return n;
}

const SchedItem *store_at(int index) {
  if (index < 0 || index >= SCHED_MAX_ITEMS) {
    return NULL;
  }
  return &s_items[index];
}

int store_nth_of_kind(SchedKind kind, int n) {
  // Slots are presented soonest-first so the list reads naturally.
  int order[SCHED_MAX_ITEMS];
  int count = 0;
  for (int i = 0; i < SCHED_MAX_ITEMS; i++) {
    if (s_items[i].kind == KIND_NONE) {
      continue;
    }
    if (kind != KIND_NONE && s_items[i].kind != (uint8_t)kind) {
      continue;
    }
    int pos = count++;
    while (pos > 0 && s_items[order[pos - 1]].fire_at > s_items[i].fire_at) {
      order[pos] = order[pos - 1];
      pos--;
    }
    order[pos] = i;
  }
  if (n < 0 || n >= count) {
    return -1;
  }
  return order[n];
}

int store_find_by_cookie(int32_t cookie) {
  if (cookie < 0 || cookie >= SCHED_MAX_ITEMS) {
    return -1;
  }
  return (s_items[cookie].kind == KIND_NONE) ? -1 : (int)cookie;
}

void store_expire_past(void) {
  const time_t now = time(NULL);
  bool dirty = false;
  for (int i = 0; i < SCHED_MAX_ITEMS; i++) {
    if (s_items[i].kind != KIND_NONE && s_items[i].fire_at <= now - 60) {
      memset(&s_items[i], 0, sizeof(SchedItem));
      prv_save_slot(i);
      dirty = true;
    }
  }
  if (dirty) {
    store_reschedule_wakeups();
  }
}

void store_reschedule_wakeups(void) {
  wakeup_cancel_all();
  for (int i = 0; i < SCHED_MAX_ITEMS; i++) {
    s_items[i].wakeup_id = -1;
  }

  const time_t now = time(NULL);
  int scheduled = 0;
  time_t last_time = 0;

  for (int n = 0; n < SCHED_MAX_ITEMS && scheduled < WAKEUP_MAX; n++) {
    const int idx = store_nth_of_kind(KIND_NONE, n);
    if (idx < 0) {
      break;
    }
    time_t when = s_items[idx].fire_at;
    if (when <= now + 2) {
      continue;
    }
    // The firmware rejects a wakeup landing within a minute of another one, so
    // nudge a colliding item later rather than dropping it entirely.
    if (scheduled > 0 && when - last_time < WAKEUP_MIN_GAP) {
      when = last_time + WAKEUP_MIN_GAP;
    }
    const WakeupId id = wakeup_schedule(when, (int32_t)idx, true);
    if (id >= 0) {
      s_items[idx].wakeup_id = id;
      prv_save_slot(idx);
      last_time = when;
      scheduled++;
    } else {
      APP_LOG(APP_LOG_LEVEL_WARNING, "wakeup_schedule failed for slot %d: %d", idx, (int)id);
    }
  }
}

static char s_glance_subtitle[SCHED_LABEL_LEN + 24];

static void prv_glance_reload(AppGlanceReloadSession *session, size_t limit, void *context) {
  if (limit < 1) {
    return;
  }
  const int idx = store_nth_of_kind(KIND_NONE, 0);
  if (idx < 0) {
    return;
  }
  const SchedItem *item = &s_items[idx];

  struct tm *t = localtime(&item->fire_at);
  char hhmm[8];
  strftime(hhmm, sizeof(hhmm), "%H:%M", t);
  snprintf(s_glance_subtitle, sizeof(s_glance_subtitle), "%s %s", hhmm, item->label);

  const AppGlanceSlice slice = {
    .layout = {
      .icon = APP_GLANCE_SLICE_DEFAULT_ICON,
      .subtitle_template_string = s_glance_subtitle,
    },
    .expiration_time = item->fire_at + 60,
  };
  app_glance_add_slice(session, slice);
}

void store_update_app_glance(void) {
  app_glance_reload(prv_glance_reload, NULL);
}

void store_serialize(char *out, size_t out_len) {
  out[0] = 0;
  size_t used = 0;
  for (int n = 0; n < SCHED_MAX_ITEMS; n++) {
    const int idx = store_nth_of_kind(KIND_NONE, n);
    if (idx < 0) {
      break;
    }
    char row[SCHED_LABEL_LEN + 32];
    const int len = snprintf(row, sizeof(row), "%u,%ld,%s;",
                             (unsigned)s_items[idx].kind,
                             (long)s_items[idx].fire_at,
                             s_items[idx].label);
    if (len < 0 || used + (size_t)len >= out_len) {
      break;
    }
    strcpy(out + used, row);
    used += (size_t)len;
  }
}
