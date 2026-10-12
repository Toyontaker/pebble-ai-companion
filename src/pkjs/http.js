// One place for the XHR plumbing. PebbleKit JS has no fetch and no SDKs, so
// every provider talks raw HTTP through here.

var activeXhr = null;

var REQUEST_TIMEOUT_MS = 60000;

// A CR or LF in a header value is a request-splitting risk, so engines either
// throw or silently drop the whole header — which the server then reports as a
// missing credential. Strip them rather than let that happen.
function headerSafe(value) {
  return String(value).replace(/[\r\n]+/g, '').replace(/^\s+/, '').replace(/\s+$/, '');
}

// headers: { name: value }. Calls onSuccess(parsedJson) or onError(message).
function postJson(url, headers, body, onSuccess, onError) {
  var xhr = new XMLHttpRequest();
  activeXhr = xhr;

  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  var names = [];
  for (var name in headers) {
    if (!headers.hasOwnProperty(name)) {
      continue;
    }
    var value = headerSafe(headers[name]);
    if (!value) {
      console.log('header ' + name + ' is empty, not sending it');
      continue;
    }
    try {
      xhr.setRequestHeader(name, value);
      names.push(name);
    } catch (e) {
      console.log('could not set header ' + name + ': ' + e);
    }
  }
  console.log('POST ' + url + ' [' + names.join(', ') + ']');

  xhr.timeout = REQUEST_TIMEOUT_MS;

  xhr.onload = function () {
    activeXhr = null;
    if (xhr.status < 200 || xhr.status >= 300) {
      onError(describeError(xhr));
      return;
    }
    try {
      onSuccess(JSON.parse(xhr.responseText));
    } catch (e) {
      onError('Could not parse the response.');
    }
  };
  xhr.onerror = function () { activeXhr = null; onError('Network error.'); };
  xhr.ontimeout = function () { activeXhr = null; onError('The request timed out.'); };

  xhr.send(JSON.stringify(body));
}

// Providers disagree about where the message lives; try the common shapes
// before falling back to the status line.
function describeError(xhr) {
  try {
    var parsed = JSON.parse(xhr.responseText);
    var err = parsed.error || parsed;
    if (typeof err === 'string') {
      return err;
    }
    if (err && err.message) {
      return err.message;
    }
  } catch (e) { /* fall through to the status line */ }
  return 'HTTP ' + xhr.status;
}

function abort() {
  if (activeXhr) {
    try {
      activeXhr.abort();
    } catch (e) { /* already finished */ }
    activeXhr = null;
  }
}

module.exports = {
  postJson: postJson,
  abort: abort
};
