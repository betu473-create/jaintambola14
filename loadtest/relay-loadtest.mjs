// ============================================================
//  जैन ताम्बोला — RELAY LOAD TEST  (v6.6)
//  ------------------------------------------------------------
//  Ek room me 1 host + N players jodta hai aur broadcast latency
//  naapta hai. Do tareeke:
//    1) Live relay par:  node relay-loadtest.mjs --url wss://... --players 150
//    2) Offline mock par: node relay-loadtest.mjs --mock --players 150
//
//  Zaroorat:  npm i ws   (ya pod me pehle se hai)
// ============================================================
import { WebSocketServer, WebSocket } from 'ws';

const args = process.argv.slice(2);
function arg(name, def){ const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; }
const USE_MOCK = args.includes('--mock');
const PLAYERS  = parseInt(arg('players', '150'), 10);
const ROOM     = (arg('room', 'LTEST1')).toUpperCase();
const LIVE_URL = arg('url', 'wss://jain-tambola-relay.betu473.workers.dev');
const WINDOW_MS = parseInt(arg('window', '8000'), 10);

function now(){ return Date.now(); }
const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

// ---------- local mock relay (same protocol as the Worker) ----------
function startMock(port){
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port });
    const socks = new Map(); // ws -> {peer, role}
    wss.on('connection', (ws, req) => {
      const u = new URL(req.url, 'http://x');
      const peer = u.searchParams.get('id') || ('p' + Math.random().toString(36).slice(2, 10));
      const role = u.searchParams.get('role') === 'host' ? 'host' : 'player';
      socks.set(ws, { peer, role });
      const send = (w, o) => { try { w.send(JSON.stringify(o)); } catch (e) {} };
      if (role === 'player') { socks.forEach((i, w) => { if (i.role === 'host') send(w, { t: 'open', peer }); }); }
      else { socks.forEach((i, w) => { if (i.role === 'player') send(ws, { t: 'open', peer: i.peer }); }); }
      ws.on('message', (raw) => {
        let m; try { m = JSON.parse(raw); } catch (e) { return; }
        const info = socks.get(ws);
        if (!info || !m || m.t !== 'msg') return;
        const out = { t: 'data', from: info.peer, data: m.data };
        socks.forEach((i, w) => {
          if (m.to === '*') { if (i.role === 'player') send(w, out); }
          else if (m.to === 'host') { if (i.role === 'host') send(w, out); }
          else if (i.peer === m.to) send(w, out);
        });
      });
      ws.on('close', () => {
        const info2 = socks.get(ws); socks.delete(ws);
        if (info2 && info2.role === 'player') socks.forEach((i, w) => { if (i.role === 'host') send(w, { t: 'close', peer: info2.peer }); });
        if (info2 && info2.role === 'host') socks.forEach((i, w) => { if (i.role === 'player') send(w, { t: 'host-gone' }); });
      });
    });
    resolve({ wss, port });
  });
}

function openWS(url, onData){
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const t0 = now();
    ws.on('open', () => resolve({ ws, ms: now() - t0 }));
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } onData(m, ws); });
    ws.on('error', () => resolve({ ws: null, ms: -1 }));
  });
}

async function main(){
  let base = LIVE_URL;
  let mock = null;
  if (USE_MOCK) { mock = await startMock(0); base = 'ws://127.0.0.1:' + mock.wss.address().port; console.log('mock relay @', base); }
  const qs = (id, role) => `${base}/ws?room=${ROOM}&id=${id}&role=${role}`;

  // ---- host ----
  const hostMsgs = [];
  const host = await openWS(qs('JT-' + ROOM, 'host'), (m) => hostMsgs.push(m));
  if (!host.ws) { console.log('❌ host connect FAILED'); process.exit(1); }
  console.log(`host connected in ${host.ms}ms`);

  // ---- players ----
  const latencies = [];
  const connectTimes = [];
  let received = 0, errors = 0;
  const players = [];
  const started = now();
  const tasks = [];
  for (let i = 0; i < PLAYERS; i++) {
    tasks.push(openWS(qs('p' + i, 'player'), (m) => {
      if (m.t === 'data' && m.data && m.data.type === 'word') { received++; latencies.push(now() - m.data._t); }
    }).then((r) => {
      if (r.ws) { players.push(r.ws); connectTimes.push(r.ms); }
      else errors++;
    }));
  }
  await Promise.all(tasks);
  const connectWall = now() - started;
  console.log(`players: ${players.length}/${PLAYERS} connected (wall ${connectWall}ms), errors ${errors}`);
  console.log(`connect ms  -> avg ${Math.round(connectTimes.reduce((a, b) => a + b, 0) / (connectTimes.length || 1))}, p95 ${pct(connectTimes, 0.95)}, max ${Math.max(...connectTimes, 0)}`);

  // ---- broadcast a word from host ----
  await new Promise((r) => setTimeout(r, 500));
  const msg = { type: 'word', word: 'अरिहंत', num: 1, _t: now() };
  host.ws.send(JSON.stringify({ t: 'msg', to: '*', data: msg }));
  await new Promise((r) => setTimeout(r, WINDOW_MS));

  console.log(`\n📢 broadcast delivery: ${received}/${players.length} players (${Math.round(received / (players.length || 1) * 100)}%)`);
  console.log(`latency ms -> avg ${Math.round(latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1))}, p50 ${pct(latencies, 0.5)}, p95 ${pct(latencies, 0.95)}, max ${Math.max(...latencies, 0)}`);

  // ---- cleanup ----
  try { players.forEach((p) => p.close()); host.ws.close(); } catch (e) {}
  if (mock) mock.wss.close();
  const ok = received >= Math.floor(players.length * 0.99);
  console.log(ok ? '\n✅ PASS — sab players tak message pahuncha' : '\n⚠️ CHECK — kuch players tak message nahi pahuncha');
  process.exit(ok ? 0 : 2);
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
