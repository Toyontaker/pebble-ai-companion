#pragma once
#include <pebble.h>

// Commands sent watch -> phone (REQ_CMD).
typedef enum {
  CMD_ASK   = 1,   // REQ_TEXT holds the question
  CMD_BRIEF = 2,   // ask for the daily briefing
  CMD_PIN   = 3,   // pin the last answer to the timeline, REQ_TEXT is the title
  CMD_SYNC  = 4,   // REQ_TEXT holds the serialised schedule
  CMD_ABORT = 5,   // cancel the in-flight request
  CMD_CONFIRM = 6, // REQ_ARG is 1 for yes, 0 for no (answer to CONFIRM_TEXT)
} CommCmd;

// Status pushed phone -> watch (RES_STATUS).
typedef enum {
  ST_IDLE      = 0,
  ST_THINKING  = 1,
  ST_SEARCHING = 2,
  ST_TOOL      = 3,
  ST_ERROR     = 4,
  ST_PINNING   = 5,
  ST_PINNED    = 6,
  ST_PIN_FAIL  = 7,
} CommStatus;

// Actions the AI asked the watch to perform (ACT_KIND).
typedef enum {
  ACT_TIMER    = 1,
  ACT_ALARM    = 2,
  ACT_REMINDER = 3,
  ACT_PINNED   = 4,   // pin created on the phone, nothing to store
  ACT_CANCEL   = 5,   // ACT_TEXT is the label to match, "*" for everything
} CommAction;

typedef void (*CommStatusHandler)(uint8_t status);
typedef void (*CommTextHandler)(const char *accumulated, bool done);
typedef void (*CommActionHandler)(uint8_t kind, const char *label, time_t when);

void comm_init(void);
void comm_deinit(void);

void comm_set_handlers(CommStatusHandler on_status,
                       CommTextHandler on_text,
                       CommActionHandler on_action);

bool comm_phone_ready(void);          // PebbleKit JS reported an API key
bool comm_connected(void);            // Bluetooth link is up

void comm_ask(const char *question);
void comm_brief(void);
void comm_pin_last(const char *title);
void comm_sync_schedule(void);
void comm_abort(void);
void comm_confirm_reply(bool yes);

const char *comm_answer(void);
void comm_clear_answer(void);
