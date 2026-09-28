/* ============================================================
   जैन ताम्बोला — आवाज़ (Text-to-Speech + बीप)
   ------------------------------------------------------------
   फिक्स 1: Web Speech API से हर शब्द हिंदी (hi-IN) में
           एक बार साफ़-साफ़ बोला जाता है।
   फिक्स 2: मोबाइल ब्राउज़र पर बिना टैप के आवाज़ नहीं बजती —
           इसलिए "आवाज़ अनलॉक" जोड़ा गया है।
   फिक्स 3 (v5.6.1): कुछ शब्द अटकते थे — अब (a) keep-alive
           सिर्फ resume करता है (pause हटाया — वही आवाज़ काट
           रहा था), (b) शब्द बीच में छूटने पर ऐप खुद एक बार
           दोबारा बोलती है।
   ============================================================ */
let _hiVoice = null;
let _speechUnlocked = false;

function _loadHindiVoice(){
  if(!('speechSynthesis' in window)) return;
  const vs = window.speechSynthesis.getVoices() || [];
  _hiVoice =
    vs.find(function(v){ return /^hi(\b|-)/i.test(v.lang); }) ||
    vs.find(function(v){ return /hindi|हिन्दी|हिंदी/i.test(v.name); }) ||
    vs.find(function(v){ return /en-IN/i.test(v.lang); }) ||  /* फॉलबैक: भारतीय अंग्रेज़ी */
    null;
}
if('speechSynthesis' in window){
  _loadHindiVoice();
  window.speechSynthesis.onvoiceschanged = _loadHindiVoice;
  /* कुछ ब्राउज़र में voices देर से लोड होते हैं */
  setTimeout(_loadHindiVoice, 500);
  setTimeout(_loadHindiVoice, 1500);
}

/* आवाज़ अनलॉक — यूज़र के बटन दबाने पर कॉल होता है */
function unlockSpeech(){
  if(_speechUnlocked) return;
  if(!('speechSynthesis' in window)) return;
  try{
    /* एक खाली/बेहद छोटी आवाज़ बोलकर इंजन को अनलॉक करते हैं */
    const u = new SpeechSynthesisUtterance('अ');
    u.lang = 'hi-IN';
    u.volume = 0.1;
    u.rate = 2;
    window.speechSynthesis.speak(u);
    _speechUnlocked = true;
  }catch(e){}
}

/* मोबाइल बग: speechSynthesis जम जाता है — हल्का रिज़्यूम
   (पुराना pause+resume बोलती आवाज़ को काट रहा था, इसलिए
   अब सिर्फ resume) */
if('speechSynthesis' in window){
  setInterval(function(){
    try{
      if(window.speechSynthesis.speaking || window.speechSynthesis.pending){
        window.speechSynthesis.resume();
      }
    }catch(e){}
  }, 5000);
}

/* शब्द को हिंदी में निर्धारित बार (default: 1) बोलकर सुनाता है।
   अगर इंजन शब्द बीच में छोड़ दे तो एक बार दोबारा कोशिश करता है। */
function speakWord(word, times, _isRetry){
  if(!('speechSynthesis' in window)) return;
  const n = times || (window.JT_CONFIG ? JT_CONFIG.SPEAK_TIMES : 1);
  try{ window.speechSynthesis.cancel(); }catch(e){}
  for(let i = 0; i < n; i++){
    const u = new SpeechSynthesisUtterance(String(word || '').trim());
    u.lang   = (window.JT_CONFIG && JT_CONFIG.SPEAK_LANG) || 'hi-IN';
    u.rate   = (window.JT_CONFIG && JT_CONFIG.SPEAK_RATE) || 0.9;
    u.pitch  = 1;
    u.volume = 1;
    if(_hiVoice) u.voice = _hiVoice;
    /* शब्द अटक/छूट जाए तो एक बार दोबारा — लेकिन रुकावट-वाले
       cancel को ग़लती न समझें */
    u.onerror = function(ev){
      if(_isRetry) return;
      if(ev && (ev.error === 'interrupted' || ev.error === 'canceled')) return;
      setTimeout(function(){ speakWord(word, 1, true); }, 450);
    };
    window.speechSynthesis.speak(u);
  }
}

function stopSpeaking(){
  try{ window.speechSynthesis.cancel(); }catch(e){}
}

/* छोटी बीप आवाज़ (Web Audio API) */
let _audioCtx = null;
function beep(freq, dur){
  try{
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if(_audioCtx.state === 'suspended') _audioCtx.resume();
    const o = _audioCtx.createOscillator();
    const g = _audioCtx.createGain();
    const t = _audioCtx.currentTime;
    const d = dur || 0.35;
    o.type = 'sine';
    o.frequency.value = freq || 880;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(_audioCtx.destination);
    o.start(t);
    o.stop(t + d + 0.05);
  }catch(e){}
}
