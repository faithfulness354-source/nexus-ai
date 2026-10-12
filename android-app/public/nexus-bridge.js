(function () {
  var TOKEN_KEY = 'nexus:cloud-token';
  var FALLBACK_ORIGIN = 'http://192.168.88.5:3000';
  if (window.__nexusCloudBridge) return;
  window.__nexusCloudBridge = true;

  var original = window.fetch.bind(window);
  var origin = FALLBACK_ORIGIN;
  window.__NEXUS_API_ORIGIN = origin;

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function remember(value) {
    if (!value) return;
    try { localStorage.setItem(TOKEN_KEY, value); } catch (e) {}
  }

  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }

  function rewrite(url) {
    if (url.indexOf('/nexus-cloud.json') !== -1 || url.indexOf('/nexus-bridge.js') !== -1) return url;
    if (url.indexOf('/api/') === 0 || url.indexOf('/uploads/') === 0) return origin + url;
    var bases = ['https://localhost', 'http://localhost', 'capacitor://localhost'];
    for (var i = 0; i < bases.length; i++) {
      var base = bases[i];
      if (url.indexOf(base + '/api/') === 0 || url.indexOf(base + '/uploads/') === 0) return origin + url.slice(base.length);
    }
    return url;
  }

  function bodyText(init) {
    if (!init || init.body == null) return '';
    if (typeof init.body === 'string') return init.body;
    if (typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams) return init.body.toString();
    return '';
  }

  function credentials(text) {
    if (!text) return null;
    try {
      if (text.charAt(0) === '{') {
        var json = JSON.parse(text);
        if (json && json.email && json.password) return { email: String(json.email), password: String(json.password) };
      }
    } catch (e) {}
    try {
      var params = new URLSearchParams(text);
      var email = params.get('email') || params.get('username') || '';
      var password = params.get('password') || '';
      if (email && password) return { email: email, password: password };
    } catch (e) {}
    return null;
  }

  window.fetch = async function (input, init) {
    var url = requestUrl(input);
    if (url.indexOf('/api/auth/signout') !== -1) clearToken();
    var nextUrl = rewrite(url);
    var headers = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined));
    var saved = token();
    if (saved && nextUrl.indexOf('/api/') !== -1 && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + saved);

    var posted = bodyText(init);
    var login = credentials(posted);
    if (login && /\/api\/auth\/(callback|signin)\/credentials/.test(url)) {
      try {
        var minted = await original(origin + '/api/cloud/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: login.email, password: login.password }),
        });
        var mintedBody = await minted.json().catch(function () { return {}; });
        if (minted.ok && mintedBody && typeof mintedBody.token === 'string') {
          remember(mintedBody.token);
          if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + mintedBody.token);
        }
      } catch (e) {}
    }

    var response;
    if (input instanceof Request && nextUrl !== url) {
      var request = new Request(nextUrl, input);
      headers.forEach(function (value, key) { request.headers.set(key, value); });
      response = await original(request, init);
    } else {
      response = await original(nextUrl, Object.assign({}, init, { headers: headers }));
    }

    if (nextUrl.indexOf('/api/cloud/token') !== -1) {
      try {
        var copy = response.clone();
        var data = await copy.json();
        if (data && typeof data.token === 'string') remember(data.token);
      } catch (e) {}
    }
    return response;
  };

  var seen = '';
  var NAME_KEY = 'nexus.persona.name';

  async function mirrorPersonaName(saved) {
    var response = await original(origin + '/api/personas', {
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + saved },
    });
    if (!response.ok) return false;
    var rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return false;
    var active = rows[0];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].isDefault) active = rows[i];
    }
    var next = active && typeof active.name === 'string' ? active.name.trim().slice(0, 40) : '';
    if (!next) return false;
    var current = '';
    try { current = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
    if (current === next) return false;
    try { localStorage.setItem(NAME_KEY, next); } catch (e) { return false; }
    return true;
  }

  async function poll() {
    try {
      var headers = {};
      var saved = token();
      if (saved) headers.Authorization = 'Bearer ' + saved;
      var response = await original(origin + '/api/cloud/revision', { cache: 'no-store', headers: headers });
      if (!response.ok) return;
      var body = await response.json();
      var revision = body && typeof body.revision === 'string' ? body.revision : '';
      if (!revision || revision === 'signed-out') return;
      var nameChanged = false;
      if (saved) {
        try { nameChanged = await mirrorPersonaName(saved); } catch (e) {}
      }
      if ((seen && seen !== revision) || nameChanged) {
        window.dispatchEvent(new Event('nexus:cloud-revision'));
        var active = document.activeElement;
        var typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!typing) location.reload();
      }
      seen = revision;
    } catch (e) {}
  }
  setInterval(poll, 8000);
  poll();
})();
