#pragma once
#include <pebble.h>

// Pushes the answer window. Pass NULL to start from voice dictation, or a
// question to send straight away.
void win_ask_push(const char *question);
void win_ask_push_brief(void);
void win_ask_push_quick_phrases(void);
void win_ask_deinit(void);
