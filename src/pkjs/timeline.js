// Pebble timeline pins, created on the phone as local pins
// (Pebble.insertTimelinePin) and synced to the watch by the Pebble app. The
// appstore does not support the timeline web API, so there is no fallback:
// a phone app without local pins just reports that pinning is unavailable.

function iso(date) {
  return date.toISOString().split('.')[0] + 'Z';
}

// Builds a pin. `when` is a Date; `remindBefore` is minutes (0 disables).
function buildPin(id, when, title, body, remindBefore) {
  var pin = {
    id: id,
    time: iso(when),
    layout: {
      type: 'genericPin',
      title: title.substring(0, 64),
      tinyIcon: 'system://images/NOTIFICATION_FLAG'
    }
  };
  if (body) {
    pin.layout.body = body.substring(0, 512);
  }
  if (remindBefore > 0) {
    pin.reminders = [{
      time: iso(new Date(when.getTime() - (remindBefore * 60000))),
      layout: {
        type: 'genericReminder',
        title: title.substring(0, 64),
        tinyIcon: 'system://images/ALARM_CLOCK'
      }
    }];
  }
  return pin;
}

// Local pins: no token or network needed. The docs describe no callback or
// return value, so a call that does not throw counts as success.
function hasLocalPins() {
  return typeof Pebble.insertTimelinePin === 'function';
}

function putPin(pin, callback) {
  if (!hasLocalPins()) {
    console.log('this Pebble app has no local pins; update the Pebble phone app');
    callback(false, 'timeline pins need the current Pebble phone app');
    return;
  }
  try {
    Pebble.insertTimelinePin(pin);
    console.log('pin ' + pin.id + ' inserted as a local pin');
    callback(true, null);
  } catch (e) {
    console.log('insertTimelinePin failed: ' + e);
    callback(false, String(e));
  }
}

function newId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

module.exports = {
  buildPin: buildPin,
  putPin: putPin,
  newId: newId,
  iso: iso
};
