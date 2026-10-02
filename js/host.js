/* ============================================================
   जैन ताम्बोला — होस्ट स्क्रीन लॉजिक v8
   फीचर्स: टाइमर, एनाउंसमेंट, चैट, हिस्ट्री, लीडरबोर्ड,
   म्यूज़िक, शब्द जोड़ना, प्राइज़ राउंड (जल्दी पाँच/कोन/लाइन),
   असली आवाज़ (voice pack), फुल हाउस, होस्ट रिकनेक्ट (पुराना गेम वापस),
   नंबर + शब्द दोनों बोलना (क्रमांक पंद्रह — अरिहंत),
   तेज़ गेम (गेम-शब्द पूल: 60/90/150/सभी)
   ============================================================ */
const ROOM_PREFIX = 'JT-';
function $(id){ return document.getElementById(id); }

let peer = null;
const conns = {}, players = {};
let started = false, winnerFull = null, fullWinners = [];   /* v5.6.19: 1/2/3 फुल हाउस विजेता */
function fullTarget(){
  try{ var v = parseInt(localStorage.getItem("jt_full_count"), 10); if(v === 2 || v === 3) return v; }catch(e){}
  return 1;
}
let deck = [], drawn = [];
const drawnSet = new Set();
let autoTimer = null, autoTotal = 10, autoLeft = 0;
let claimsFirst = true;
let muted = false;
let gameStartTime = null, timerInterval = null;
let musicAudio = null;
var musicOn = false;
let lastWord = null;
let gamePool = [];   /* इस गेम के लिए चुने गए शब्द — डेक और टिकट दोनों यहीं से बनते हैं (v5.6.2) */

/* ==================== प्राइज़ सेटिंग्स (v5.6) ==================== */
const PRIZE_LABELS = { jp:'जल्दी पाँच', corner:'चार कोन', line:'लाइन', full:'फुल हाउस' };
let prizes = { jp:false, corner:false, line:false };
let prizeWinners = {};
function loadPrizes(){
  try{
    const p = JSON.parse(localStorage.getItem('jt_prizes') || '{}');
    ['jp','corner','line'].forEach(function(k){
      if(typeof p[k] === 'boolean') prizes[k] = p[k];
    });
  }catch(e){}
  syncPrizeUI();
  renderPrizeWinners();
}
function syncPrizeUI(){
  ['jp','corner','line'].forEach(function(k){
    const el = $('pr-' + k);
    if(el) el.checked = !!prizes[k];
  });
}
function savePrizes(){
  ['jp','corner','line'].forEach(function(k){
    const el = $('pr-' + k);
    if(el) prizes[k] = el.checked;
  });
  try{ localStorage.setItem('jt_prizes', JSON.stringify(prizes)); }catch(e){}
  broadcast({ type:'prizes', prizes:prizes, winners:prizeWinners });
  renderPrizeWinners();
  toast('🏆 प्राइज़ सेटिंग सेव — चालू राउंड अभी से लागू');
}
function renderPrizeWinners(){
  const box = $('prize-winners');
  if(!box) return;
  let html = '';
  ['jp','corner','line'].forEach(function(k){
    if(!prizes[k]) return;
    html += '<div>🏅 ' + PRIZE_LABELS[k] + ': ' +
      (prizeWinners[k] ? '✅ <b>' + prizeWinners[k] + '</b>' : '—') + '</div>';
  });
  html += '<div>🏆 फुल हाउस: ' + (prizeWinners.full ? '✅ <b>' + prizeWinners.full + '</b>' : '—') + '</div>';
  box.innerHTML = html;
}

/* ==================== हेल्पर ==================== */
function shuffle(a){
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function makeRoomCode(){
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for(let i = 0; i < 6; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(function(){ t.classList.remove('show'); }, 2600);
}
function setStatus(msg){ $('net-status').textContent = msg; }
function broadcast(msg){
  Object.keys(conns).forEach(function(id){
    try{ conns[id].send(msg); }catch(e){}
  });
}

/* ==================== टाइमर ==================== */
function startTimer(){
  gameStartTime = Date.now();
  stopTimer();
  $('game-timer').style.display = 'inline-flex';
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}
function stopTimer(){
  if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
}
function updateTimer(){
  if(!gameStartTime) return;
  const s = Math.floor((Date.now() - gameStartTime) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  $('game-timer').textContent = '⏱ ' + mm + ':' + ss;
}

/* ==================== होस्ट रिकनेक्ट — पुराना गेम वापस (v5.6) ==================== */
const HOST_STATE_KEY = 'jt_host_state';
const HOST_STATE_MAX_MS = 6 * 3600000; /* 6 घंटे तक याद रहेगा */
function saveHostState(){
  if(!started) return;
  try{
    localStorage.setItem(HOST_STATE_KEY, JSON.stringify({
      time: Date.now(),
      room: $('room-code').textContent,
      started: started,
      deck: deck,
      pool: gamePool,
      drawn: drawn,
      prizeWinners: prizeWinners,
      fullWinners: fullWinners,
      gameStartMs: gameStartTime,
      players: Object.keys(players).filter(function(id){ return !players[id].screen; }).map(function(id){
        return { name: players[id].name, deviceId: players[id].deviceId || '', ticket: players[id].ticket || null };
      })
    }));
  }catch(e){}
}
function clearHostState(){ try{ localStorage.removeItem(HOST_STATE_KEY); }catch(e){} }
function readHostState(){
  try{
    const s = JSON.parse(localStorage.getItem(HOST_STATE_KEY) || 'null');
    if(s && s.room && s.started && Array.isArray(s.deck) && Array.isArray(s.drawn) &&
       (Date.now() - (s.time || 0)) < HOST_STATE_MAX_MS) return s;
  }catch(e){}
  return null;
}
function restoreHostState(){
  const s = readHostState();
  if(!s) return;
  createRoom(String(s.room)); /* वही रूम कोड — लिंक भी वही रहेगा */
  started = true;
  winnerFull = null;
  fullWinners = Array.isArray(s.fullWinners) ? s.fullWinners.slice() : [];
  if(fullWinners.length){
    $('winner-name').textContent = fullWinners.join(', ');
    $('winner-box').classList.add('show');
  }
  deck = s.deck;
  gamePool = (Array.isArray(s.pool) && s.pool.length) ? s.pool :
    (Array.isArray(s.deck) && Array.isArray(s.drawn) ? s.deck.concat(s.drawn) : []);
  drawn = s.drawn;
  drawnSet.clear();
  drawn.forEach(function(w){ drawnSet.add(w); });
  prizeWinners = s.prizeWinners || {};
  renderPrizeWinners();
  (s.players || []).forEach(function(p){
    if(!p || !p.name) return;
    players['saved-' + (p.deviceId || p.name)] = {
      name: p.name, deviceId: p.deviceId || '', ticket: p.ticket || null, dup: false
    };
  });
  renderPlayers();
  renderChips();
  $('drawn-count').textContent = drawn.length;
  if(s.gameStartMs){
    gameStartTime = s.gameStartMs;
    $('game-timer').style.display = 'inline-flex';
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
  }
  if(drawn.length){
    lastWord = drawn[drawn.length - 1];
    const el = $('current-shabd');
    const num = shabdNumber(lastWord);
    el.innerHTML = '<span style="font-size:.45em;opacity:.7;display:block;margin-bottom:4px">क्र. ' + num + '</span>' + lastWord;
    el.classList.add('pop');
    $('word-sub').textContent = 'शब्द ' + drawn.length + ' / ' + (gamePool.length || SHABD_LIST.length) + ' (वापस लाया गया)';
  }
  $('next-btn').disabled = !deck.length;
  $('auto-btn').disabled = !deck.length;
  setStatus('🔄 पुराना गेम वापस लाया गया — रूम कोड ' + s.room + ' वही है। खिलाड़ी पुराना लिंक टच करके दोबारा जुड़ जाएँगे और उन्हें वही पुरानी टिकट मिलेगी।');
  toast('🔄 पुराना गेम वापस — रूम ' + s.room + ' वही है');
  saveHostState();
}
$('resume-yes').addEventListener('click', function(){
  $('resume-banner').style.display = 'none';
  restoreHostState();
});
$('resume-no').addEventListener('click', function(){
  $('resume-banner').style.display = 'none';
  clearHostState();
  toast('नया गेम शुरू — पुराना हटाया गया');
});

/* ==================== चैट ==================== */
function addChatMsg(name, msg, cls){
  const box = $('chat-msgs');
  const d = document.createElement('div');
  d.className = 'chat-msg ' + (cls || '');
  if(name){
    const b = document.createElement('b');
    b.textContent = name;
    d.appendChild(b);
  }
  const t = document.createElement('span');
  t.textContent = msg;
  d.appendChild(t);
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}
function sendChat(){
  const inp = $('chat-input');
  const msg = (inp.value || '').trim().slice(0, 200);
  if(!msg) return;
  inp.value = '';
  addChatMsg('होस्ट (आप)', msg, 'me');
  broadcast({ type:'chat', from:'होस्ट', msg:msg });
  try{ beep(660, 0.1); }catch(e){}
}
$('chat-send').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', function(e){
  if(e.key === 'Enter') sendChat();
});

/* ==================== एनाउंसमेंट ==================== */
function sendAnnouncement(){
  const inp = $('announce-input');
  const msg = (inp.value || '').trim().slice(0, 150);
  if(!msg){ toast('पहले संदेश लिखें'); return; }
  inp.value = '';
  broadcast({ type:'announcement', msg:msg });
  const b = $('announce-banner');
  b.textContent = '📢 ' + msg;
  b.classList.add('show');
  toast('संदेश सब खिलाड़ियों को भेज दया गया ✅');
}
$('announce-btn').addEventListener('click', sendAnnouncement);

/* ==================== हिस्ट्री (1 दिन बाद ऑटो-डिलीट) ==================== */
function saveHistory(winnerName, wordCount, duration){
  try{
    let h = JSON.parse(localStorage.getItem('jt_history') || '[]');
    const now = Date.now();
    /* पुरानी एंट्री (1 दिन से ज़्यादा) हटाओ */
    h = h.filter(function(x){ return now - x.time < (JT_CONFIG.HISTORY_DAYS * 86400000); });
    h.push({
      time: now,
      date: new Date().toLocaleDateString('hi-IN'),
      winner: winnerName,
      words: wordCount,
      duration: duration || ''
    });
    localStorage.setItem('jt_history', JSON.stringify(h));
  }catch(e){}
  renderHistory();
}
function renderHistory(){
  const box = $('history-list');
  box.innerHTML = '';
  let h = [];
  try{ h = JSON.parse(localStorage.getItem('jt_history') || '[]'); }catch(e){}
  const now = Date.now();
  h = h.filter(function(x){ return now - x.time < (JT_CONFIG.HISTORY_DAYS * 86400000); });
  if(!h.length){
    box.innerHTML = '<span class="muted">अभी कोई गेम रिकॉर्ड नहीं</span>';
    return;
  }
  h.slice().reverse().forEach(function(x){
    const d = document.createElement('div');
    d.className = 'history-item';
    d.textContent = x.date + ' • विजेता: ' + x.winner + ' • ' + x.words + ' शब्द निकले' + (x.duration ? ' • ' + x.duration : '');
    box.appendChild(d);
  });
}
$('history-clear').addEventListener('click', function(){
  localStorage.removeItem('jt_history');
  renderHistory();
  toast('हिस्ट्री साफ़ हो गई');
});
$('history-share').addEventListener('click', function(){
  let h = [];
  try{ h = JSON.parse(localStorage.getItem('jt_history') || '[]'); }catch(e){}
  if(!h.length){ toast('शेयर करने के लिए कोई रिकॉर्ड नहीं'); return; }
  let txt = '📜 जैन ताम्बोला — गेम रिकॉर्ड\n\n';
  h.forEach(function(x){
    txt += '📅 ' + x.date + ' | 🏆 ' + x.winner + ' | ' + x.words + ' शब्द' + (x.duration ? ' | ⏱ ' + x.duration : '') + '\n';
  });
  txt += '\n॥ वंदे श्री गुरू तारणम् ॥';
  if(navigator.share){
    navigator.share({ text: txt }).catch(function(){});
  }else{
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
  }
});

/* ==================== लीडरबोर्ड ==================== */
function addWinnerToBoard(name){
  try{
    let b = JSON.parse(localStorage.getItem('jt_winners') || '[]');
    const now = Date.now();
    b = b.filter(function(x){ return now - x.time < 86400000; });
    b.push({ time: now, name: name });
    localStorage.setItem('jt_winners', JSON.stringify(b));
  }catch(e){}
  renderLeaderboard();
}
function renderLeaderboard(){
  const box = $('leaderboard');
  box.innerHTML = '';
  let b = [];
  try{ b = JSON.parse(localStorage.getItem('jt_winners') || '[]'); }catch(e){}
  const now = Date.now();
  b = b.filter(function(x){ return now - x.time < 86400000; });
  if(!b.length){
    box.innerHTML = '<span class="muted">आज अभी कोई विजेता नहीं</span>';
    return;
  }
  const counts = {};
  b.forEach(function(x){ counts[x.name] = (counts[x.name] || 0) + 1; });
  const sorted = Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; });
  sorted.forEach(function(name, i){
    const d = document.createElement('div');
    d.className = 'leader-row';
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = ['🥇', '🥈', '🥉'][i] || (i + 1) + '.';
    const lname = document.createElement('span');
    lname.className = 'lname';
    lname.textContent = name;
    const wins = document.createElement('span');
    wins.textContent = counts[name] + ' जीत';
    d.appendChild(rank); d.appendChild(lname); d.appendChild(wins);
    box.appendChild(d);
  });
}

/* ==================== म्यूज़िक ==================== */
$('music-select').addEventListener('click', function(){ $('music-file').click(); });
$('music-file').addEventListener('change', function(e){
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  if(musicAudio){ try{ musicAudio.pause(); }catch(err){} }
  musicAudio = new Audio(URL.createObjectURL(f));
  musicAudio.loop = true;
  musicAudio.volume = 0.25;
  $('music-play').style.display = 'inline-block';
  $('music-stop').style.display = 'inline-block';
  toast('🎵 संगीत तैयार — चलाएँ बटन दबाएँ');
});
$('music-play').addEventListener('click', function(){
  if(musicAudio){ musicAudio.play().catch(function(){}); toast('🎵 संगीत चल रहा है'); }
  musicOn = true; broadcast({ type:'music', on:true });
});
$('music-stop').addEventListener('click', function(){
  if(musicAudio){ musicAudio.pause(); toast('🎵 संगीत रुक गया'); }
  musicOn = false; broadcast({ type:'music', on:false });
});

/* ==================== म्यूज़िक: डकिंग + म्यूट (v5.8.10) ==================== */
var MUSIC_VOL = 0.25, MUSIC_DUCK = 0.1, musicMuted = false, musicDuckTimer = null;
function musicDuck(){
  if(!musicAudio || musicMuted) return;
  try{ musicAudio.volume = MUSIC_DUCK; }catch(e){}
  if(musicDuckTimer) clearTimeout(musicDuckTimer);
  musicDuckTimer = setTimeout(function(){
    musicDuckTimer = null;
    try{ if(musicAudio && !musicMuted) musicAudio.volume = MUSIC_VOL; }catch(e){}
  }, 1900);
}
var _mmBtn = document.getElementById('music-mute');
function musicMuteUI(){ if(_mmBtn) _mmBtn.textContent = musicMuted ? '🔇 आवाज़ बंद' : '🔉 आवाज़ चालू'; }
if(_mmBtn) _mmBtn.addEventListener('click', function(){
  musicMuted = !musicMuted;
  try{ if(musicAudio) musicAudio.volume = musicMuted ? 0 : MUSIC_VOL; }catch(e){}
  musicMuteUI();
  toast(musicMuted ? '🔇 संगीत की आवाज़ बंद' : '🔉 संगीत की आवाज़ चालू');
});
musicMuteUI();

/* बिल्ट-इन णमोकार मंत्र (v5.8.11) — हर बार mp3 चुनने की ज़रूरत नहीं */
try{
  musicAudio = new Audio('audio/mantra.mp3');
  musicAudio.loop = true;
  musicAudio.volume = musicMuted ? 0 : MUSIC_VOL;
  if($('music-play')) $('music-play').style.display = 'inline-block';
  if($('music-stop')) $('music-stop').style.display = 'inline-block';
}catch(e){}



/* ==================== शब्द जोड़ना ==================== */
var __jtAddBtn = null;
try{ __jtAddBtn = $('word-add-btn'); }catch(e){}
if(__jtAddBtn) __jtAddBtn.addEventListener('click', function(){
  const inp = $('word-add-input');
  const w = (inp.value || '').trim();
  const res = $('word-add-result');
  if(!w){ res.textContent = ''; return; }
  if(SHABD_LIST.indexOf(w) !== -1){
    res.textContent = '⚠️ यह शब्द पहले से सूची में है (क्र. ' + (SHABD_LIST.indexOf(w) + 1) + ')';
    return;
  }
  SHABD_LIST.push(w);
  inp.value = '';
  res.textContent = '✅ जोड़ा गया: ' + w + ' (क्र. ' + SHABD_LIST.length + ')';
  try{
    let extra = JSON.parse(localStorage.getItem('jt_extra_words') || '[]');
    extra.push(w);
    localStorage.setItem('jt_extra_words', JSON.stringify(extra));
  }catch(e){}
  $('total-count').textContent = SHABD_LIST.length;
  toast('शब्द जोड़ दया गया ✅');
});
/* सेव किए हुए अतिरिक्त शब्द लोड करो */
(function(){
  try{
    const extra = JSON.parse(localStorage.getItem('jt_extra_words') || '[]');
    extra.forEach(function(w){
      if(SHABD_LIST.indexOf(w) === -1) SHABD_LIST.push(w);
    });
  }catch(e){}
})();

/* ==================== खिलाड़ी सूची ==================== */
function renderPlayers(){
  const box = $('players');
  const ids = Object.keys(players).filter(function(id){ return !players[id].screen; });
  $('player-count').textContent = ids.length;
  box.innerHTML = '';
  if(!ids.length){
    const s = document.createElement('span');
    s.className = 'muted';
    s.textContent = 'अभी कोई नहीं — ऊपर लिंक शेयर करें';
    box.appendChild(s);
    return;
  }
  ids.forEach(function(id){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'player-pill' + (players[id].dup ? ' warn' : '');
    b.textContent = players[id].name + (players[id].dup ? ' ⚠️' : '') + ' ▸';
    b.title = 'टिकट देखने के लिए दबाएँ';
    b.addEventListener('click', function(){
    if(window.jtCheckUpdate){ window.jtCheckUpdate(function(t){ toast(t); }); }
    else{ toast('❌ अपडेट सुविधा नहीं मिली — पेज दोबारा खोलें'); }
  });
})();
