/* ============================================================
   जैन ताम्बोला — RELAY  (Cloudflare Worker + Durable Object)
   ------------------------------------------------------------
   Ek "room" = ek Durable Object. Host aur saare players isse
   WebSocket se judte hain. Host sirf 1 connection banata hai;
   relay baaki sab players tak messages pahunchata hai.
   Isse P2P ki ~50 wali seema khatam — 150+ log aaram se.

   Protocol (client <-> relay):
     client -> relay : { t:'msg', to:'host' | '*' | '<peerId>', data:... }
     relay -> client : { t:'open',  peer:'<id>' }     (naya player juda)
                       { t:'close', peer:'<id>' }     (player chala gaya)
                       { t:'data',  from:'<id>', data:... }
                       { t:'host-gone' }              (host chala gaya)
   ============================================================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!room) return new Response('room required', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
    }
    return new Response('जैन ताम्बोला relay चालू है ✅', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
};

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.socks = new Map(); // ws -> { peer, role }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const peer = url.searchParams.get('id') || ('p' + Math.random().toString(36).slice(2, 10));
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'player';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.socks.set(server, { peer: peer, role: role });

    const self = this;
    server.addEventListener('message', function (ev) { self._onMessage(server, ev.data); });
    server.addEventListener('close', function () { self._onClose(server); });
    server.addEventListener('error', function () { self._onClose(server); });

    if (role === 'player') {
      // host ko batao ki naya player juda
      this._toRole('host', { t: 'open', peer: peer });
    } else {
      // host baad me aaya — usko pehle se jude sab players batao
      this._all().forEach(function (x) {
        if (x.info.role === 'player') self._safe(server, { t: 'open', peer: x.info.peer });
      });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  _all() {
    const out = [];
    this.socks.forEach(function (info, ws) { out.push({ ws: ws, info: info }); });
    return out;
  }

  _toRole(role, obj) {
    const self = this;
    this._all().forEach(function (x) { if (x.info.role === role) self._safe(x.ws, obj); });
  }

  _safe(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }

  _onMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const info = this.socks.get(ws);
    if (!info || !m || m.t !== 'msg') return;
    const out = { t: 'data', from: info.peer, data: m.data };
    if (m.to === 'host') {
      this._toRole('host', out);
    } else if (m.to === '*') {
      this._toRole('player', out);
    } else {
      const self = this;
      this._all().forEach(function (x) { if (x.info.peer === m.to) self._safe(x.ws, out); });
    }
  }

  _onClose(ws) {
    const info = this.socks.get(ws);
    if (!info) return;
    this.socks.delete(ws);
    if (info.role === 'player') {
      this._toRole('host', { t: 'close', peer: info.peer });
    } else {
      this._toRole('player', { t: 'host-gone' });
    }
  }
}
