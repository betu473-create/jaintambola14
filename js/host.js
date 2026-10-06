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
let started = false, winnerFull = null, fullWinners = [];
let familyMode = false;   /* v6.0: फैमिली मोड — एक फ़ोन पर कई टिकट */
try{ familyMode = localStorage.getItem('jt_family') === '1'; }catch(e){}   /* v5.6.19: 1/2/3 फुल हाउस विजेता */
function fullTarget(){
  try{ var v = parseInt(localStorage.getItem("jt_full_count"), 10); if(v >= 1 && v <= 50) return v; }catch(e){}
  return 1;
}
let deck = [], drawn = [];
const drawnSet = new Set();
let autoTimer = null, autoTotal = 10, autoLeft = 0;
let claimsFirst = true;
let autoVerify = true;   /* v6.3: क्लेम ऑटो-सत्यापन — सिस्टम खुद जाँचे */
try{ autoVerify = localStorage.getItem('jt_auto_verify') !== '0'; }catch(e){}
let offlineMode = false;   /* v6.9: कागज़-only — कोई रूम नहीं */
try{ offlineMode = localStorage.getItem('jt_offline') === '1'; }catch(e){}
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
    b.addEventListener('click', function(){ showTicketModal(id); });
    box.appendChild(b);
  });
  if(Object.keys(players).some(function(id){ return players[id].screen; })){
    const sp = document.createElement('span');
    sp.className = 'player-pill';
    sp.style.background = '#37474f';
    sp.style.color = '#fff';
    sp.style.cursor = 'default';
    sp.textContent = '📺 प्रोजेक्टर जुड़ा है';
    box.appendChild(sp);
  }
}
function renderChips(){
  const box = $('chips');
  box.innerHTML = '';
  if(!drawn.length){
    const s = document.createElement('span');
    s.className = 'muted';
    s.textContent = 'अभी कोई शब्द नहीं आया';
    box.appendChild(s);
    return;
  }
  for(let i = drawn.length - 1; i >= 0; i--){
    const s = document.createElement('span');
    s.className = 'chip';
    const num = shabdNumber(drawn[i]);
    s.textContent = num + '. ' + drawn[i];
    box.appendChild(s);
  }
}

/* ==================== मुख्य फिक्स: नया शब्द ==================== */
function showWord(word){
  const el = $('current-shabd');
  el.classList.remove('pop');
  el.textContent = '';
  $('word-sub').textContent = '';
  void el.offsetWidth;
  const num = shabdNumber(word);
  el.innerHTML = '<span style="font-size:.45em;opacity:.7;display:block;margin-bottom:4px">क्र. ' + num + '</span>' + word;
  el.classList.add('pop');
  $('word-sub').textContent = 'शब्द ' + drawn.length + ' / ' + (gamePool.length || SHABD_LIST.length) +
    ' • ऐप इसे हिंदी में ' + JT_CONFIG.SPEAK_TIMES + ' बार बोलेगा';
}

/* ==================== गेम खत्म करने का एक ही रास्ता (v5.6.16) ==================== */
/* चाहे होस्ट मंज़ूरी दे, चाहे टिकट अपने आप पूरी हो — यही चलेगा */
/* v5.6.19: फुल हाउस विजेता दर्ज करो — 1/2/3 जीत का सिस्टम */
function registerFullWinner(name, viaHost){
  if(winnerFull) return;                        /* गेम खत्म — कुछ नहीं */
  if(fullWinners.indexOf(name) !== -1) return;   /* एक ही आदमी दो बार नहीं */
  fullWinners.push(name);
  addWinnerToBoard(name);
  try{ dlAddWinner(name, 'full'); }catch(e){}   /* v5.9: लॉग */
  const tgt = fullTarget();
  const n = fullWinners.length;
  const row = document.createElement('div');
  row.className = 'claim-row';
  row.style.borderLeftColor = '#2e7d32';
  row.textContent = (viaHost ? '✅ मंज़ूर — 🏆 ' : '🎉 टिकट पूरी — अपने आप विजेता: 🏆 ') +
    name + ' फुल हाउस ' + n + '/' + tgt + ' (' + new Date().toLocaleTimeString('hi-IN') + ')';
  $('claims').prepend(row);
  $('winner-name').textContent = fullWinners.join(', ');
  $('winner-box').classList.add('show');
  $('winner-big-name').textContent = name;
  $('winner-big-sub').textContent = '🏆 फुल हाउस ' + n + '/' + tgt + ' — विजेता: ' + name + ' 🏆';
  $('winner-big').classList.add('show');
  confettiBurst();
  beep(1200, 0.45);
  announceWinnerVoice(name, 'फुल हाउस');
  saveHostState();
  if(n >= tgt){
    gameOverNow(name, viaHost);   /* आख़िरी विजेता — गेम बंद */
  } else {
    /* गेम जारी रहेगा — सबको बताओ */
    broadcast({ type:'claim-result', ok:true, name:name, prize:'full', more:1, count:n, total:tgt });
    setStatus('🏆 फुल हाउस ' + n + '/' + tgt + ': ' + name + ' — गेम जारी! अगले विजेता की प्रतीक्षा…');
    toast('🏆 फुल हाउस ' + n + '/' + tgt + ': ' + name + ' — गेम जारी');
    setTimeout(function(){ try{ $('winner-big').classList.remove('show'); }catch(e){} }, 3000);
  }
}

/* गेम बंद करने का एक ही रास्ता (v5.6.19) */
function gameOverNow(name, viaHost){
  if(winnerFull) return;
  winnerFull = name;
  stopAuto();
  stopTimer();
  $('next-btn').disabled = true;
  $('auto-btn').disabled = true;
  const dur = gameStartTime ? $('game-timer').textContent.replace('⏱ ', '') : '';
  const names = fullWinners.length ? fullWinners.join(', ') : name;
  saveHistory(names, drawn.length, dur);
  broadcast({ type:'claim-result', ok:true, name:name, prize:'full' });
  setTimeout(function(){ broadcast({ type:'game-over', winner:names }); }, 3600);
  /* बोर्ड साफ़ — नया शब्द बंद (v5.6.16) */
  const el = $('current-shabd');
  el.classList.remove('pop');
  el.textContent = '🏆';
  $('word-sub').textContent = 'गेम समाप्त — विजेता: ' + names + '। नया गेम: "🔄 नया गेम (रीसेट)" दबाएँ';
  setStatus('🏆 फुल हाउस विजेता: ' + names + ' — गेम समाप्त। अगला राउंड "नया गेम" से शुरू करें।');
  clearHostState();
}

/* v5.6.16: हर शब्द के बाद देखो — किसी खिलाड़ी की पूरी टिकट आ गई तो गेम अपने आप खत्म */
function checkAutoFullHouse(){
  if(winnerFull || !started) return;
  Object.keys(players).forEach(function(id){
    var pl = players[id]; if(!pl) return;
    var lists = [];
    if(Array.isArray(pl.tickets)){
      pl.tickets.forEach(function(tk){ if(tk && Array.isArray(tk.words)) lists.push({ name: tk.name || pl.name, words: tk.words }); });
    }
    if(Array.isArray(pl.ticket) && pl.ticket.length) lists.push({ name: pl.name, words: pl.ticket });
    lists.forEach(function(tk){
      var t = tk.words;
      if(Array.isArray(t) && t.length === JT_CONFIG.TICKET_CELLS &&
         t.every(function(w){ return drawnSet.has(w); })){
        registerFullWinner(tk.name || 'खिलाड़ी', false);
      }
    });
  });
}

function drawWord(){
  if(!started){ toast('पहले "गेम शुरू करें" दबाएँ'); return; }
  if(winnerFull){ toast('🏆 गेम पूरा हो चुका — "🔄 नया गेम" दबाएँ'); return; }   /* v5.6.16 */
  if(!deck.length){ toast('सभी शब्द आ चुके हैं'); stopAuto(); return; }
  const w = deck.pop();
  const num = shabdNumber(w);
  try{ if(window.jtAna) jtAna.count('words_drawn'); }catch(e){}
  try{ renderLivePanel(); }catch(e){}
  drawn.push(w);
  drawnSet.add(w);
  try{ dlAddWord(w, num); }catch(e){}   /* v5.9: स्थायी ड्रॉ लॉग */
  lastWord = w;
  if(!muted){
    musicDuck();
    beep(880, 0.35);
    /* नंबर + शब्द दोनों बोलो — जैसे असली ताम्बोले में (v5.6.3) */
    if(window.jtVoice && jtVoice.sayAnnounce){ jtVoice.sayAnnounce(num, w); }
    else{
      try{ speakWord(announcePhrase(num, w)); }catch(e){ speakWord(w); }
    }
  }
  showWord(w);
  broadcast({ type:'word', word:w, num:num, pack:(window.JT_PACK_OK ? 1 : 0) });   /* v5.6.15 */
  renderChips();
  $('drawn-count').textContent = drawn.length;
  saveHostState();
  checkAutoFullHouse();   /* v5.6.16: किसी की टिकट पूरी हुई तो गेम अपने आप खत्म */
  if(!deck.length){
    stopAuto();
    setStatus('सभी ' + (gamePool.length || SHABD_LIST.length) + ' शब्द आ चुके — क्लेम की प्रतीक्षा…');
  }
}

/* ==================== ऑटो मोड ==================== */
function updateCountdown(){
  const c = $('countdown');
  if(autoTimer && deck.length){
    c.textContent = '⏳ अगला शब्द ' + autoLeft + ' सेकंड में';
    c.classList.add('show');
  }else{
    c.classList.remove('show');
  }
}
function startAuto(){
  if(!started){ toast('पहले गेम शुरू करें'); return; }
  if(!deck.length){ toast('सभी शब्द आ चुके हैं'); return; }
  autoTotal = Math.max(3, Math.round((parseInt($('auto-speed').value, 10) || JT_CONFIG.AUTO_MODE_MS) / 1000));
  autoLeft = autoTotal;
  drawWord();
  autoLeft = autoTotal;
  updateCountdown();
  autoTimer = setInterval(function(){
    if(!deck.length){ stopAuto(); return; }
    autoLeft--;
    if(autoLeft <= 0){
      drawWord();
      autoLeft = autoTotal;
    }
    updateCountdown();
  }, 1000);
  $('auto-btn').textContent = '⏸ ऑटो मोड रोकें';
}
function stopAuto(){
  if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
  $('auto-btn').textContent = '⏩ ऑटो मोड शुरू';
  updateCountdown();
}

/* ==================== गेम फ्लो ==================== */
function makeTicket(){
  const src = (gamePool && gamePool.length) ? gamePool : SHABD_LIST;
  return shuffle(src.slice()).slice(0, JT_CONFIG.TICKET_CELLS);
}
function sendTicketTo(conn){
  var _pl = players[conn.peer];
  var mem = _pl && Array.isArray(_pl.members) ? _pl.members : null;
  /* v6.0: फैमिली मोड — हर सदस्य के लिए अलग (नाम-वार) टिकट */
  if(familyMode && mem && mem.length > 1){
    var list = mem.map(function(m){
      var w = makeTicket();
      return { name: String((m && m.name) || 'खिलाड़ी').slice(0,30),
               detail: String((m && m.detail) || '').slice(0,30),
               words: w, nums: w.map(function(x){ return shabdNumber(x); }) };
    });
    if(_pl){ _pl.tickets = list; _pl.ticket = list[0].words; }
    try{
      conn.send({ type:'tickets', list:list, drawn:drawn, prizes:prizes, winners:prizeWinners, family:true });
      try{ conn.send({ type:'music', on:musicOn }); }catch(e){}
    }catch(e){}
    return;
  }
  const words = makeTicket();
  if(players[conn.peer]) players[conn.peer].ticket = words;
  const nums = words.map(function(w){ return shabdNumber(w); });   /* क्रमांक भी भेजो (v5.6.9) */
  try{
    conn.send({ type:'ticket', words:words, nums:nums, drawn:drawn, prizes:prizes, winners:prizeWinners, family:familyMode });
        try{ conn.send({ type:'music', on:musicOn }); }catch(e){}
  }catch(e){}
}

function handleData(conn, d){
  if(!d || typeof d !== 'object') return;
  if(d.type === 'join' && d.name){
    if(d.screen){
      /* जाँच स्क्रीन (लैपटॉप) — v5.8.0: डायरी + अब तक के शब्द भी भेजो */
      if(d.checker){
        players[conn.peer] = { name:'🔍 जाँच स्क्रीन', screen:true, deviceId:String(d.deviceId || '') };
        renderPlayers();
        try{ conn.send({ type:'prizes', prizes:prizes, winners:prizeWinners }); }catch(e){}
        var creg = {};
        try{ creg = JSON.parse(localStorage.getItem('jt_paper_tickets')) || {}; }catch(e){}
        try{ conn.send({ type:'checker-data', reg:creg, drawn:drawn, words:(typeof SHABD_LIST!=='undefined'&&SHABD_LIST?SHABD_LIST.slice():[]) }); }catch(e){}
        toast('🔍 जाँच स्क्रीन जुड़ गई');
        return;
      }
      players[conn.peer] = { name:'📺 प्रोजेक्टर स्क्रीन', screen:true, deviceId:String(d.deviceId || '') };
      renderPlayers();
      try{ conn.send({ type:'prizes', prizes:prizes, winners:prizeWinners }); }catch(e){}
      toast('📺 प्रोजेक्टर स्क्रीन जुड़ गई');
      return;
    }
    const devId = String(d.deviceId || '');
    /* रीकनेक्ट: पहले से इस डिवाइस का टिकट बना है तो वही भेजो */
    let existingTicket = null;
    if(devId){
      Object.keys(players).forEach(function(id){
        if(players[id].deviceId === devId && players[id].ticket){
          existingTicket = players[id].ticket;
        }
      });
    }
    players[conn.peer] = {
      name: String(d.name).trim().slice(0, 30) || 'खिलाड़ी',
      deviceId: devId,
      ticket: existingTicket || null,
      members: Array.isArray(d.members) ? d.members.slice(0, 6) : null   /* v6.0: फैमिली मोड */
    };
    /* होस्ट-रिकनेक्ट का सेव किया खिलाड़ी — उसी डिवाइस का डुप्लिकेट हटाओ */
    if(devId){
      Object.keys(players).forEach(function(id){
        if(id.indexOf('saved-') === 0 && players[id] && players[id].deviceId === devId) delete players[id];
      });
    }
    if(devId){
      const dup = Object.keys(players).some(function(id){
        return id !== conn.peer && players[id].deviceId === devId;
      });
      if(dup) players[conn.peer].dup = true;
    }
    renderPlayers();
    if(started){
      if(existingTicket){
        /* रीकनेक्ट: पुरानी टिकट वापस भेजो */
        players[conn.peer].ticket = existingTicket;
        try{ conn.send({ type:'ticket', words:existingTicket, nums:existingTicket.map(function(w){ return shabdNumber(w); }), drawn:drawn, prizes:prizes, winners:prizeWinners }); }catch(e){}
        toast('🔄 ' + players[conn.peer].name + ' दोबारा जुड़ा (पुरानी टिकट वापस)');
      }else{
        sendTicketTo(conn);
      }
    }else{
      toast('🙋 ' + players[conn.peer].name + ' जुड़ गया');
    }
    try{ conn.send({ type:'prizes', prizes:prizes, winners:prizeWinners }); }catch(e){}
    saveHostState();
  } else if(d.type === 'claim'){
    handleClaim(conn, d);
  } else if(d.type === 'selfie-skip' && d.name){
    /* v5.9: विजेता ने फोटो देना नहीं चुना */
    try{ toast('👍 ' + d.name + ' ने फोटो नहीं दी'); }catch(e){}
  } else if(d.type === 'winner-selfie' && d.img && d.name){
    /* विजेता के फोन से फोटो आई — सबको दिखाओ (v5.6) */
    const wlabel = PRIZE_LABELS[d.prize] || 'फुल हाउस';
    showWinnerPhotoOnHost(d.name, wlabel, d.img);
    broadcast({ type:'winner-photo', name:d.name, prize:d.prize, label:wlabel, img:d.img });
  } else if(d.type === 'chat' && d.msg){
    const nm = players[conn.peer] ? players[conn.peer].name : 'खिलाड़ी';
    addChatMsg(nm, String(d.msg).slice(0, 200), '');
    beep(990, 0.1);
    toast('💬 ' + nm + ' का संदेश आया');
  } else if(d.type === 'kick'){
    /* खिलाड़ी ने 3 गलत क्लेम किए — उसे गेम से बाहर करो */
    const nm = players[conn.peer] ? players[conn.peer].name : 'खिलाड़ी';
    toast('🚫 ' + nm + ' 3 गलत क्लेम करने पर गेम से बाहर');
    setStatus('🚫 ' + nm + ' ने 3 गलत क्लेम किए — स्वतः बाहर');
    try{ conn.send({ type:'kicked', reason:'3 गलत क्लेम' }); }catch(e){}
  }
}

/* क्लेम सत्यापन (सिस्टम की जाँच — सिर्फ संकेत के लिए; निर्णय होस्ट का) */
function validateClaimPrize(d, prize){
  const t = Array.isArray(d.ticket) ? d.ticket : [];
  const has = function(i){ return !!t[i] && drawnSet.has(t[i]); };
  if(prize === 'full'){
    return t.length === JT_CONFIG.TICKET_CELLS &&
      t.every(function(w){ return drawnSet.has(w); });
  }
  if(prize === 'line'){
    for(let r = 0; r < 3; r++){
      if(has(r*4) && has(r*4+1) && has(r*4+2) && has(r*4+3)) return true;
    }
    return false;
  }
  if(prize === 'corner'){
    return has(0) && has(3) && has(8) && has(11);
  }
  if(prize === 'jp'){
    let n = 0;
    t.forEach(function(w){ if(drawnSet.has(w)) n++; });
    return n >= 5;
  }
  return false;
}

/* ==================== होस्ट की मैन्युअल जाँच ==================== */
/* क्लेम आते ही होस्ट को मंज़ूर/नामंज़ूर बटन दिखते हैं — होस्ट का निर्णय अंतिम */
let pendingClaim = null;   /* { conn, name, prize, ticket, marks } */

function handleClaim(conn, d){
  const name = String(d.name || 'खिलाड़ी');
  let prize = (d && typeof d.prize === 'string') ? d.prize : 'full';
  if(['jp','corner','line','full'].indexOf(prize) === -1) prize = 'full';
  const prizeOn = (prize === 'full') || !!prizes[prize];
  const valid = prizeOn && validateClaimPrize(d, prize);
  const label = PRIZE_LABELS[prize] || 'फुल हाउस';
  /* v6.3: ऑटो-सत्यापन चालू → सिस्टम तुरंत निर्णय देता है */
  if(autoVerify){
    if(winnerFull || !prizeOn || prizeWinners[prize]){
      logClaimRow('🙋 देर से क्लेम', name, label, false);
      try{ conn.send({ type:'claim-result', ok:false, late:true }); }catch(e){}
      return;
    }
    if(valid){
      logClaimRow('🤖 स्वतः मंज़ूर', name, label, true);
      try{ beep(1150, 0.25); }catch(e){}
      toast('🤖 ' + name + ' — ' + label + ' सही पाया गया, स्वतः मंज़ूर');
      setStatus('🤖 ' + name + ' का ' + label + ' क्लेम सही पाया गया — स्वतः मंज़ूर।');
      finishClaim(name, conn, prize);
    }else{
      logClaimRow('🤖 स्वतः नामंज़ूर (अमान्य)', name, label, false);
      try{ conn.send({ type:'claim-result', ok:false, invalid:true }); }catch(e){}
      toast('❌ ' + name + ' का ' + label + ' क्लेम अमान्य पाया गया');
      setStatus('❌ ' + name + ' का ' + label + ' क्लेम सिस्टम ने अमान्य पाया (खिलाड़ी को तुरंत बताया गया)।');
    }
    return;
  }
  /* गेम खत्म, राउंड बंद, या राउंड जीता जा चुका — देर वाली/अमान्य क्लेम */
  if(winnerFull || !prizeOn || prizeWinners[prize]){
    if(claimsFirst){ $('claims').innerHTML = ''; claimsFirst = false; }
    const row = document.createElement('div');
    row.className = 'claim-row';
    row.textContent = '🙋 ' + name + ' • ' + label + ' • देर से क्लेम (' +
      (!prizeOn ? 'यह राउंड चालू नहीं है' : 'विजेता पहले ही घोषित') + ')';
    $('claims').prepend(row);
    try{ conn.send({ type:'claim-result', ok:false, late:true }); }catch(e){}
    return;
  }
  /* v6.3: पहले वाला क्लेम होस्ट के पास है — नए क्लेम को प्रतीक्षा बताओ (पुराने को न हटाओ) */
  if(pendingClaim){
    try{ conn.send({ type:'claim-result', ok:false, waiting:true }); }catch(e){}
    return;
  }
  pendingClaim = { conn: conn, name: name, prize: prize, ticket: d.ticket || [], marks: d.marks || [] };
  beep(1100, 0.3);
  toast('🙋 ' + name + ' ने ' + label + ' का क्लेम किया — अब आपका निर्णय दें');
  setStatus('⚖️ ' + name + ' का ' + label + ' का क्लेम आया है — मंज़ूर या नामंज़ूर करें। होस्ट का निर्णय अंतिम है।');
  if(claimsFirst){ $('claims').innerHTML = ''; claimsFirst = false; }
  renderPendingClaim(valid);
}

function renderPendingClaim(sysValid){
  const box = $('claims');
  const item = document.createElement('div');
  item.className = 'claim-row';
  item.style.background = '#fff3e0';
  item.style.borderLeft = '5px solid #ff6f00';
  /* नाम + समय */
  const line1 = document.createElement('div');
  line1.textContent = '🙋 ' + pendingClaim.name + ' • ' + (PRIZE_LABELS[pendingClaim.prize] || 'फुल हाउस') + ' • ' +
    new Date().toLocaleTimeString('hi-IN') +
    (sysValid ? ' • सिस्टम जाँच: सही ✅' : ' • सिस्टम जाँच: अमान्य ❌ (फिर भी आप तय करें)');
  line1.style.fontWeight = '700';
  item.appendChild(line1);
  /* बटन */
  const btnRow = document.createElement('div');
  btnRow.style.marginTop = '8px';
  btnRow.style.display = 'flex';
  btnRow.style.gap = '8px';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'btn small green';
  okBtn.textContent = '✅ मंज़ूर करें';
  okBtn.addEventListener('click', function(){ approveClaim(); });
  const noBtn = document.createElement('button');
  noBtn.type = 'button';
  noBtn.className = 'btn small ghost';
  noBtn.style.borderColor = '#e53935';
  noBtn.style.color = '#c62828';
  noBtn.textContent = '❌ नामंज़ूर करें';
  noBtn.addEventListener('click', function(){ rejectClaim(); });
  btnRow.appendChild(okBtn);
  btnRow.appendChild(noBtn);
  item.appendChild(btnRow);
  box.prepend(item);
}

function finishClaim(name, conn, prize){
  const label = PRIZE_LABELS[prize] || 'फुल हाउस';
  prizeWinners[prize] = name;
  renderPrizeWinners();
  try{ dlAddWinner(name, prize); }catch(e){}   /* v5.9: लॉग */
  if(prize !== 'full'){
    /* जल्दी पाँच / चार कोन / लाइन का विजेता — गेम जारी रहेगा */
    broadcast({ type:'claim-result', ok:true, name:name, prize:prize });
    const row2 = document.createElement('div');
    row2.className = 'claim-row';
    row2.style.borderLeftColor = '#2e7d32';
    row2.textContent = '✅ मंज़ूर — 🏅 ' + name + ' • ' + label + ' विजेता (' + new Date().toLocaleTimeString('hi-IN') + ')';
    $('claims').prepend(row2);
    addWinnerToBoard(name + ' (' + label + ')');
    setStatus('🏅 ' + label + ' विजेता: ' + name + ' — गेम जारी रहेगा');
    toast('🏅 ' + label + ': ' + name);
    beep(1150, 0.3);
    offerWinnerPhoto(name, label);
    announceWinnerVoice(name, label);
    saveHostState();
    return;
  }
  /* v5.6.19: फुल हाउस विजेता दर्ज — 1/2/3 जीत तक गेम चलेगा */
  registerFullWinner(name, true);
}

/* v6.3: क्लेम रिपोर्ट में एक पंक्ति जोड़ो */
function logClaimRow(icon, name, label, ok){
  if(claimsFirst){ $('claims').innerHTML = ''; claimsFirst = false; }
  const row = document.createElement('div');
  row.className = 'claim-row';
  row.style.borderLeftColor = ok ? '#2e7d32' : '#e53935';
  row.textContent = icon + ' — ' + name + ' • ' + label + ' (' + new Date().toLocaleTimeString('hi-IN') + ')';
  $('claims').prepend(row);
}

function approveClaim(){
  if(!pendingClaim) return;
  const name = pendingClaim.name;
  const conn = pendingClaim.conn;
  const prize = pendingClaim.prize || 'full';
  pendingClaim = null;
  finishClaim(name, conn, prize);
}

function rejectClaim(){
  if(!pendingClaim) return;
  const name = pendingClaim.name;
  const conn = pendingClaim.conn;
  pendingClaim = null;
  try{ conn.send({ type:'claim-result', ok:false }); }catch(e){}
  const row = document.createElement('div');
  row.className = 'claim-row';
  row.style.borderLeftColor = '#e53935';
  row.textContent = '❌ नामंज़ूर — ' + name + ' का क्लेम होस्ट ने ठुकरा दया (' + new Date().toLocaleTimeString('hi-IN') + ')';
  $('claims').prepend(row);
  setStatus('❌ ' + name + ' का क्लेम नामंज़ूर कया गया। गेम जारी रहेगा।');
  toast('क्लेम नामंज़ूर — गेम जारी');
}

$('winner-big-close').addEventListener('click', function(){ $('winner-big').classList.remove('show'); });

function resetBoard(){
  try{ dlStartGame(); }catch(e){}   /* v5.9: नया गेम — नया लॉग */
  pendingClaim = null;
  fullWinners = [];
  const el = $('current-shabd');
  el.classList.remove('pop');
  el.textContent = '…';
  $('word-sub').textContent = 'गेम शुरू होने की प्रतीक्षा';
  $('drawn-count').textContent = '0';
  $('winner-box').classList.remove('show');
  $('winner-big').classList.remove('show');
  $('claims').innerHTML = '<span class="muted">अभी कोई क्लेम नहीं आया</span>';
  claimsFirst = true;
  renderChips();
  updateCountdown();
}

function createRoom(code){
  try{ if(peer) peer.destroy(); }catch(e){}
  Object.keys(conns).forEach(function(k){ delete conns[k]; });
  Object.keys(players).forEach(function(k){ delete players[k]; });
  started = false; winnerFull = null; lastWord = null;
  deck = []; drawn = []; drawnSet.clear();
  stopAuto(); stopTimer();
  $('game-timer').style.display = 'none';
  resetBoard();
  renderPlayers();
  $('next-btn').disabled = true;
  $('auto-btn').disabled = true;
  $('room-code').textContent = code;
  const link = jtSiteUrl() + '/join.html?room=' + code;
  $('share-link').value = link;
  $('wa-share').href = 'https://wa.me/?text=' +
    encodeURIComponent('॥ जैन ताम्बोला ॥ गेम में शामिल हों:\n' + link + '\nरूम कोड: ' + code);
  $('screen-link').href = 'screen.html?room=' + code;
  try{ if($('check-link')) $('check-link').href = 'check.html?room=' + code; }catch(e){}
  try{
    if($('check-url')){
      const clink = jtSiteUrl() + '/check.html?room=' + code;
      $('check-url').value = clink;
      if($('check-wa')) $('check-wa').href = 'https://wa.me/?text=' +
        encodeURIComponent('॥ जैन ताम्बोला ॥ 🔍 जाँच स्क्रीन (काग़ज़ टिकट जाँच — किसी भी उपकरण पर खोलें):\n' + clink + '\nरूम कोड: ' + code);
    }
  }catch(e){}
  try{
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    $('qr-box').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 }) +
      '<div class="muted" style="font-size:.8rem;margin-top:6px">📱 फोन से स्कैन करके सीधे गेम में जुड़ें</div>';
  }catch(e){ $('qr-box').innerHTML = ''; }
  setStatus('रूम बन रहा है…');
  try{
    peer = new Peer(ROOM_PREFIX + code);
  }catch(e){
    setStatus('⚠️ कनेक्शन नहीं बन पाया — इंटरनेट जाँचकर "नया रूम बनाएँ" दबाएँ');
    return;
  }
  peer.on('open', function(){
    setStatus('✅ रूम तैयार — लिंक खिलाड़ियों को भेजें। सबके जुड़ने के बाद "गेम शुरू करें" दबाएँ।');
  });
  peer.on('error', function(e){
    setStatus('⚠️ कनेक्शन त्रुटि (' + ((e && e.type) || 'unknown') + ') — "नया रूम बनाएँ" दबाकर दोबारा कोशिश करें');
  });
  peer.on('connection', function(conn){
    conns[conn.peer] = conn;
    conn.on('data', function(d){ handleData(conn, d); });
    conn.on('close', function(){
      delete conns[conn.peer];
      if(players[conn.peer]){
        toast(players[conn.peer].name + ' गेम छोड़ गया');
        delete players[conn.peer];
        renderPlayers();
      }
    });
  });
}

/* ==================== खिलाड़ी की टिकट ==================== */
function showTicketModal(id){
  const p = players[id];
  if(!p || !p.ticket){ toast('इस खिलाड़ी का टिकट अभी नहीं बना'); return; }
  $('modal-title').textContent = p.name + ' की डिजिटल टिकट';
  const g = $('modal-grid');
  g.innerHTML = '';
  p.ticket.forEach(function(w){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell' + (drawnSet.has(w) ? ' marked' : '');
    const num = shabdNumber(w);
    b.innerHTML = '<span class="cell-num">' + num + '</span><span class="cell-word">' + w + '</span>';
    b.disabled = true;
    g.appendChild(b);
  });
  $('modal-bg').classList.add('show');
}

/* ==================== बटन ==================== */
$('start-btn').addEventListener('click', function(){
  const n = Object.keys(conns).length;
  if(!n){
    /* v5.6.21: कागज़ वाला ऑफ़लाइन गेम — बिना खिलाड़ी के भी शुरू हो सकता है */
    if(!confirm('कोई खिलाड़ी (फोन से) अभी जुड़ा नहीं है।\n\nकागज़ वाला ऑफ़लाइन गेम शुरू करना है?\n(टिकटें Print Center से छपी हुई हों, या बाद में खिलाड़ी जुड़ भी सकते हैं)')) return;
  }
  if(!SHABD_LIST.length){ toast('पहले शब्द जोड़ें — “शब्द सूची” पेज पर जाकर कम से कम 13 शब्द जोड़ें'); return; }   /* v5.6.11 */
  unlockSpeech();
  started = true;
  winnerFull = null;
  prizeWinners = {};
  renderPrizeWinners();
  /* गेम के शब्द चुनो: 60/90/150 या पूरी सूची (v5.6.2) */
  let gw = 0;
  try{ gw = parseInt(($('game-words') && $('game-words').value) || '90', 10) || 0; }catch(e){ gw = 0; }
  try{ localStorage.setItem('jt_gamewords', String(gw)); }catch(e){}
  /* v6.8: कागज़ टिकट (pool) mismatch चेतावनी */
  try{
    var _reg = JSON.parse(localStorage.getItem('jt_paper_tickets') || '{}');
    var _pn = Object.keys(_reg || {}).length;
    if(_pn > 0 && gw > 0){
      var _all = (typeof SHABD_LIST !== 'undefined' && SHABD_LIST) ? SHABD_LIST.length : 0;
      try{ toast('⚠️ रजिस्टर में ' + _pn + ' कागज़ टिकट हैं, पर गेम सिर्फ ' + gw + ' शब्दों का!'); }catch(e){}
      setStatus('⚠️ ध्यान दें: रजिस्टर में ' + _pn + ' कागज़ टिकट हैं, पर गेम सिर्फ ' + gw + ' शब्दों के pool से चलेगा। कागज़ टिकट के शब्द इस pool में न हों तो उनका फुल हाउस पूरा नहीं हो सकेगा — कागज़ गेम के लिए "पूरी सूची (सभी ' + _all + ')" चुनें।');
    }
  }catch(e){}
  /* v5.6.19: फुल हाउस जीत की संख्या याद रखो */
  try{
    var fc = parseInt(($('full-count') && $('full-count').value) || '1', 10);
    if(!(fc >= 1 && fc <= 50)) fc = 1;
    localStorage.setItem('jt_full_count', String(fc));
  }catch(e){}
  const poolAll = SHABD_LIST.slice();
  gamePool = (gw > 0 && gw < poolAll.length) ? shuffle(poolAll).slice(0, gw) : poolAll;
  deck = shuffle(gamePool.slice());
  drawn = []; drawnSet.clear();
  resetBoard();
  broadcast({ type:'start' });
  broadcast({ type:'prizes', prizes:prizes, winners:prizeWinners });
  Object.keys(conns).forEach(function(id){ sendTicketTo(conns[id]); });
  $('next-btn').disabled = false;
  $('auto-btn').disabled = false;
  startTimer();
  saveHostState();
  $('resume-banner').style.display = 'none';
  setStatus('✅ गेम शुरू — ' + gamePool.length + ' शब्दों में से गेम चलेगा। फुल हाउस जीत: ' + fullTarget() + '। अब शब्द निकालें।');
});
$('next-btn').addEventListener('click', function(){
  drawWord();
  if(autoTimer) autoLeft = autoTotal;
});
$('auto-btn').addEventListener('click', function(){
  if(autoTimer) stopAuto(); else startAuto();
});
try{
  var _fc0 = fullTarget();
  if($('full-count')) $('full-count').value = String(_fc0);
  if($('full-count')) $('full-count').addEventListener('change', function(){
    var v = parseInt($('full-count').value, 10);
    if(!(v >= 1 && v <= 50)) v = 1;
    try{ localStorage.setItem('jt_full_count', String(v)); }catch(e){}
    toast('🏆 फुल हाउस जीत: ' + v + ' विजेता ' + (v > 1 ? '— गेम ' + v + ' जीत तक चलेगा' : '— पहली जीत पर बंद'));
  });
}catch(e){}
$('newgame-btn').addEventListener('click', function(){
  started = false; winnerFull = null; lastWord = null;
  prizeWinners = {}; renderPrizeWinners();
  deck = []; drawn = []; drawnSet.clear();
  stopAuto(); stopTimer();
  $('game-timer').style.display = 'none';
  resetBoard();
  try{ $('winner-photo-card').style.display = 'none'; }catch(e){}   /* v5.6.16: फोटो कार्ड भी साफ़ */
  $('next-btn').disabled = true;
  $('auto-btn').disabled = true;
  broadcast({ type:'reset' });
  clearHostState();
  $('resume-banner').style.display = 'none';
  setStatus('🔄 गेम रीसेट — दोबारा "गेम शुरू करें" दबाएँ (सबको नए टिकट मिलेंगे)।');
});
$('copy-btn').addEventListener('click', function(){
  const i = $('share-link');
  i.select();
  try{ i.setSelectionRange(0, 9999); }catch(e){}
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(i.value).then(function(){ toast('लिंक कॉपी हो गया ✅'); });
  }else{
    try{ document.execCommand('copy'); toast('लिंक कॉपी हो गया ✅'); }
    catch(e){ toast('कॉपी नहीं हुआ — लिंक चुनकर मैन्युअली कॉपी करें'); }
  }
});
$('regen-btn').addEventListener('click', function(){ clearHostState(); $('resume-banner').style.display = 'none'; createRoom(makeRoomCode()); });
$('mute-btn').addEventListener('click', function(){
  muted = !muted;
  if(muted){ stopSpeaking(); }
  else{ unlockSpeech(); speakWord('अरिहंत', 1); }
  $('mute-btn').textContent = muted ? '🔇 आवाज़ बंद' : '🔊 आवाज़ चालू';
});
$('modal-close').addEventListener('click', function(){ $('modal-bg').classList.remove('show'); });
$('modal-bg').addEventListener('click', function(e){
  if(e.target === $('modal-bg')) $('modal-bg').classList.remove('show');
});

/* ==================== विजेता फोटो (v5.6) ==================== */
let wpFile = null;
function showWinnerPhotoOnHost(name, label, dataUrl){
  const card = $('winner-photo-card');
  if(!card) return;
  $('wp-name').textContent = name + ' (' + label + ')';
  $('wp-img').src = dataUrl;
  $('wp-img').style.display = 'block';
  $('wp-share').style.display = 'inline-block';
  card.dataset.name = name;
  card.dataset.label = label;
  card.style.display = 'block';
  const p = $('claims-panel');
  if(p) p.open = true;
  try{
    fetch(dataUrl).then(function(r){ return r.blob(); }).then(function(blob){
      wpFile = new File([blob], 'winner.jpg', { type:'image/jpeg' });
    }).catch(function(){});
  }catch(e){}
  toast('📸 ' + name + ' की फोटो आ गई — सबकी स्क्रीन पर दिख रही है');
}
/* v5.6.14: होस्ट पर फोटो लेने का विकल्प हटा दिया — फोटो सिर्फ विजेता (खिलाड़ी) के फोन से आती है */
function offerWinnerPhoto(name, label){ return; }

$('wp-share').addEventListener('click', function(){
  if(!wpFile){ toast('फोटो अभी नहीं आई'); return; }
  const name = $('winner-photo-card').dataset.name || '';
  const label = $('winner-photo-card').dataset.label || '';
  const txt = '🏆 ' + name + ' — ' + label + ' विजेता! ॥ जैन ताम्बोला ॥';
  if(navigator.canShare && navigator.canShare({ files: [wpFile] })){
    navigator.share({ files: [wpFile], text: txt }).catch(function(){});
  }else{
    try{
      const a = document.createElement('a');
      a.href = URL.createObjectURL(wpFile);
      a.download = 'winner.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('फोटो डाउनलोड हुई — WhatsApp पर भेज दें');
    }catch(err){ toast('शेयर नहीं हो पाया'); }
  }
});

/* ==================== विजेता घोषणा — बोलकर (v5.6) ==================== */
function announceWinnerVoice(name, label){
  if(muted) return;
  setTimeout(function(){
    try{ speakWord(name + ' जी ' + label + ' के विजेता बन गए! बधाई हो!', 1); }catch(e){}
  }, 700);
}

/* ==================== इनवाइट कार्ड (v5.6) ==================== */
let inviteBlob = null;
function _loadImg(src){
  return new Promise(function(resolve, reject){
    const im = new Image();
    im.onload = function(){ resolve(im); };
    im.onerror = reject;
    im.src = src;
  });
}
function _roundRect(x, rx, ry, rw, rh, r){
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
  x.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
  x.arcTo(rx, ry + rh, rx, ry, r);
  x.arcTo(rx, ry, rx + rw, ry, r);
  x.closePath();
}
$('invite-btn').addEventListener('click', function(){
  const m = $('invite-modal');
  if(!$('invite-date').value){
    const d = new Date();
    $('invite-date').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    $('invite-time').value = '20:00';
  }
  m.classList.add('show');
});
$('invite-close').addEventListener('click', function(){ $('invite-modal').classList.remove('show'); });
$('invite-make').addEventListener('click', function(){
  const link = $('share-link').value || (jtSiteUrl() + '/join.html');
  const code = $('room-code').textContent || '';
  const dv = $('invite-date').value, tv = $('invite-time').value;
  let qrSrc = null;
  try{
    const q = qrcode(0, 'M');
    q.addData(link);
    q.make();
    qrSrc = q.createDataURL(10, 4);
  }catch(e){}
  Promise.all([
    _loadImg('./icons/logo.jpg'),
    qrSrc ? _loadImg(qrSrc) : Promise.resolve(null)
  ]).then(function(res){
    const logo = res[0], qrImg = res[1];
    const W = 1080, H = 1400;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fff8ef');
    g.addColorStop(0.5, '#ffe0b2');
    g.addColorStop(1, '#ffcc80');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    x.strokeStyle = '#e65100';
    x.lineWidth = 14;
    x.strokeRect(28, 28, W - 56, H - 56);
    x.strokeStyle = '#bf360c';
    x.lineWidth = 3;
    x.strokeRect(48, 48, W - 96, H - 96);
    x.save();
    x.beginPath();
    x.arc(W / 2, 240, 130, 0, Math.PI * 2);
    x.closePath();
    x.clip();
    x.drawImage(logo, W / 2 - 130, 110, 260, 260);
    x.restore();
    x.strokeStyle = '#fff';
    x.lineWidth = 10;
    x.beginPath();
    x.arc(W / 2, 240, 135, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#bf360c';
    x.textAlign = 'center';
    x.font = 'bold 92px sans-serif';
    x.fillText('॥ जैन ताम्बोला ॥', W / 2, 520);
    x.fillStyle = '#4e342e';
    x.font = 'bold 58px sans-serif';
    x.fillText('ऑनलाइन गेम निमंत्रण', W / 2, 610);
    let dateLine = '';
    try{
      if(dv){
        const dt = new Date(dv + 'T00:00:00');
        dateLine = '📅 ' + dt.toLocaleDateString('hi-IN', { weekday:'long', day:'numeric', month:'long' });
      }
      if(tv){
        const parts = tv.split(':');
        let h = parseInt(parts[0], 10);
        const ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        dateLine += '  •  ⏰ ' + h + ':' + parts[1] + ' ' + ap;
      }
    }catch(e){}
    if(dateLine){
      x.fillStyle = '#5d4037';
      x.font = 'bold 48px sans-serif';
      x.fillText(dateLine, W / 2, 720);
    }
    const qrSize = 400;
    const qx = (W - qrSize) / 2;
    const qy = 790;
    x.fillStyle = '#fff';
    _roundRect(x, qx - 25, qy - 25, qrSize + 50, qrSize + 105, 30);
    x.fill();
    if(qrImg){
      x.imageSmoothingEnabled = false;
      x.drawImage(qrImg, qx, qy, qrSize, qrSize);
      x.imageSmoothingEnabled = true;
    }
    x.fillStyle = '#37474f';
    x.font = 'bold 40px sans-serif';
    x.fillText('📱 फोन से स्कैन करके गेम में जुड़ें', W / 2, qy + qrSize + 45);
    x.fillStyle = '#b71c1c';
    x.font = 'bold 64px sans-serif';
    x.fillText('रूम कोड: ' + code, W / 2, 1330);
    x.fillStyle = '#8d6e63';
    x.font = 'bold 34px sans-serif';
    x.fillText('Designed by Himanshu Jain', W / 2, 1378);
    c.toBlob(function(blob){
      if(!blob){ toast('⚠️ कार्ड नहीं बन पाया'); return; }
      inviteBlob = new File([blob], 'jain-tambola-invite.jpg', { type:'image/jpeg' });
      $('invite-img').src = URL.createObjectURL(blob);
      $('invite-img').style.display = 'block';
      $('invite-share').style.display = 'inline-block';
      toast('🎴 कार्ड तैयार — शेयर करें बटन दबाएँ');
    }, 'image/jpeg', 0.92);
  }).catch(function(){ toast('⚠️ कार्ड नहीं बन पाया — दोबारा कोशिश करें'); });
});
$('invite-share').addEventListener('click', function(){
  if(!inviteBlob){ toast('पहले ✨ कार्ड बनाएँ बटन दबाएँ'); return; }
  if(navigator.canShare && navigator.canShare({ files: [inviteBlob] })){
    navigator.share({ files: [inviteBlob], text: '॥ जैन ताम्बोला ॥ गेम में शामिल हों!' }).catch(function(){});
  }else{
    try{
      const a = document.createElement('a');
      a.href = URL.createObjectURL(inviteBlob);
      a.download = 'jain-tambola-invite.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('कार्ड डाउनलोड हुआ — WhatsApp पर भेज दें');
    }catch(err){ toast('शेयर नहीं हो पाया'); }
  }
});


/* ==================== 🔒 ऑफ़लाइन (कागज़-only) मोड (v6.9) ==================== */
function applyOfflineUI(){
  var sc = document.getElementById('share-card');
  if(sc) sc.style.display = offlineMode ? 'none' : '';
  if(offlineMode){
    try{ if(peer) peer.destroy(); }catch(e){}
    peer = null;
    Object.keys(conns).forEach(function(k){ delete conns[k]; });
    Object.keys(players).forEach(function(k){ delete players[k]; });
    try{ renderPlayers(); }catch(e){}
    try{ if($('room-code')) $('room-code').textContent = 'ऑफ़लाइन'; }catch(e){}
    try{ setStatus('🔒 ऑफ़लाइन (कागज़-only) मोड — कोई ऑनलाइन नहीं जुड़ सकता। शब्द निकालें; कागज़ टिकट जाँच नीचे क्लेम सेक्शन में चलती रहेगी।'); }catch(e){}
  }else{
    applyOfflineUI();   /* v6.9: ऑफ़लाइन मोड में रूम नहीं बनता */
  }
}

/* ==================== शुरुआत ==================== */
loadPrizes();
['jp','corner','line'].forEach(function(k){
  const el = $('pr-' + k);
  if(el) el.addEventListener('change', savePrizes);
});
$('total-count').textContent = SHABD_LIST.length;
renderHistory();
renderLeaderboard();
createRoom(makeRoomCode());
/* पिछली बार की गेम-शब्द पसंद याद रखो (v5.6.2) */
try{
  const sgw = localStorage.getItem('jt_gamewords');
  if(sgw !== null && $('game-words')) $('game-words').value = sgw;
}catch(e){}
/* पुराना अधूरा गेम मिले तो बैनर दिखाओ */
(function(){
  const s = readHostState();
  if(!s) return;
  $('resume-room').textContent = s.room;
  $('resume-banner').style.display = 'block';
})();


/* ==================== 📊 लाइव स्थिति — सभी कागज़ टिकट (v6.11) ==================== */
/* कोई marking नहीं — register की सारी टिकटें, जो सबसे भरी वो ऊपर। */
function renderLivePanel(){
  var box = document.getElementById('live-list');
  if(!box) return;
  var reg = {};
  try{ reg = JSON.parse(localStorage.getItem('jt_paper_tickets')) || {}; }catch(e){ reg = {}; }
  var keys = Object.keys(reg);
  if(!keys.length){
    box.innerHTML = '<span class="muted">कोई कागज़ टिकट नहीं — Print Center से टिकट बनाएँ, फिर यहाँ दिखेंगी।</span>';
    return;
  }
  var ds = {};
  drawn.forEach(function(w){ ds[w] = true; });
  var rows = keys.map(function(k){
    var words = reg[k] || [];
    var ok = 0;
    words.forEach(function(w){ if(ds[w]) ok++; });
    return { num: parseInt(k, 10), ok: ok, total: words.length };
  });
  rows.sort(function(a, b){ return (b.ok - a.ok) || (a.num - b.num); });
  var done = rows.filter(function(r){ return r.total && r.ok === r.total; }).length;
  var top = rows.slice(0, 15);
  box.innerHTML =
    '<div class="muted" style="margin-bottom:6px">कुल <b>' + rows.length + '</b> टिकट • पूरी हो चुकीं: <b>' + done + '</b></div>' +
    top.map(function(r){
      var full = r.total && r.ok === r.total;
      var left = r.total - r.ok;
      var icon = full ? '🎉' : (left <= 1 ? '🔥' : '•');
      var col = full ? '#1b5e20' : (left <= 1 ? '#bf360c' : '#3e2723');
      return '<div style="padding:4px 0;font-weight:' + (full || left <= 1 ? '900' : '700') + ';color:' + col + '">' +
        icon + ' टिकट #' + r.num + ' — ' + r.ok + '/' + r.total +
        (full ? ' पूरी! 🎉' : ' (' + left + ' बचे)') + '</div>';
    }).join('');
}

/* ==================== कागज़ टिकट जाँच (v5.6.18) ==================== */
(function(){
  var btn = document.getElementById('pc-check');
  var res = document.getElementById('pc-result');
  var inp = document.getElementById('pc-num');
  if(!btn || !res || !inp) return;
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return c === '&' ? '&' : (c === '<' ? '<' : '>'); }); }
  function runCheck(){
    var num = parseInt(inp.value, 10);
    if(!num || num < 1){ res.innerHTML = '<b style="color:#c62828">टिकट नंबर डालें</b>'; return; }
    var reg = {};
    try{ reg = JSON.parse(localStorage.getItem('jt_paper_tickets')) || {}; }catch(e){}
    var words = reg[num];
    if(!words || !words.length){
      res.innerHTML = '<b style="color:#c62828">⚠️ टिकट #' + num + ' रजिस्टर में नहीं मिली</b>' +
        '<div style="font-size:.85rem;color:#6d4c41;margin-top:4px">जाँच उसी फ़ोन पर होगी जिस पर टिकटें बनाई थीं (Print Center से)। इस फ़ोन के रजिस्टर में अभी ' + Object.keys(reg).length + ' टिकट हैं।</div>';
      return;
    }
    var ds = {};
    drawn.forEach(function(w){ ds[w] = true; });
    var ok = 0, left = [];
    var chips = words.map(function(w){
      var hit = !!ds[w];
      if(hit) ok++; else left.push(w);
      return '<span style="display:inline-block;margin:3px;padding:4px 9px;border-radius:8px;font-size:.85rem;font-weight:800;background:' + (hit ? '#c8e6c9' : '#ffcdd2') + ';color:' + (hit ? '#1b5e20' : '#b71c1c') + '">' + (hit ? '✅ ' : '❌ ') + esc(w) + '</span>';
    }).join('');
    var full = (ok === words.length);
    var verdict = full
      ? '<div style="font-size:1.05rem;font-weight:900;color:#1b5e20;background:#c8e6c9;border-radius:10px;padding:10px;margin-bottom:6px">🎉 टिकट #' + num + ' पूरी बन गई! (' + ok + '/' + words.length + ') — क्लेम सही!</div>'
      : '<div style="font-size:1.05rem;font-weight:900;color:#b71c1c;background:#ffcdd2;border-radius:10px;padding:10px;margin-bottom:6px">❌ टिकट #' + num + ' — अभी ' + (words.length - ok) + ' शब्द बचे हैं (' + ok + '/' + words.length + ') — क्लेम अभी सही नहीं</div>';
    var leftBox = left.length ? '<div style="margin-top:6px;font-size:.88rem;color:#4e342e"><b>अभी बचे शब्द:</b> ' + left.map(esc).join(' • ') + '</div>' : '';
    res.innerHTML = verdict + '<div>' + chips + '</div>' + leftBox;
    try{ beep(full ? 880 : 220, 0.12); }catch(e){}
  }
  btn.addEventListener('click', runCheck);
  inp.addEventListener('keydown', function(e){ if(e.key === 'Enter') runCheck(); });

})();

/* ==================== 🔄 नया वर्ज़न लाओ (v5.6.22) ==================== */
(function(){
  var b = document.getElementById('upd-btn');
  if(!b) return;
  var busy = false;
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange', function(){
      try{ toast('🔄 नया वर्ज़न आ गया — दोबारा खोल रहे हैं…'); }catch(e){}
      setTimeout(function(){ location.reload(); }, 900);
    });
  }
  b.addEventListener('click', function(){
    if(window.jtCheckUpdate){ window.jtCheckUpdate(function(t){ toast(t); }); }
    else{ toast('❌ अपडेट सुविधा नहीं मिली — पेज दोबारा खोलें'); }
  });
})();


/* ============================================================
   📜 स्थायी ड्रॉ लॉग + एक्सपोर्ट (v5.9)
   ------------------------------------------------------------
   - हर गेम का पक्का रिकॉर्ड: निकले शब्द (क्रमांक + समय) + विजेता
   - localStorage: jt_drawlog — आख़िरी 25 गेम (पुराने अपने-आप हटते हैं)
   - निर्यात: CSV डाउनलोड + प्रिंट/PDF व्यू
   ============================================================ */
var DRAWLOG_KEY = 'jt_drawlog', DRAWLOG_MAX = 25;
var _curGame = null;
function _dlAll(){ try{ return JSON.parse(localStorage.getItem(DRAWLOG_KEY) || '[]'); }catch(e){ return []; } }
function _dlWrite(arr){ try{ localStorage.setItem(DRAWLOG_KEY, JSON.stringify(arr.slice(0, DRAWLOG_MAX))); }catch(e){} }
function _dlFlush(){
  if(!_curGame) return;
  var arr = _dlAll().filter(function(g){ return g.id !== _curGame.id; });
  arr.unshift(_curGame);
  _dlWrite(arr);
  try{ renderDrawLog(); }catch(e){}
}
function dlStartGame(){
  _curGame = { id: Date.now(), date: new Date().toISOString(), words: [], winners: [] };
  _dlFlush();
}
function dlAddWord(w, num){
  if(!_curGame) dlStartGame();
  _curGame.words.push({ w: String(w), n: num || 0, t: Date.now() });
  _dlFlush();
}
function dlAddWinner(name, prize){
  if(!_curGame) dlStartGame();
  _curGame.winners.push({ name: String(name), prize: prize || 'full', t: Date.now() });
  _dlFlush();
}
function _dlFmt(ms){ try{ return new Date(ms).toLocaleString('hi-IN'); }catch(e){ return ''; } }
function _dlEsc(s){ return String(s).replace(/[<>&]/g, function(c){ return c === '<' ? '&lt;' : (c === '>' ? '&gt;' : '&amp;'); }); }

/* छोटा सारांश (रिपोर्ट सेक्शन में) */
function renderDrawLog(){
  var box = document.getElementById('drawlog-list');
  if(!box) return;
  var games = _dlAll();
  if(!games.length){ box.innerHTML = '<span class="muted">अभी कोई गेम लॉग नहीं — गेम खेलते ही बन जाएगा।</span>'; return; }
  var out = '<div style="margin-top:6px">';
  games.slice(0, 5).forEach(function(g, gi){
    var gn = games.length - gi;
    var wn = (g.winners || []).map(function(x){ return _dlEsc(x.name); }).join(', ') || '—';
    out += '<div style="border-left:3px solid #ffb74d;padding:4px 10px;margin:6px 0;font-size:.88rem">' +
      '<b>गेम #' + gn + '</b> • ' + _dlFmt(g.id) + '<br>' +
      'शब्द: ' + (g.words || []).length + ' • विजेता: ' + wn + '</div>';
  });
  out += '</div>';
  if(games.length > 5) out += '<div class="muted" style="font-size:.82rem">…कुल ' + games.length + ' गेम लॉग में हैं</div>';
  box.innerHTML = out;
}

/* CSV — पूरा लॉग */
function dlCSV(){
  var games = _dlAll();
  var q = function(s){ return '"' + String(s).replace(/"/g, '""') + '"'; };
  var out = '\uFEFFगेम_नं,दिनांक,प्रकार,विवरण,क्रमांक,समय\n';
  games.forEach(function(g, gi){
    var gn = games.length - gi;
    (g.words || []).forEach(function(x, i){
      out += [gn, q(_dlFmt(g.id)), 'शब्द', q(x.w), (x.n || ''), q(_dlFmt(x.t))].join(',') + '\n';
    });
    (g.winners || []).forEach(function(x){
      out += [gn, q(_dlFmt(g.id)), 'विजेता', q(x.name), q(x.prize || ''), q(_dlFmt(x.t))].join(',') + '\n';
    });
  });
  return out;
}
function dlDownloadCSV(){
  var games = _dlAll();
  if(!games.length){ try{ toast('अभी कोई लॉग नहीं'); }catch(e){} return; }
  var blob = new Blob([dlCSV()], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tambola-game-log-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ try{ URL.revokeObjectURL(a.href); }catch(e){} }, 4000);
  try{ toast('📥 लॉग डाउनलोड हो गया'); }catch(e){}
}
function dlPrint(){
  var games = _dlAll();
  if(!games.length){ try{ toast('अभी कोई लॉग नहीं'); }catch(e){} return; }
  var html = '<!DOCTYPE html><html lang="hi"><head><meta charset="utf-8"><title>ताम्बोला गेम लॉग</title>' +
    '<style>body{font-family:"Noto Sans Devanagari","Nirmala UI",sans-serif;padding:20px;color:#241812}' +
    'h1{font-size:1.25rem;color:#bf360c}table{border-collapse:collapse;width:100%;margin:6px 0 18px}' +
    'th,td{border:1px solid #c9b79a;padding:5px 9px;font-size:.85rem;text-align:left}th{background:#f3e7d4}' +
    '.g{font-weight:800;margin:16px 0 2px;color:#3e2723}</style></head><body>';
  html += '<h1>📜 ताम्बोला — स्थायी गेम लॉग (ऑडिट ट्रेल)</h1>';
  games.forEach(function(g, gi){
    var gn = games.length - gi;
    html += '<div class="g">गेम #' + gn + ' • ' + _dlFmt(g.id) + '</div>';
    html += '<table><tr><th style="width:48px">क्र.</th><th>शब्द</th><th style="width:90px">क्रमांक</th><th style="width:170px">समय</th></tr>';
    (g.words || []).forEach(function(x, i){ html += '<tr><td>' + (i + 1) + '</td><td>' + _dlEsc(x.w) + '</td><td>' + (x.n || '') + '</td><td>' + _dlFmt(x.t) + '</td></tr>'; });
    html += '</table>';
    if((g.winners || []).length){
      html += '<table><tr><th>विजेता</th><th style="width:120px">प्राइज़</th><th style="width:170px">समय</th></tr>';
      (g.winners || []).forEach(function(x){ html += '<tr><td>' + _dlEsc(x.name) + '</td><td>' + _dlEsc(x.prize || '') + '</td><td>' + _dlFmt(x.t) + '</td></tr>'; });
      html += '</table>';
    }
  });
  html += '</body></html>';
  var w = window.open('', '_blank');
  if(!w){ try{ toast('पॉपअप ब्लॉक है — अनुमति दें'); }catch(e){} return; }
  w.document.write(html); w.document.close();
  setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 600);
}

/* बटन जोड़ो + पहली बार सारांश दिखाओ */
(function(){
  function wire(id, fn){ var b = document.getElementById(id); if(b) b.addEventListener('click', fn); }
  wire('drawlog-csv', dlDownloadCSV);
  wire('drawlog-print', dlPrint);
  wire('drawlog-clear', function(){
    if(!confirm('पूरा गेम लॉग (ऑडिट ट्रेल) हटाना है? यह वापस नहीं आएगा।')) return;
    try{ localStorage.removeItem(DRAWLOG_KEY); }catch(e){}
    _curGame = null; renderDrawLog();
    try{ toast('🗑 लॉग साफ़ हो गया'); }catch(e){}
  });
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderDrawLog);
  else renderDrawLog();
})();


/* ============================================================
   👨👩👧 फैमिली मोड — होस्ट सेटिंग (v6.0)
   ============================================================ */
(function(){
  var cb = document.getElementById('family-mode');
  if(!cb) return;
  try{ cb.checked = !!familyMode; }catch(e){}
  cb.addEventListener('change', function(){
    familyMode = !!cb.checked;
    try{ localStorage.setItem('jt_family', familyMode ? '1' : '0'); }catch(e){}
    try{ broadcast({ type:'family', on:familyMode }); }catch(e){}
    try{ toast(familyMode ? '👨👩👧 फैमिली मोड चालू — अब खिलाड़ी नाम-वार टिकट ले सकते हैं' : 'फैमिली मोड बंद'); }catch(e){}
    try{ if(familyMode && window.jtAna) jtAna.count('family_on'); }catch(e){}
  });
})();


/* ============================================================
   🤖 क्लेम ऑटो-सत्यापन — होस्ट सेटिंग (v6.3)
   ============================================================ */
(function(){
  var cb = document.getElementById('auto-verify');
  if(!cb) return;
  try{ cb.checked = !!autoVerify; }catch(e){}
  cb.addEventListener('change', function(){
    autoVerify = !!cb.checked;
    try{ localStorage.setItem('jt_auto_verify', autoVerify ? '1' : '0'); }catch(e){}
    try{ toast(autoVerify ? '🤖 क्लेम ऑटो-सत्यापन चालू' : '🤖 ऑटो-सत्यापन बंद — अब आप खुद हर क्लेम का निर्णय देंगे'); }catch(e){}
  });
})();


/* ============================================================
   🔢 "पूरी सूची (सभी N)" — असली गिनती (v6.2)
   ------------------------------------------------------------
   पहले यहाँ 521 हाथ से लिखा था; सूची बढ़ने पर वह पुराना ही रहता।
   अब सूची के असली आकार से दिखाता है।
   ============================================================ */
(function(){
  function upd(){
    var o = document.getElementById('full-list-opt');
    if(!o) return;
    var n = (typeof SHABD_LIST !== 'undefined' && SHABD_LIST && SHABD_LIST.length) ? SHABD_LIST.length : 0;
    if(n) o.textContent = 'गेम के शब्द: पूरी सूची (सभी ' + n + ')';
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', upd);
  else upd();
})();


/* ============================================================
   📊 लाइव स्थिति — ताज़ा करने वाला बटन + शुरुआती रेंडर (v6.11)
   ============================================================ */
(function(){
  function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  ready(function(){
    var rf = document.getElementById('live-refresh');
    if(rf) rf.addEventListener('click', function(){ try{ renderLivePanel(); toast('🔄 ताज़ा किया'); }catch(e){} });
    try{ renderLivePanel(); }catch(e){}
    setInterval(function(){ try{ renderLivePanel(); }catch(e){} }, 5000);
  });
})();


/* ============================================================
   📅 गेम शेड्यूल + याद दिलाना (v6.7)
   ------------------------------------------------------------
   (1) होस्ट के फ़ोन पर अपने-आप याद-दिलाना (notification + toast)
   (2) एक टैप में WhatsApp पर तैयार संदेश
   ============================================================ */
(function(){
  var K = 'jt_schedule';
  function load(){ try{ return JSON.parse(localStorage.getItem(K) || 'null'); }catch(e){ return null; } }
  function save(o){ try{ localStorage.setItem(K, JSON.stringify(o)); }catch(e){} }
  function clearS(){ try{ localStorage.removeItem(K); }catch(e){} }
  function fmt(ts){ try{ return new Date(ts).toLocaleString('hi-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }catch(e){ return ''; } }
  function waMsg(){
    var s = load();
    var when = (s && s.ts) ? fmt(s.ts) : 'जल्द';
    var url = '';
    try{ url = jtSiteUrl() + '/join.html'; }catch(e){}
    return '॥ जैन ताम्बोला ॥\n🎲 अगला गेम: ' + when + '\nऐप खोलें: ' + url + '\n(रूम कोड गेम से पहले भेजा जाएगा)';
  }
  function waHref(){ return 'https://wa.me/?text=' + encodeURIComponent(waMsg()); }
  function paint(){
    var st = document.getElementById('sch-status');
    var wa = document.getElementById('sch-wa');
    if(!st) return;
    var s = load();
    if(wa){ wa.style.display = 'none'; }
    if(!s || !s.ts){ st.textContent = 'कोई शेड्यूल सेट नहीं।'; return; }
    var d = s.ts - Date.now();
    if(s.fired){
      st.innerHTML = '✅ ' + fmt(s.ts) + ' का याद-दिलाना भेज दिया गया।';
      if(wa){ wa.href = waHref(); wa.style.display = ''; }
      return;
    }
    if(d <= 0){
      st.innerHTML = '🔔 अब समय हो गया — WhatsApp पर सबको बता दें!';
      if(wa){ wa.href = waHref(); wa.style.display = ''; }
      return;
    }
    var mins = Math.round(d / 60000);
    var left = mins > 90 ? Math.round(mins / 60) + ' घंटे' : mins + ' मिनट';
    st.textContent = '⏰ अगला गेम: ' + fmt(s.ts) + ' (' + left + ' में)';
    if(wa){ wa.href = waHref(); wa.style.display = ''; }
  }
  function fire(){
    var s = load(); if(!s || !s.ts || s.fired) return;
    if(Date.now() < s.ts) return;
    s.fired = true; save(s);
    try{
      if(window.Notification && Notification.permission === 'granted'){
        new Notification('🎲 तांबोला का समय!', { body: 'आज का गेम शुरू करने का समय है — WhatsApp पर सबको बता दें!' });
      }
    }catch(e){}
    try{ toast('🔔 तांबोला का समय! नीचे WhatsApp पर भेजें'); }catch(e){}
    paint();
  }
  function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  ready(function(){
    var dEl = document.getElementById('sch-date');
    var tEl = document.getElementById('sch-time');
    var sv = document.getElementById('sch-save');
    var nf = document.getElementById('sch-notif');
    var cl = document.getElementById('sch-clear');
    if(!dEl || !tEl || !sv) return;
    var s = load();
    if(s && s.ts){
      try{
        var dt = new Date(s.ts);
        var pad = function(n){ return (n < 10 ? '0' : '') + n; };
        dEl.value = dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
        tEl.value = pad(dt.getHours()) + ':' + pad(dt.getMinutes());
      }catch(e){}
    }
    sv.addEventListener('click', function(){
      if(!dEl.value || !tEl.value){ toast('तारीख और समय दोनों चुनें'); return; }
      var ts = new Date(dEl.value + 'T' + tEl.value).getTime();
      if(isNaN(ts)){ toast('समय ठीक नहीं — दोबारा चुनें'); return; }
      save({ ts: ts, fired: false });
      try{ if(window.Notification && Notification.permission === 'default') Notification.requestPermission(); }catch(e){}
      paint();
      toast('✅ गेम ' + fmt(ts) + ' के लिए सेट — समय पर याद दिलाऊँगा');
    });
    if(nf) nf.addEventListener('click', function(){
      try{
        if(!window.Notification){ toast('इस ब्राउज़र में notification नहीं चलती'); return; }
        Notification.requestPermission().then(function(p){
          toast(p === 'granted' ? '🔔 अनुमति मिल गई — अब याद दिलाऊँगा' : '🔕 अनुमति नहीं मिली');
        });
      }catch(e){ toast('notification अनुमति नहीं मिली'); }
    });
    if(cl) cl.addEventListener('click', function(){ clearS(); paint(); toast('🗑 शेड्यूल हटा दिया'); });
    paint();
    setInterval(function(){ fire(); paint(); }, 30000);
    fire();
  });
})();


/* ============================================================
   🔒 ऑफ़लाइन (कागज़-only) मोड — होस्ट सेटिंग (v6.9)
   ============================================================ */
(function(){
  function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  ready(function(){
    var cb = document.getElementById('offline-mode');
    if(!cb) return;
    try{ cb.checked = !!offlineMode; }catch(e){}
    cb.addEventListener('change', function(){
      offlineMode = !!cb.checked;
      try{ localStorage.setItem('jt_offline', offlineMode ? '1' : '0'); }catch(e){}
      try{ applyOfflineUI(); }catch(e){}
      try{ toast(offlineMode ? '🔒 ऑफ़लाइन मोड चालू — अब कोई ऑनलाइन नहीं जुड़ेगा' : '🌐 ऑनलाइन मोड — नया रूम बन गया, लिंक भेज सकते हैं'); }catch(e){}
    });
  });
})();
