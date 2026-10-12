// Pebble timeline pins. The new Pebble app creates them on the phone as
// local pins (Pebble.insertTimelinePin) and syncs them to the watch. Older
// apps (original Pebble / Rebble) lack that call, so there we fall back to a
// plain PUT to the timeline web API with the user token.

var settings = require('./settings');

var cachedToken = null;

function withToken(callback) {
  if (cachedToken) {
    callback(cachedToken);
    return;
  }
  Pebble.getTimelineToken(
    function (token) {
      cachedToken = token;
      callback(token);
    },
    function (error) {
      console.log('getTimelineToken failed: ' + error);
      callback(null);
    }
  );
}

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
  if (hasLocalPins()) {
    try {
      Pebble.insertTimelinePin(pin);
      console.log('pin ' + pin.id + ' inserted as a local pin');
      callback(true, null);
    } catch (e) {
      console.log('insertTimelinePin failed: ' + e);
      callback(false, String(e));
    }
    return;
  }
  putPinWeb(pin, callback);
}

function putPinWeb(pin, callback) {
  console.log('no local pins in this Pebble app, using the timeline web API');
  withToken(function (token) {
    if (!token) {
      callback(false, 'no timeline token');
      return;
    }
    var url = settings.get('timeline_base') + pin.id;
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-User-Token', token);
    xhr.timeout = 15000;
    xhr.onload = function () {
      var ok = xhr.status >= 200 && xhr.status < 300;
      if (!ok) {
        console.log('pin failed ' + xhr.status + ': ' + xhr.responseText);
      }
      callback(ok, ok ? null : ('HTTP ' + xhr.status));
    };
    xhr.onerror = function () { callback(false, 'network error'); };
    xhr.ontimeout = function () { callback(false, 'timeout'); };
    xhr.send(JSON.stringify(pin));
  });
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
