#pragma once
#include "store.h"

void win_list_push(SchedKind kind);
void win_list_reload(void);   // no-op when the list is not on screen
void win_list_deinit(void);
