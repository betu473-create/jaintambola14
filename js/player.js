/* ============================================================
   जैन ताम्बोला — खिलाड़ी स्क्रीन लॉजिक v8
   फीचर्स: चैट, रिपीट(1बार), एनाउंसमेंट, विजेता सेलिब्रेशन
   ============================================================ */
const ROOM_PREFIX = 'JT-';
function $(id){ return document.getElementById(id); }

let peer = null, conn = null, myName = '', myTicket = [];
const drawnSet = new Set(), markedSet = new Set();
let muted = false, claimed = false, winner = null;
let lastWord = null;
let wrongClaims = 0;   /* गलत क्लेम की गिनती (3 पर गेम से बाहर) */
const repeatUsed = new Set();

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
    const num = shabdNumber(w);
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
  speakWord(lastWord, JT_CONFIG.SPEAK_TIMES);
  toast('🔁 शब्द दोबारा बोला जा रहा है (सिर्फ 1 बार)');
});

/* ==================== होस्ट के संदेश ==================== */
function onWord(w){
  if(!w) return;
  drawnSet.add(w);
  lastWord = w;
  repeatUsed.delete(w);   /* नया शब्द आया तो उसका रिपीट उपलब्ध */
  if(!muted){ beep(880, 0.3); speakWord(w); }
  const cell = cellMap[w];
  if(cell) cell.classList.add('came');
  setGStatus('📢 शब्द आया: ' + w + (cell ? ' — यह आपकी टिकट में है, तुरंत टैप करें!' : ''));
  updateRepeatBtn();
}

function resetLocal(){
  drawnSet.clear(); markedSet.clear();
  claimed = false; winner = null; lastWord = null;
  wrongClaims = 0;
  repeatUsed.clear();
  myTicket = [];
  $('ticket').innerHTML = '';
  $('repeat-btn').disabled = true;
  $('claim-btn').disabled = true;
  $('claim-btn').textContent = '🏆 Claim — पूरे 12 खंड पूरे होने पर दबाएँ';
  $('announce-banner').classList.remove('show');
  $('winner-box').classList.remove('show');
  $('winner-big').classList.remove('show');
  $('game-over').classList.remove('show');
  updateProgress();
  setGStatus('गेम रीसेट हुआ — नए गेम की प्रतीक्षा…');
}

function onData(d){
  if(!d || typeof d !== 'object') return;
  if(d.type === 'start'){
    resetLocal();
    setGStatus('🎮 गेम शुरू! आपकी डिजिटल टिकट आ रही है…');
  }
  else if(d.type === 'ticket'){
    myTicket = Array.isArray(d.words) ? d.words : [];
    if(Array.isArray(d.drawn)) d.drawn.forEach(function(w){ drawnSet.add(w); });
    renderTicket();
    /* रीकनेक्ट: टिकट सेव करो */
    const rc = ($('room-input').value || '').toUpperCase();
    saveTicketLocal(rc, myTicket, myName);
    setGStatus('🎟 आपकी डिजिटल टिकट तैयार! जैसे ही शब्द आए और वह टिकट में हो, तुरंत टैप करें');
  }
  else if(d.type === 'word'){ onWord(d.word); }
  else if(d.type === 'reset'){ resetLocal(); }
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
    setGStatus('⚠️ आपने 3 बार गलत क्लेम किया। आप इस गेम से बाहर हैं। अगले गेम में खेल सकते हैं।');
    toast('🚫 आप इस गेम से बाहर कर दिए गए हैं');
  }
  else if(d.type === 'claim-result'){ onClaimResult(d); }
}

function onClaimResult(d){
  if(d.ok && d.prize === 'full' && d.name){
    winner = d.name;
    $('claim-btn').disabled = true;
    $('winner-name').textContent = d.name;
    $('winner-box').classList.add('show');
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
      setGStatus('⚠️ आपने 3 बार गलत क्लेम किया। आप इस गेम से बाहर हैं। अगले गेम में खेल सकते हैं।');
      toast('🚫 3 गलत क्लेम — आप इस गेम से बाहर हैं');
      try{ conn.send({ type:'kick', reason:'3 गलत क्लेम' }); }catch(e){}
      return;
    }
    claimed = false;
    if(markedSet.size === JT_CONFIG.TICKET_CELLS) $('claim-btn').disabled = false;
  }
}
$('winner-big-close').addEventListener('click', function(){ $('winner-big').classList.remove('show'); });
$('go-close').addEventListener('click', function(){ $('game-over').classList.remove('show'); });

/* ==================== जुड़ना ==================== */
function join(){
  myName = ($('name-input').value || '').trim();
  const code = ($('room-input').value || '').trim().toUpperCase();
  if(!myName){ toast('कृपया अपना नाम लिखें'); return; }
  if(!/^[A-Z0-9]{6}$/.test(code)){ toast('रूम कोड सही नहीं है (6 अक्षर/अंक)'); return; }
  try{ localStorage.setItem('jt_name', myName); }catch(e){}
  unlockSpeech();
  beep(660, 0.2);
  setPStatus('होस्ट से कनेक्ट हो रहा है…');
  try{ peer = new Peer(); }
  catch(e){ setPStatus('⚠️ कनेक्शन नहीं बना — इंटरनेट जाँचकर दोबारा कोशिश करें'); return; }
  peer.on('open', function(){
    conn = peer.connect(ROOM_PREFIX + code, { reliable:true });
    conn.on('open', function(){
      $('join-card').style.display = 'none';
      $('game-card').style.display = 'block';
      $('p-name').textContent = '🙋 ' + myName;
      setGStatus('✅ जुड़ गए — होस्ट गेम शुरू करेगा');
      try{ conn.send({ type:'join', name:myName, deviceId:deviceId() }); }catch(e){}
    });
    conn.on('data', onData);
    conn.on('close', function(){
      setGStatus('⚠️ होस्ट से कनेक्शन टूटा — पेज रिफ्रेश करके उसी रूम कोड से दोबारा जुड़ें');
    });
  });
  peer.on('error', function(e){
    setPStatus('⚠️ कनेक्शन त्रुटि (' + ((e && e.type) || 'unknown') + ') — रूम कोड जाँचें या होस्ट से पूछें');
  });
}

/* ==================== बटन ==================== */
$('join-btn').addEventListener('click', join);
$('name-input').addEventListener('keydown', function(e){ if(e.key === 'Enter') join(); });
$('room-input').addEventListener('keydown', function(e){ if(e.key === 'Enter') join(); });
$('claim-btn').addEventListener('click', function(){
  if(claimed || winner) return;
  if(markedSet.size !== JT_CONFIG.TICKET_CELLS) return;
  claimed = true;
  $('claim-btn').disabled = true;
  try{
    conn.send({
      type:'claim',
      prize:'full',
      name:myName,
      ticket:myTicket,
      marks:Array.from(markedSet)
    });
  }catch(e){}
  setGStatus('क्लेम भेजा गया (फुल हाउस) — विजेता की घोषणा की प्रतीक्षा…');
});
$('mute-btn').addEventListener('click', function(){
  muted = !muted;
  if(muted){ stopSpeaking(); }
  else{ unlockSpeech(); speakWord('अरिहंत', 1); }
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
