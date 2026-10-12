#include "comm.h"
#include "store.h"
#include "i18n.h"
#include "win_confirm.h"
#include "sound.h"

#define ANSWER_MAX 1024
#define OUTBOX_TEXT_MAX 256
#define PERSIST_KEY_LANG 101

static char s_answer[ANSWER_MAX];
static size_t s_answer_len;

static CommStatusHandler s_on_status;
static CommTextHandler s_on_text;
static CommActionHandler s_on_action;

static bool s_phone_ready;

// The outbox holds one message at a time; queue a single retry rather than
// dropping a request when a send is already in flight.
static struct {
  bool     pending;
  uint8_t  cmd;
  int32_t  arg;
  char     text[OUTBOX_TEXT_MAX];
} s_queued;

static AppTimer *s_retry_timer;

static void prv_flush_queue(void *ctx);

// arg < 0 means no REQ_ARG.
static void prv_send_arg(uint8_t cmd, const char *text, int32_t arg) {
  DictionaryIterator *out;
  const AppMessageResult res = app_message_outbox_begin(&out);
  if (res != APP_MSG_OK) {
    s_queued.pending = true;
    s_queued.cmd = cmd;
    s_queued.arg = arg;
    strncpy(s_queued.text, text ? text : "", OUTBOX_TEXT_MAX - 1);
    s_queued.text[OUTBOX_TEXT_MAX - 1] = 0;
    if (!s_retry_timer) {
      s_retry_timer = app_timer_register(300, prv_flush_queue, NULL);
    }
    return;
  }
  dict_write_uint8(out, MESSAGE_KEY_REQ_CMD, cmd);
  if (text) {
    dict_write_cstring(out, MESSAGE_KEY_REQ_TEXT, text);
  }
  if (arg >= 0) {
    dict_write_int32(out, MESSAGE_KEY_REQ_ARG, arg);
  }
  app_message_outbox_send();
}

static void prv_send(uint8_t cmd, const char *text) {
  prv_send_arg(cmd, text, -1);
}

static void prv_flush_queue(void *ctx) {
  s_retry_timer = NULL;
  if (!s_queued.pending) {
    return;
  }
  s_queued.pending = false;
  prv_send_arg(s_queued.cmd, s_queued.text, s_queued.arg);
}

static void prv_append_text(const char *chunk) {
  if (!chunk) {
    return;
  }
  const size_t len = strlen(chunk);
  if (s_answer_len + len >= ANSWER_MAX) {
    return;
  }
  memcpy(s_answer + s_answer_len, chunk, len);
  s_answer_len += len;
  s_answer[s_answer_len] = 0;
}

static void prv_apply_action(uint8_t kind, const char *label, time_t when) {
  bool changed = true;
  switch (kind) {
    case ACT_TIMER:
      store_add(KIND_TIMER, when, label);
      break;
    case ACT_ALARM:
      store_add(KIND_ALARM, when, label);
      break;
    case ACT_REMINDER:
      store_add(KIND_REMINDER, when, label);
      break;
    case ACT_CANCEL:
      store_remove_matching(KIND_NONE, label);
      break;
    case ACT_PINNED:
    default:
      changed = false;
      break;
  }
  // The phone keeps a copy of the schedule to answer questions about it, so it
  // has to hear about the change it just asked for.
  if (changed) {
    comm_sync_schedule();
  }
  if (s_on_action) {
    s_on_action(kind, label, when);
  }
}

static void prv_inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *t;

  if ((t = dict_find(iter, MESSAGE_KEY_CFG_LANG))) {
    const Lang lang = (t->value->int32 == 1) ? LANG_EN : LANG_JA;
    i18n_set_lang(lang);
    persist_write_int(PERSIST_KEY_LANG, (int32_t)lang);
  }

  if ((t = dict_find(iter, MESSAGE_KEY_CFG_SOUND))) {
    sound_set_enabled(t->value->int32 != 0);
  }

  if ((t = dict_find(iter, MESSAGE_KEY_READY))) {
    s_phone_ready = (t->value->int32 != 0);
    comm_sync_schedule();
  }

  if ((t = dict_find(iter, MESSAGE_KEY_RES_STATUS))) {
    const uint8_t status = (uint8_t)t->value->int32;
    if (status == ST_THINKING) {
      comm_clear_answer();
    }
    if (s_on_status) {
      s_on_status(status);
    }
  }

  if ((t = dict_find(iter, MESSAGE_KEY_RES_TEXT))) {
    prv_append_text(t->value->cstring);
    Tuple *more = dict_find(iter, MESSAGE_KEY_RES_MORE);
    const bool done = !(more && more->value->int32 != 0);
    if (s_on_text) {
      s_on_text(s_answer, done);
    }
  }

  if ((t = dict_find(iter, MESSAGE_KEY_CONFIRM_TEXT))) {
    win_confirm_push(t->value->cstring);
  }

  if ((t = dict_find(iter, MESSAGE_KEY_ACT_KIND))) {
    const uint8_t kind = (uint8_t)t->value->int32;
    Tuple *time_tuple = dict_find(iter, MESSAGE_KEY_ACT_TIME);
    Tuple *label_tuple = dict_find(iter, MESSAGE_KEY_ACT_TEXT);
    const time_t when = time_tuple ? (time_t)time_tuple->value->int32 : 0;
    prv_apply_action(kind, label_tuple ? label_tuple->value->cstring : "", when);
  }
}

static void prv_inbox_dropped(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "inbox dropped: %d", (int)reason);
}

static void prv_outbox_failed(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_ERROR, "outbox failed: %d", (int)reason);
}

static void prv_outbox_sent(DictionaryIterator *iter, void *context) {
  if (s_queued.pending && !s_retry_timer) {
    s_retry_timer = app_timer_register(50, prv_flush_queue, NULL);
  }
}

void comm_init(void) {
  if (persist_exists(PERSIST_KEY_LANG)) {
    i18n_set_lang((Lang)persist_read_int(PERSIST_KEY_LANG));
  } else {
    i18n_init_from_system();
  }
  app_message_register_inbox_received(prv_inbox_received);
  app_message_register_inbox_dropped(prv_inbox_dropped);
  app_message_register_outbox_failed(prv_outbox_failed);
  app_message_register_outbox_sent(prv_outbox_sent);
  app_message_open(1024, 512);
}

void comm_deinit(void) {
  if (s_retry_timer) {
    app_timer_cancel(s_retry_timer);
    s_retry_timer = NULL;
  }
  app_message_deregister_callbacks();
}

void comm_set_handlers(CommStatusHandler on_status,
                       CommTextHandler on_text,
                       CommActionHandler on_action) {
  s_on_status = on_status;
  s_on_text = on_text;
  s_on_action = on_action;
}

bool comm_phone_ready(void) {
  return s_phone_ready;
}

bool comm_connected(void) {
  return connection_service_peek_pebble_app_connection();
}

void comm_ask(const char *question) {
  comm_clear_answer();
  prv_send(CMD_ASK, question);
}

void comm_brief(void) {
  comm_clear_answer();
  prv_send(CMD_BRIEF, "");
}

void comm_pin_last(const char *title) {
  prv_send(CMD_PIN, title);
}

void comm_sync_schedule(void) {
  char buf[OUTBOX_TEXT_MAX];
  store_serialize(buf, sizeof(buf));
  prv_send(CMD_SYNC, buf);
}

void comm_abort(void) {
  prv_send(CMD_ABORT, "");
}

void comm_confirm_reply(bool yes) {
  prv_send_arg(CMD_CONFIRM, "", yes ? 1 : 0);
}

const char *comm_answer(void) {
  return s_answer;
}

void comm_clear_answer(void) {
  s_answer[0] = 0;
  s_answer_len = 0;
}
