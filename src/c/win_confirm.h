#pragma once
#include <pebble.h>

// Yes/no screen the phone raises before a destructive tool call (calendar
// update or delete). The answer goes back with comm_confirm_reply().
void win_confirm_push(const char *question);
void win_confirm_deinit(void);
