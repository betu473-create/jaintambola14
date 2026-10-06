/* ============================================================
   जैन ताम्बोला — खिलाड़ी स्क्रीन लॉजिक v8
   फीचर्स: चैट, रिपीट(1बार), एनाउंसमेंट, विजेता सेलिब्रेशन,
   प्राइज़ राउंड (जल्दी पाँच / चार कोन / फुल हाउस),
   नंबर + शब्द दोनों सुनाना (v5.6.3)
   ============================================================ */
const ROOM_PREFIX = 'JT-';
function $(id){ return document.getElementById(id); }

let peer = null, conn = null, myName = '', myTicket = [];
let myNums = [];      /* टिकट के शब्दों के क्रमांक — होस्ट से आते हैं (v5.6.9) */
const drawnSet = new Set(), markedSet = new Set();
let muted = false, claimed = false, winner = null;
let lastWord = null;
let lastNum = 0;      /* आख़िरी बोला गया क्रमांक (रिपीट के लिए) */
let lastPack = 0;     /* v5.6.15: पैक-आवाज़ उपलब्ध है या नहीं */
let wrongClaims = 0;   /* गलत क्लेम की गिनती (3 पर गेम से बाहर) */
const repeatUsed = new Set();
const PRIZE_LABELS = { jp:'जल्दी पाँच', corner:'चार कोन', line:'लाइन', full:'फुल हाउस' };
let myPrizes = { jp:false, corner:false, line:false };
let roundWinners = {};
let myClaimedRounds = {};
let kickedOut = false;   /* 3 गलत क्लेम = गेम से बाहर */

/* ==================== रीकनेक्ट: टिकट सेव/रिस्टोर ==================== */
function saveTicketLocal(roomCode, words, name){
  try{
    localStorage.setItem('jt_reconnect', JSON.stringify({
      room: roomCode, words: words, name: name, time: Date.now()
    }));
  }catch(e){}
}
function getSavedTicket(roomCode){
  try{
    const d = JSON.parse(localStorage.getItem('jt_reconnect') || 'null');
    if(d && d.room === roomCode && (Date.now() - d.time) < 3600000){ /* 1 घंटे के भीतर */
      return d;
    }
  }catch(e){}
  return null;
}
function clearSavedTicket(){
  try{ localStorage.removeItem('jt_reconnect'); }catch(e){}
}

function deviceId(){
  let d = null;
  try{ d = localStorage.getItem('jt_device'); }catch(e){}
  if(!d){
    d = 'D' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try{ localStorage.setItem('jt_device', d); }catch(e){}
  }
  return d;
}
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(function(){ t.classList.remove('show'); }, 2600);
}
function setPStatus(m){ $('p-status').textContent = m; }
function setGStatus(m){ $('g-status').textContent = m; }

/* ==================== णमोकार मंत्र (होस्ट के साथ) — v5.8.12 ==================== */
var musicAudio = null, MUSIC_VOL = 0.25, MUSIC_DUCK = 0.1, musicOn = false, musicDuckTimer = null;
function musicPlay(){
  try{
    if(!musicAudio){ musicAudio = new Audio('audio/mantra.mp3'); musicAudio.loop = true; }
    musicAudio.volume = muted ? 0 : MUSIC_VOL;
    musicAudio.play().catch(function(){});
  }catch(e){}
}
function musicPause(){ try{ if(musicAudio) musicAudio.pause(); }catch(e){} }
/* मंत्र audio unlock — join के टैप पर (v5.8.20) */
function musicUnlock(){
  try{
    if(!musicAudio){ musicAudio = new Audio('audio/mantra.mp3'); musicAudio.loop = true; }
    musicAudio.volume = 0;
    var pr = musicAudio.play();
    function after(){ try{ musicAudio.pause(); musicAudio.currentTime = 0; musicAudio.volume = muted ? 0 : MUSIC_VOL; }catch(e){} }
    if(pr && pr.then){ pr.then(after).catch(function(){ try{ musicAudio.volume = muted ? 0 : MUSIC_VOL; }catch(e){} }); }
    else{ setTimeout(after, 120); }
  }catch(e){}
}
function musicDuck(){
  if(!musicAudio || !musicOn || muted) return;
  try{ musicAudio.volume = MUSIC_DUCK; }catch(e){}
  if(musicDuckTimer) clearTimeout(musicDuckTimer);
  musicDuckTimer = setTimeout(function(){ musicDuckTimer = null; try{ if(musicAudio && musicOn && !muted) musicAudio.volume = MUSIC_VOL; }catch(e){} }, 1900);
}


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
  addChatMsg('आप', msg, 'me');
  try{ conn.send({ type:'chat', msg:msg }); }catch(e){}
  beep(660, 0.1);
}

/* ==================== एनाउंसमेंट ==================== */
function showAnnouncement(msg){
  const b = $('announce-banner');
  b.textContent = '📢 ' + msg;
  b.classList.add('show');
  beep(990, 0.2);
  toast('📢 होस्ट का संदेश: ' + msg);
}

/* ==================== टिकट ==================== */
const cellMap = {};
function renderTicket(){
  const g = $('ticket');
  g.innerHTML = '';
  Object.keys(cellMap).forEach(function(k){ delete cellMap[k]; });
  myTicket.forEach(function(w){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cell';
    const idx = myTicket.indexOf(w);
    const num = myNums[idx] || (typeof shabdNumber === 'function' ? shabdNumber(w) : 0);
    b.innerHTML = '<span class="cell-num">' + num + '</span><span class="cell-word">' + w + '</span>';
    b.addEventListener('click', function(){ tap(w, b); });
    if(drawnSet.has(w)) b.classList.add('came');
    if(markedSet.has(w)) b.classList.add('marked');
    g.appendChild(b);
    cellMap[w] = b;
  });
  updateProgress();
  updateRepeatBtn();
}

function tap(w, el){
  if(markedSet.has(w)) return;
  if(!drawnSet.has(w)){
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    toast('यह शब्द अभी नहीं आया है');
    return;
  }
  markedSet.add(w);
  el.classList.remove('came');
  el.classList.add('marked');
  beep(1320, 0.15);
  updateProgress();
  updateClaimBtn();
  if(markedSet.size === JT_CONFIG.TICKET_CELLS){
    setGStatus('🏆 पूरे 12 खंड (Full House) पूरे! तुरंत Claim बटन दबाएँ');
    toast('🏆 फुल हाउस! अब Claim बटन दबाएँ');
  }
}

function updateProgress(){
  $('progress').textContent = markedSet.size + ' / ' + JT_CONFIG.TICKET_CELLS + ' शब्द पूरे';
}

/* ==================== रिपीट बटन (1 बार) ==================== */
function updateRepeatBtn(){
  const btn = $('repeat-btn');
  if(!lastWord || repeatUsed.has(lastWord)){
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
}
$('repeat-btn').addEventListener('click', function(){
  if(!lastWord || repeatUsed.has(lastWord)) return;
  repeatUsed.add(lastWord);
  $('repeat-btn').disabled = true;
  beep(880, 0.3);
  if(lastPack && lastNum){ speakPack(lastNum, announcePhrase(lastNum, lastWord)); }   /* v5.6.15 */
  else{
    try{ speakWord(announcePhrase(lastNum, lastWord), JT_CONFIG.SPEAK_TIMES); }
    catch(e){ speakWord(lastWord, JT_CONFIG.SPEAK_TIMES); }
  }
  toast('🔁 शब्द दोबारा बोला जा रहा है (सिर्फ 1 बार)');
});

/* ==================== होस्ट के संदेश ==================== */
function onWord(w, num, pack){
  if(!w) return;
  drawnSet.add(w);
  lastWord = w;
  lastNum = num || 0;
  lastPack = pack ? 1 : 0;   /* v5.6.15: पैक-आवाज़ */
  repeatUsed.delete(w);   /* नया शब्द आया तो उसका रिपीट उपलब्ध */
  if(!muted){
    musicDuck();
    beep(880, 0.3);
    if(pack && num){ speakPack(num, announcePhrase(num, w)); }
    else{ try{ speakWord(announcePhrase(num, w)); }catch(e){ speakWord(w); } }
  }
  const cell = cellMap[w];
  if(cell) cell.classList.add('came');
  setGStatus('📢 शब्द आया (क्र. ' + (num || '—') + '): ' + w + (cell ? ' — यह आपकी टिकट में है, तुरंत टैप करें!' : ''));
  updateRepeatBtn();
  updateClaimBtn();
}

function resetLocal(){
  drawnSet.clear(); markedSet.clear();
  claimed = false; winner = null; lastWord = null; lastNum = 0;
  wrongClaims = 0;
  roundWinners = {}; myClaimedRounds = {}; kickedOut = false;
  repeatUsed.clear();
  myTicket = [];
  myNums = [];
  $('ticket').innerHTML = '';
  $('repeat-btn').disabled = true;
  $('claim-btn').disabled = true;
  $('claim-btn').textContent = '🏆 Claim — प्राइज़ पूरा होने पर यह बटन खुद चालू होगा';
  $('announce-banner').classList.remove('show');
  $('winner-box').classList.remove('show');
  $('winner-big').classList.remove('show');
  $('game-over').classList.remove('show');
  $('selfie-card').style.display = 'none';
  $('photo-big').classList.remove('show');
  updateProgress();
  setGStatus('गेम रीसेट हुआ — नए गेम की प्रतीक्षा…');
}

function onData(d){
  if(!d || typeof d !== 'object') return;
  if(d.type === 'music'){ musicOn = !!d.on; if(musicOn) musicPlay(); else musicPause(); return; }
  if(d.type === 'start'){
    resetLocal();
    setGStatus('🎮 गेम शुरू! आपकी डिजिटल टिकट आ रही है…');
  }
  else if(d.type === 'ticket'){
    myTicket = Array.isArray(d.words) ? d.words : [];
    myNums = Array.isArray(d.nums) ? d.nums.slice() : [];   /* क्रमांक होस्ट भेजता है (v5.6.9) */
    if(Array.isArray(d.drawn)) d.drawn.forEach(function(w){ drawnSet.add(w); });
    if(d.prizes && typeof d.prizes === 'object'){
      ['jp','corner','line'].forEach(function(k){
        if(typeof d.prizes[k] === 'boolean') myPrizes[k] = d.prizes[k];
      });
    }
    if(d.winners && typeof d.winners === 'object') roundWinners = d.winners;
    renderTicket();
    updateClaimBtn();
    /* रीकनेक्ट: टिकट सेव करो */
    const rc = ($('room-input').value || '').toUpperCase();
    saveTicketLocal(rc, myTicket, myName);
    setGStatus('🎟 आपकी डिजिटल टिकट तैयार! जैसे ही शब्द आए और वह टिकट में हो, तुरंत टैप करें');
  }
  else if(d.type === 'word'){ onWord(d.word, d.num, d.pack); }
  else if(d.type === 'reset'){ resetLocal(); }
  else if(d.type === 'prizes'){
    if(d.prizes && typeof d.prizes === 'object'){
      ['jp','corner','line'].forEach(function(k){
        if(typeof d.prizes[k] === 'boolean') myPrizes[k] = d.prizes[k];
      });
    }
    if(d.winners && typeof d.winners === 'object') roundWinners = d.winners;
    updateClaimBtn();
  }
  else if(d.type === 'announcement' && d.msg){
    showAnnouncement(String(d.msg).slice(0, 150));
  }
  else if(d.type === 'chat' && d.msg){
    addChatMsg(d.from || 'होस्ट', String(d.msg).slice(0, 200), 'host');
    beep(990, 0.1);
  }
  else if(d.type === 'game-over' && d.winner){
    /* गेम ओवर स्क्रीन (अगर पहले न दिखा हो) */
    if(!winner){
      winner = d.winner;
      $('claim-btn').disabled = true;
      $('winner-name').textContent = d.winner;
      $('winner-box').classList.add('show');
    }
    $('go-winner').textContent = '🏆 विजेता: ' + d.winner;
    $('go-sub').innerHTML = (d.winner === myName
      ? 'बधाई हो! आप फुल हाउस विजेता हैं!<br>नए गेम के लिए होस्ट की प्रतीक्षा करें।'
      : 'विजेता: ' + d.winner + '<br>नए गेम के लिए होस्ट की प्रतीक्षा करें।');
    $('winner-big').classList.remove('show');
    $('game-over').classList.add('show');
    clearSavedTicket();
  }
  else if(d.type === 'kicked'){
    $('claim-btn').disabled = true;
    $('claim-btn').textContent = '🚫 गेम से बाहर';
    kickedOut = true;
    setGStatus('⚠️ आपने 3 बार गलत क्लेम किया। आप इस गेम से बाहर हैं। अगले गेम में खेल सकते हैं।');
    toast('🚫 आप इस गेम से बाहर कर दए गए हैं');
  }
  else if(d.type === 'winner-photo'){ showWinnerPhoto(d); }
  else if(d.type === 'claim-result'){ onClaimResult(d); }
}

function onClaimResult(d){
  if(d.ok && d.prize && d.prize !== 'full' && d.name){
    /* जल्दी पाँच / चार कोन / लाइन का विजेता — गेम जारी रहेगा */
    roundWinners[d.prize] = d.name;
    if(d.name === myName){
      myClaimedRounds[d.prize] = true;
      claimed = false;
      confettiBurst();
      if(!muted) beep(1150, 0.4);
      toast('🏅 बधाई! आपने ' + (PRIZE_LABELS[d.prize] || '') + ' जीता!');
      setGStatus('🏅 आपने ' + (PRIZE_LABELS[d.prize] || '') + ' जीता! गेम जारी — अगले प्राइज़ की प्रतीक्षा…');
      showSelfieCard(d.prize);
    }else{
      toast('🏅 ' + (PRIZE_LABELS[d.prize] || '') + ' विजेता: ' + d.name);
      setGStatus('🏅 ' + (PRIZE_LABELS[d.prize] || '') + ' विजेता: ' + d.name + ' — गेम जारी');
    }
    updateClaimBtn();
  }
  else if(d.ok && d.prize === 'full' && d.more && d.name){
    /* v5.6.19: फुल हाउस जीता — पर गेम जारी है (1/2/3 विजेता सिस्टम) */
    toast('🏆 फुल हाउस ' + d.count + '/' + d.total + ' — ' + d.name + '। गेम जारी…');
    setGStatus('🏆 फुल हाउस ' + d.count + '/' + d.total + ': ' + d.name + ' — गेम जारी! अगले विजेता की प्रतीक्षा…');
    $('winner-big-name').textContent = d.name;
    $('winner-big-sub').textContent = (d.name === myName)
      ? '🏆 बधाई हो! फुल हाउस ' + d.count + '/' + d.total + ' जीता! 🏆'
      : 'फुल हाउस विजेता ' + d.count + '/' + d.total + ' — गेम जारी';
    $('winner-big').classList.add('show');
    confettiBurst();
    if(!muted) beep(1200, 0.4);
    setTimeout(function(){ $('winner-big').classList.remove('show'); }, 3000);
    if(d.name === myName){
      winner = d.name;
      $('claim-btn').disabled = true;
      showSelfieCard('full');
    }
  }
  else if(d.ok && d.prize === 'full' && d.name){
    winner = d.name;
    $('claim-btn').disabled = true;
    $('winner-name').textContent = d.name;
    $('winner-box').classList.add('show');
    if(d.name === myName) showSelfieCard('full');
    /* बड़ा विजेता बैनर */
    $('winner-big-name').textContent = d.name;
    $('winner-big-sub').textContent = (d.name === myName) ? '🏆 बधाई हो! आप विजेता हैं! 🏆' : 'फुल हाउस विजेता';
    $('winner-big').classList.add('show');
    confettiBurst();
    if(!muted) beep(1200, 0.5);
    setGStatus(d.name === myName
      ? '🏆 बधाई हो! आप फुल हाउस विजेता हैं!'
      : '🏆 फुल हाउस विजेता: ' + d.name);
    /* गेम ओवर स्क्रीन दिखाओ */
    $('go-winner').textContent = '🏆 विजेता: ' + d.name;
    $('go-sub').innerHTML = (d.name === myName
      ? 'बधाई हो! आप फुल हाउस विजेता हैं!<br>नए गेम के लिए होस्ट की प्रतीक्षा करें।'
      : 'विजेता: ' + d.name + '<br>नए गेम के लिए होस्ट की प्रतीक्षा करें।');
    setTimeout(function(){
      $('winner-big').classList.remove('show');
      $('game-over').classList.add('show');
    }, 3500);
    clearSavedTicket();
  }else{
    if(d.late){
      toast('थोड़ा देर हो गई — किसी और ने पहले सही क्लेम कर लिया');
      return;
    }
    /* गलत क्लेम गिनती */
    wrongClaims++;
    toast('क्लेम अमान्य था — दोबारा कोशिश करें (' + wrongClaims + '/3)');
    if(wrongClaims >= 3){
      /* 3 गलत क्लेम = गेम से बाहर */
      $('claim-btn').disabled = true;
      $('claim-btn').textContent = '🚫 3 गलत क्लेम — गेम से बाहर';
      kickedOut = true;
      setGStatus('⚠️ आपने 3 बार गलत क्लेम किया। आप इस गेम से बाहर हैं। अगले गेम में खेल सकते हैं।');
      toast('🚫 3 गलत क्लेम — आप इस गेम से बाहर हैं');
      try{ conn.send({ type:'kick', reason:'3 गलत क्लेम' }); }catch(e){}
      return;
    }
    claimed = false;
    updateClaimBtn();
  }
}
/* ==================== विजेता सेल्फ़ी + फोटो (v5.6) ==================== */
function showSelfieCard(prize){
  const c = $('selfie-card');
  if(!c) return;
  /* v5.9: खिलाड़ी ने "आगे से फोटो न माँगें" चुना है → कार्ड न दिखाओ */
  try{ if(localStorage.getItem('jt-no-selfie') === '1'){ try{ conn.send({ type:'selfie-skip', name:myName, prize:prize || 'full' }); }catch(e2){} return; } }catch(e){}
  c.dataset.prize = prize || 'full';
  c.style.display = 'block';
  try{ c.scrollIntoView({ behavior:'smooth', block:'center' }); }catch(e){}
  if(!muted) beep(1320, 0.2);
  toast('📸 आपकी फोटो सबकी स्क्रीन पर दिखेगी — नीचे बटन दबाएँ');
}
$('selfie-take').addEventListener('click', function(){ $('selfie-file').click(); });
$('selfie-file').addEventListener('change', function(e){
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const prize = $('selfie-card').dataset.prize || 'full';
  const label = PRIZE_LABELS[prize] || 'फुल हाउस';
  const img = new Image();
  img.onload = function(){
    const W = 720;
    const H = Math.max(1, Math.round(img.height * W / img.width));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H + 96;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, W, c.height);
    x.drawImage(img, 0, 0, W, H);
    x.fillStyle = '#b71c1c';
    x.fillRect(0, H, W, 96);
    x.fillStyle = '#fff';
    x.font = 'bold 40px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('🏆 ' + myName + ' — ' + label, W / 2, H + 48);
    URL.revokeObjectURL(img.src);
    const data = c.toDataURL('image/jpeg', 0.75);
    try{ conn.send({ type:'winner-selfie', name:myName, prize:prize, img:data }); }catch(err){}
    $('selfie-card').style.display = 'none';
    toast('📸 फोटो भेज दी गई — अब सबकी स्क्रीन पर दिखेगी!');
  };
  img.onerror = function(){ toast('⚠️ फोटो नहीं खुली — दोबारा कोशिश करें'); };
  img.src = URL.createObjectURL(f);
  e.target.value = '';
});
/* v5.9: फोटो छोड़ने का विकल्प (opt-out) — फोटो देना ज़रूरी नहीं */
var _ss = $('selfie-skip');
if(_ss) _ss.addEventListener('click', function(){
  var prize = $('selfie-card').dataset.prize || 'full';
  var never = $('selfie-never') && $('selfie-never').checked;
  if(never){ try{ localStorage.setItem('jt-no-selfie','1'); }catch(e){} }
  try{ conn.send({ type:'selfie-skip', name:myName, prize:prize }); }catch(e){}
  $('selfie-card').style.display = 'none';
  toast(never ? '👍 ठीक — आगे से फोटो नहीं माँगी जाएगी' : '👍 ठीक — फोटो छोड़ दी गई');
});
function showWinnerPhoto(d){
  if(!d || !d.img || !d.name) return;
  $('photo-big-name').textContent = d.name;
  $('photo-big-sub').textContent = (d.label || PRIZE_LABELS[d.prize] || 'फुल हाउस') + ' के विजेता — बधाई हो! 🎉' + (d.name === myName ? ' (आप!)' : '');
  $('photo-big-img').src = d.img;
  $('photo-big').classList.add('show');
  if(!muted) beep(1150, 0.4);
}
$('photo-big-close').addEventListener('click', function(){ $('photo-big').classList.remove('show'); });
$('winner-big-close').addEventListener('click', function(){ $('winner-big').classList.remove('show'); });
$('go-close').addEventListener('click', function(){ $('game-over').classList.remove('show'); });

/* ==================== प्राइज़ (v5.6) ==================== */
function prizeEligible(){
  const mk = function(i){ return !!myTicket[i] && markedSet.has(myTicket[i]); };
  if(myTicket.length === JT_CONFIG.TICKET_CELLS &&
     myTicket.every(function(w){ return markedSet.has(w); })) return 'full';
  if(myPrizes.line){
    for(let r = 0; r < 3; r++){
      if(mk(r*4) && mk(r*4+1) && mk(r*4+2) && mk(r*4+3)) return 'line';
    }
  }
  if(myPrizes.corner && mk(0) && mk(3) && mk(8) && mk(11)) return 'corner';
  if(myPrizes.jp && markedSet.size >= 5) return 'jp';
  return null;
}
function updateClaimBtn(){
  const btn = $('claim-btn');
  if(!btn) return;
  if(kickedOut){ btn.disabled = true; btn.textContent = '🚫 3 गलत क्लेम — गेम से बाहर'; return; }
  if(winner || claimed){ btn.disabled = true; return; }
  const p = prizeEligible();
  if(p && !roundWinners[p] && !myClaimedRounds[p]){
    btn.disabled = false;
    btn.textContent = '🏆 Claim — ' + (PRIZE_LABELS[p] || '') + ' पूरी! अब दबाएँ';
  }else{
    btn.disabled = true;
    btn.textContent = '🏆 Claim — प्राइज़ पूरा होने पर यह बटन खुद चालू होगा';
  }
}

/* ==================== जुड़ना ==================== */
let myRoomCode = '';
let retryTimer = null, retryCount = 0;
const RETRY_MAX = 45;   /* ~3 मिनट तक अपने-आप कोशिश */
const RETRY_MS = 4000; /* हर 4 सेकंड में दोबारा कोशिश */

function stopRetry(){
  if(retryTimer){ clearTimeout(retryTimer); retryTimer = null; }
}
function scheduleRetry(){
  if(winner || kickedOut) return;
  if(retryTimer) return;
  retryCount++;
  if(retryCount > RETRY_MAX){
    setGStatus('⚠️ होस्ट से कनेक्शन नहीं बन पाया — पेज रिफ्रेश करके उसी रूम कोड से दोबारा जुड़ें');
    return;
  }
  retryTimer = setTimeout(function(){
    retryTimer = null;
    connectToHost();
  }, RETRY_MS);
}

function connectToHost(){
  stopRetry();
  try{ if(peer) peer.destroy(); }catch(e){}
  if(retryCount > 0){
    setGStatus('🔄 होस्ट से दोबारा जुड़ने की कोशिश… (' + retryCount + '/' + RETRY_MAX + ') — टिकट सुरक्षित है');
  }else{
    setPStatus('होस्ट से कनेक्ट हो रहा है…');
  }
  try{ peer = new Peer(); }
  catch(e){
    setPStatus('⚠️ कनेक्शन नहीं बना — इंटरनेट जाँचकर दोबारा कोशिश करें');
    scheduleRetry();
    return;
  }
  peer.on('open', function(){
    conn = peer.connect(ROOM_PREFIX + myRoomCode, { reliable:true });
    conn.on('open', function(){
      retryCount = 0;
      $('join-card').style.display = 'none';
      $('game-card').style.display = 'block';
      $('p-name').textContent = '🙋 ' + myName;
      setGStatus('✅ जुड़ गए — होस्ट गेम शुरू करेगा');
      try{ conn.send({ type:'join', name:myName, deviceId:deviceId() }); }catch(e){}
    });
    conn.on('data', onData);
    conn.on('close', function(){
      if(winner || kickedOut){ setGStatus('गेम खत्म — धन्यवाद! 🙏'); return; }
      setGStatus('⚠️ होस्ट से कनेक्शन टूटा — अपने-आप दोबारा जुड़ने की कोशिश जारी… आपकी टिकट सुरक्षित है');
      scheduleRetry();
    });
  });
  peer.on('error', function(e){
    if(retryCount === 0 && (e && e.type === 'peer-unavailable')){
      setPStatus('⚠️ यह रूम कोड अभी नहीं मिला — कोड जाँचें या होस्ट से पूछें (अपने-आप दोबारा कोशिश जारी)');
    }
    scheduleRetry();
  });
}

function join(){
  myName = ($('name-input').value || '').trim();
  const code = ($('room-input').value || '').trim().toUpperCase();
  if(!myName){ toast('कृपया अपना नाम लिखें'); return; }
  if(!/^[A-Z0-9]{6}$/.test(code)){ toast('रूम कोड सही नहीं है (6 अक्षर/अंक)'); return; }
  try{ localStorage.setItem('jt_name', myName); }catch(e){}
  unlockSpeech(); musicUnlock();
  beep(660, 0.2);
  myRoomCode = code;
  retryCount = 0;
  connectToHost();
}

/* ==================== बटन ==================== */
$('join-btn').addEventListener('click', join);
$('name-input').addEventListener('keydown', function(e){ if(e.key === 'Enter') join(); });
$('room-input').addEventListener('keydown', function(e){ if(e.key === 'Enter') join(); });
$('claim-btn').addEventListener('click', function(){
  if(claimed || winner || kickedOut) return;
  const prize = prizeEligible();
  if(!prize || roundWinners[prize] || myClaimedRounds[prize]) return;
  claimed = true;
  $('claim-btn').disabled = true;
  try{
    conn.send({
      type:'claim',
      prize: prize,
      name:myName,
      ticket:myTicket,
      marks:Array.from(markedSet)
    });
  }catch(e){}
  setGStatus('क्लेम भेजा गया (' + (PRIZE_LABELS[prize] || 'फुल हाउस') + ') — विजेता की घोषणा की प्रतीक्षा…');
});
$('mute-btn').addEventListener('click', function(){
  muted = !muted;
  if(muted){ stopSpeaking(); }
  else{ unlockSpeech(); speakWord('अरिहंत', 1); }
  try{ if(musicAudio) musicAudio.volume = muted ? 0 : MUSIC_VOL; }catch(e){}
  $('mute-btn').textContent = muted ? '🔇 आवाज़ बंद' : '🔊 आवाज़ चालू';
});
$('chat-send').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', function(e){ if(e.key === 'Enter') sendChat(); });

/* ==================== शुरुआत ==================== */
(function(){
  const urlRoom = (new URLSearchParams(location.search).get('room') || '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
  if(urlRoom){
    $('room-input').value = urlRoom;
    $('room-label').style.display = 'none';
  }
  let saved = null;
  try{ saved = localStorage.getItem('jt_name'); }catch(e){}
  if(saved) $('name-input').value = saved;
})();
