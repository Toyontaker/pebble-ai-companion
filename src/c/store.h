#pragma once
#include <pebble.h>

#define SCHED_MAX_ITEMS 12
#define SCHED_LABEL_LEN 40

typedef enum {
  KIND_NONE     = 0,
  KIND_TIMER    = 1,
  KIND_ALARM    = 2,
  KIND_REMINDER = 3,
} SchedKind;

typedef struct {
  uint8_t kind;                    // SchedKind; KIND_NONE marks a free slot
  uint8_t active;
  int32_t wakeup_id;               // -1 when not backed by a wakeup
  time_t  fire_at;                 // absolute, UTC
  char    label[SCHED_LABEL_LEN];
} SchedItem;

void store_init(void);
void store_deinit(void);

// Returns the slot index, or -1 when every slot is taken.
int  store_add(SchedKind kind, time_t fire_at, const char *label);
bool store_remove(int index);
// Removes every item whose label contains needle; "*" removes all of kind.
// Pass KIND_NONE to match any kind. Returns how many were removed.
int  store_remove_matching(SchedKind kind, const char *needle);

int  store_count(SchedKind kind);                 // KIND_NONE counts everything
const SchedItem *store_at(int index);             // raw slot access
int  store_nth_of_kind(SchedKind kind, int n);    // slot index of the nth item
int  store_find_by_cookie(int32_t cookie);

void store_expire_past(void);                     // drop items whose time has gone
void store_reschedule_wakeups(void);              // rebuild the wakeup table
void store_update_app_glance(void);               // must be called from deinit

// Serialises the schedule for the phone: "kind,fire_at,label;..."
void store_serialize(char *out, size_t out_len);
