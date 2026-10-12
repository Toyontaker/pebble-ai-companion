#include "sound.h"

#define PERSIST_KEY_SOUND 102

static bool s_enabled = true;

void sound_init(void) {
  if (persist_exists(PERSIST_KEY_SOUND)) {
    s_enabled = persist_read_bool(PERSIST_KEY_SOUND);
  }
}

void sound_set_enabled(bool enabled) {
  s_enabled = enabled;
  persist_write_bool(PERSIST_KEY_SOUND, enabled);
}

#if defined(PBL_SPEAKER)

#define ALERT_VOLUME  80
#define ANSWER_VOLUME 40

// Rising C-E-G, played once per vibe repeat while an alert is up.
static const SpeakerNote s_alert_notes[] = {
  { .midi_note = 72, .waveform = SpeakerWaveformSquare, .duration_ms = 140, .velocity = 0 },
  { .midi_note = 76, .waveform = SpeakerWaveformSquare, .duration_ms = 140, .velocity = 0 },
  { .midi_note = 79, .waveform = SpeakerWaveformSquare, .duration_ms = 220, .velocity = 0 },
};

// Soft two-note chime when an answer finishes arriving.
static const SpeakerNote s_answer_notes[] = {
  { .midi_note = 84, .waveform = SpeakerWaveformSine, .duration_ms = 90,  .velocity = 0 },
  { .midi_note = 91, .waveform = SpeakerWaveformSine, .duration_ms = 150, .velocity = 0 },
};

#define COUNT(a) (uint32_t)(sizeof(a) / sizeof((a)[0]))

static void prv_play(const SpeakerNote *notes, uint32_t count, uint8_t volume) {
  if (!s_enabled || speaker_is_muted()) {
    return;
  }
  speaker_play_notes(notes, count, volume);
}

void sound_alert(void) {
  prv_play(s_alert_notes, COUNT(s_alert_notes), ALERT_VOLUME);
}

void sound_answer(void) {
  prv_play(s_answer_notes, COUNT(s_answer_notes), ANSWER_VOLUME);
}

void sound_stop(void) {
  speaker_stop();
}

#else

void sound_alert(void) {}
void sound_answer(void) {}
void sound_stop(void) {}

#endif
