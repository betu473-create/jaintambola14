/* ============================================================
   जैन ताम्बोला — होस्ट स्क्रीन लॉजिक v8
   फीचर्स: टाइमर, एनाउंसमेंट, चैट, हिस्ट्री, लीडरबोर्ड,
   म्यूज़िक, शब्द जोड़ना, प्राइज़ राउंड (जल्दी पाँच/कोन/लाइन),
   असली आवाज़ (voice pack), फुल हाउस, होस्ट रिकनेक्ट (पुराना गेम वापस),
   तेज़ गेम (गेम-शब्द पूल: 60/90/150/सभी)
   ============================================================ */
const ROOM_PREFIX = 'JT-';
function $(id){ return document.getElementById(id); }

let peer = null;
const conns = {}, players = {};
let started = false, winnerFull = null;
let deck = [], drawn = [];
const drawnSet = new Set();
let autoTimer = null, autoTotal = 10, autoLeft = 0;
let claimsFirst = true;
let muted = false;
let gameStartTime = null, timerInterval = null;
let musicAudio = null;
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
});
$('music-stop').addEventListener('click', function(){
  if(musicAudio){ musicAudio.pause(); toast('🎵 संगीत रुक गया'); }
});

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

function drawWord(){
  if(!started){ toast('पहले "गेम शुरू करें" दबाएँ'); return; }
  if(!deck.length){ toast('सभी शब्द आ चुके हैं'); stopAuto(); return; }
  const w = deck.pop();
  drawn.push(w);
  drawnSet.add(w);
  lastWord = w;
  if(!muted){
    beep(880, 0.35);
    if(window.jtVoice){ jtVoice.sayWord(w); } else { speakWord(w); }
  }
  showWord(w);
  broadcast({ type:'word', word:w, num: shabdNumber(w) });
  renderChips();
  $('drawn-count').textContent = drawn.length;
  saveHostState();
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
  const words = makeTicket();
  if(players[conn.peer]) players[conn.peer].ticket = words;
  try{
    conn.send({ type:'ticket', words:words, drawn:drawn, prizes:prizes, winners:prizeWinners });
  }catch(e){}
}

function handleData(conn, d){
  if(!d || typeof d !== 'object') return;
  if(d.type === 'join' && d.name){
    if(d.screen){
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
      ticket: existingTicket || null
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
        try{ conn.send({ type:'ticket', words:existingTicket, drawn:drawn, prizes:prizes, winners:prizeWinners }); }catch(e){}
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
  /* अगर पहले से कोई क्लेम pending है तो उसे हटा दो (सिर्फ एक क्लेम एक बार में) */
  if(pendingClaim){
    try{ pendingClaim.conn.send({ type:'claim-result', ok:false, late:true }); }catch(e){}
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

function approveClaim(){
  if(!pendingClaim) return;
  const name = pendingClaim.name;
  const conn = pendingClaim.conn;
  const prize = pendingClaim.prize || 'full';
  const label = PRIZE_LABELS[prize] || 'फुल हाउस';
  pendingClaim = null;
  prizeWinners[prize] = name;
  renderPrizeWinners();
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
  winnerFull = name;
  /* हिस्ट्री + लीडरबोर्ड */
  const dur = gameStartTime ? $('game-timer').textContent.replace('⏱ ', '') : '';
  saveHistory(name, drawn.length, dur);
  addWinnerToBoard(name);
  /* ब्रॉडकास्ट */
  broadcast({ type:'claim-result', ok:true, name:name, prize:'full' });
  /* गेम ओवर ब्रॉडकास्ट */
  setTimeout(function(){ broadcast({ type:'game-over', winner:name }); }, 3600);
  /* UI */
  const row = document.createElement('div');
  row.className = 'claim-row';
  row.style.borderLeftColor = '#2e7d32';
  row.textContent = '✅ मंज़ूर — 🏆 ' + name + ' फुल हाउस विजेता (' + new Date().toLocaleTimeString('hi-IN') + ')';
  $('claims').prepend(row);
  $('winner-name').textContent = name;
  $('winner-box').classList.add('show');
  $('winner-big-name').textContent = name;
  $('winner-big').classList.add('show');
  confettiBurst();
  beep(1200, 0.5);
  setStatus('🏆 फुल हाउस विजेता (होस्ट द्वारा मंज़ूर): ' + name + ' । होस्ट का निर्णय अंतिम।');
  stopTimer();
  offerWinnerPhoto(name, 'फुल हाउस');
  announceWinnerVoice(name, 'फुल हाउस');
  clearHostState(); /* फुल हाउस पूरा — अब वापस लाने की ज़रूरत नहीं */
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
  pendingClaim = null;
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
  if(!n){ toast('पहले कम-से-कम एक खिलाड़ी लिंक से जुड़े'); return; }
  unlockSpeech();
  started = true;
  winnerFull = null;
  prizeWinners = {};
  renderPrizeWinners();
  /* गेम के शब्द चुनो: 60/90/150 या पूरी सूची (v5.6.2) */
  let gw = 0;
  try{ gw = parseInt(($('game-words') && $('game-words').value) || '90', 10) || 0; }catch(e){ gw = 0; }
  try{ localStorage.setItem('jt_gamewords', String(gw)); }catch(e){}
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
  setStatus('✅ गेम शुरू — ' + gamePool.length + ' शब्दों में से गेम चलेगा। सबको डिजिटल टिकट भेज दए गए। अब शब्द निकालें।');
});
$('next-btn').addEventListener('click', function(){
  drawWord();
  if(autoTimer) autoLeft = autoTotal;
});
$('auto-btn').addEventListener('click', function(){
  if(autoTimer) stopAuto(); else startAuto();
});
$('newgame-btn').addEventListener('click', function(){
  started = false; winnerFull = null; lastWord = null;
  prizeWinners = {}; renderPrizeWinners();
  deck = []; drawn = []; drawnSet.clear();
  stopAuto(); stopTimer();
  $('game-timer').style.display = 'none';
  resetBoard();
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
function offerWinnerPhoto(name, label){
  const card = $('winner-photo-card');
  if(!card) return;
  $('wp-name').textContent = name + ' (' + label + ')';
  $('wp-img').style.display = 'none';
  $('wp-img').removeAttribute('src');
  $('wp-share').style.display = 'none';
  wpFile = null;
  card.dataset.name = name;
  card.dataset.label = label;
  card.style.display = 'block';
}
$('wp-take').addEventListener('click', function(){ $('wp-file').click(); });
$('wp-file').addEventListener('change', function(e){
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const name = $('winner-photo-card').dataset.name || '';
  const label = $('winner-photo-card').dataset.label || '';
  const img = new Image();
  img.onload = function(){
    const W = 800;
    const H = Math.max(1, Math.round(img.height * W / img.width));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H + 100;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, W, H);
    x.fillStyle = '#b71c1c';
    x.fillRect(0, H, W, 100);
    x.fillStyle = '#fff';
    x.font = 'bold 38px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('🏆 ' + name + ' — ' + label, W / 2, H + 50);
    URL.revokeObjectURL(img.src);
    c.toBlob(function(blob){
      if(!blob){ toast('⚠️ फोटो बन नहीं पाई'); return; }
      wpFile = new File([blob], 'winner.jpg', { type:'image/jpeg' });
      $('wp-img').src = URL.createObjectURL(blob);
      $('wp-img').style.display = 'block';
      $('wp-share').style.display = 'inline-block';
      toast('📸 फोटो तैयार — सबको भेज दी गई');
      try{
        const rd = new FileReader();
        rd.onload = function(){
          try{ broadcast({ type:'winner-photo', name:name, prize:'full', label:label, img:rd.result }); }catch(e2){}
        };
        rd.readAsDataURL(blob);
      }catch(e2){}
    }, 'image/jpeg', 0.9);
  };
  img.onerror = function(){ toast('⚠️ यह फोटो नहीं खुली — दोबारा कोशिश करें'); };
  img.src = URL.createObjectURL(f);
  e.target.value = '';
});
$('wp-share').addEventListener('click', function(){
  if(!wpFile){ toast('पहले 📷 से फोटो लें'); return; }
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
