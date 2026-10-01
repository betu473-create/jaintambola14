/* ============================================================
   जैन ताम्बोला — NET  (relay transport, PeerJS jaisa API)
   ------------------------------------------------------------
   Agar JT_CONFIG.RELAY_URL set hai  ->  Cloudflare WebSocket relay
   Agar set nahi hai                 ->  wahi purana PeerJS chalta hai

   API bilkul PeerJS jaisa hai:
     var peer = new Peer() / new Peer('JT-ABC123');
     peer.on('open'|'error'|'connection', cb);
     var conn = peer.connect('JT-ABC123', {reliable:true});
     conn.peer; conn.send(obj); conn.on('open'|'data'|'close', cb);
     peer.destroy();
   ============================================================ */
(function () {
  var Real = window.Peer;

  function relayUrl() {
    var u = '';
    try { u = window.JT_RELAY_URL || (window.JT_CONFIG && window.JT_CONFIG.RELAY_URL) || ''; } catch (e) {}
    u = String(u || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    u = u.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    if (!/^wss?:/i.test(u)) u = 'wss://' + u;
    return u;
  }
  function uid() { return 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function mk(o) {
    o = o || {};
    o._h = {};
    o.on = function (ev, cb) { (this._h[ev] = this._h[ev] || []).push(cb); return this; };
    o._emit = function (ev, a) { (this._h[ev] || []).slice().forEach(function (cb) { try { cb(a); } catch (e) {} }); };
    return o;
  }

  function RelayConn(peerId, sender) {
    mk(this);
    this.peer = peerId;
    this.open = false;
    this._send = sender;
    this._closed = false;
  }
  RelayConn.prototype.send = function (data) { if (this._closed) return; try { this._send(data); } catch (e) {} };
  RelayConn.prototype.close = function () { if (this._closed) return; this._closed = true; this._emit('close'); };

  function RelayPeer(id) {
    mk(this);
    var self = this;
    this.id = id || uid();
    this.open = false;
    this.destroyed = false;
    this.disconnected = false;
    this._base = relayUrl();
    this._isHost = /^JT-/.test(this.id);
    this._room = this._isHost ? this.id.slice(3).toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    this._ws = null;
    this._conns = {};   // host: peerId -> RelayConn
    this._conn = null;  // player: host ka conn
    this._pending = [];

    if (this._isHost) {
      setTimeout(function () { self._open(); }, 0);
    } else {
      setTimeout(function () { self.open = true; self._emit('open', self.id); }, 0);
    }
  }

  RelayPeer.prototype._open = function () {
    var self = this;
    if (!this._base) { this._emit('error', { type: 'no-relay' }); return; }
    var url = this._base + '/ws?room=' + encodeURIComponent(this._room) +
      '&id=' + encodeURIComponent(this.id) + '&role=' + (this._isHost ? 'host' : 'player');
    var ws;
    try { ws = new WebSocket(url); } catch (e) { this._emit('error', { type: 'network' }); return; }
    this._ws = ws;
    ws.onopen = function () {
      self.open = true;
      self.disconnected = false;
      self._flush();
      if (self._isHost) { self._emit('open', self.id); }
      else if (self._conn && !self._conn.open) { self._conn.open = true; self._conn._emit('open'); }
    };
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } self._recv(m); };
    ws.onclose = function () {
      self.open = false;
      self.disconnected = true;
      if (self._isHost) { Object.keys(self._conns).forEach(function (k) { self._conns[k].close(); }); }
      if (self._conn) { self._conn.close(); }
      self._emit('close');
    };
    ws.onerror = function () { self._emit('error', { type: 'network' }); };
  };

  RelayPeer.prototype._raw = function (obj) {
    if (this._ws && this._ws.readyState === 1) { try { this._ws.send(JSON.stringify(obj)); return; } catch (e) {} }
    this._pending.push(obj);
  };
  RelayPeer.prototype._flush = function () {
    var self = this; var q = this._pending || []; this._pending = [];
    q.forEach(function (o) { self._raw(o); });
  };

  RelayPeer.prototype._recv = function (m) {
    var self = this;
    if (m.t === 'open') {
      var conn = this._conns[m.peer];
      if (!conn) {
        conn = new RelayConn(m.peer, function (data) { self._raw({ t: 'msg', to: m.peer, data: data }); });
        conn.open = true;
        this._conns[m.peer] = conn;
      }
      this._emit('connection', conn);
    } else if (m.t === 'close') {
      if (this._conns[m.peer]) { this._conns[m.peer].close(); delete this._conns[m.peer]; }
    } else if (m.t === 'data') {
      if (this._isHost) { if (this._conns[m.from]) this._conns[m.from]._emit('data', m.data); }
      else if (this._conn) { this._conn._emit('data', m.data); }
    } else if (m.t === 'host-gone') {
      if (this._conn) { this._conn.close(); }
      this._emit('error', { type: 'host-gone' });
    }
  };

  RelayPeer.prototype.connect = function (targetId) {
    var self = this;
    this._room = String(targetId || '').replace(/^JT-/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (this._conn) { this._conn.close(); }
    var conn = new RelayConn(targetId, function (data) { self._raw({ t: 'msg', to: 'host', data: data }); });
    this._conn = conn;
    try { if (this._ws) this._ws.close(); } catch (e) {}
    this._ws = null;
    this._pending = [];
    setTimeout(function () { self._open(); }, 0);
    return conn;
  };

  RelayPeer.prototype.destroy = function () {
    this.destroyed = true;
    try { if (this._ws) this._ws.close(); } catch (e) {}
  };

  function Peer(id, opts) {
    if (!relayUrl()) { return Real ? new Real(id, opts) : {}; }
    return new RelayPeer(id);
  }
  Peer.prototype = (Real && Real.prototype) || {};
  window.Peer = Peer;
})();
