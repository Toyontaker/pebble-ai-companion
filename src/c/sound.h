#pragma once
#include <pebble.h>

// Speaker cues. No-ops on watches without a speaker (gabbro) and silent
// whenever the user has muted the speaker in Settings or Quiet Time.
// On by default; the phone's "Play sounds" setting turns it off. Persisted on
// the watch so alarms respect it while the phone is out of range.
void sound_init(void);
void sound_set_enabled(bool enabled);

void sound_alert(void);
void sound_answer(void);
void sound_stop(void);
