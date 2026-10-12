#pragma once
#include "store.h"

// Shown when a timer/alarm/reminder fires. `slot` is the store index so the
// item can be dismissed or snoozed.
void win_alert_push(int slot);
void win_alert_deinit(void);
