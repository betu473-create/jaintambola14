/* ============================================================
   जैन ताम्बोला — गेम के शब्दों की सूची (लॉक्ड v5.6.9)
   ------------------------------------------------------------
   - 521 शब्दों की सूची अब पासवर्ड से बंद (encrypted) है
   - सही पासवर्ड डालने पर ही खुलती है और उसी फोन में
     सेव रहती है — किसी और के फोन पर नहीं जाती
   - हर शब्द का क्रमांक उसकी स्थिति (index + 1) से बनता है
   ============================================================ */

/* लॉक की हुई सूची (AES-256-GCM) — सही पासवर्ड के बिना
   इसे कोई नहीं खोल सकता */
const JT_WORDS_CIPHER = { iv: '706bbd3bf94471c24e2e2615', data: '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' };

const SHABD_LIST = [];

/* इस फोन में पहले खोली गई सूची लोड करो */
(function(){
  try{
    const saved = JSON.parse(localStorage.getItem('jt_words_unlocked') || 'null');
    if(Array.isArray(saved) && saved.length){
      saved.forEach(function(w){ SHABD_LIST.push(w); });
    }
  }catch(e){}
})();

/* किसी शब्द का क्रमांक (1 से शुरू) जानने के लिए */
function shabdNumber(word){
  const i = SHABD_LIST.indexOf(word);
  return i >= 0 ? i + 1 : 0;
}

/* ============================================================
   अपनी बदली हुई शब्द सूची (words.html से सेव की हुई)
   अगर उपयोगकर्ता ने शब्द जोड़े/हटाए/ठीक किए हैं तो वही
   सूची लोड होगी।
   ============================================================ */
var jtCustomList = false;   /* v5.6.15: कस्टम सूची लगी है तो पैक-आवाज़ क्रमांक मेल नहीं खाते */
try{
  const jtSaved = JSON.parse(localStorage.getItem('jt_word_list') || 'null');
  if(Array.isArray(jtSaved) && jtSaved.length){
    SHABD_LIST.splice(0, SHABD_LIST.length);
    jtSaved.forEach(function(w){ SHABD_LIST.push(w); });
    jtCustomList = true;
  }
}catch(e){}
window.JT_PACK_OK = !jtCustomList;

/* ============================================================
   लॉक खोलना (v5.6.9) — सिर्फ़ होस्ट वाले पेजों पर दिखेगा
   ============================================================ */
function jtWordsLocked(){ return SHABD_LIST.length === 0; }

function _jtHexBytes(h){
  const a = [];
  for(let i = 0; i < h.length; i += 2) a.push(parseInt(h.substr(i, 2), 16));
  return new Uint8Array(a);
}
function _jtB64Bytes(b){
  const s = atob(b), a = new Uint8Array(s.length);
  for(let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
function jtUnlockWords(pass){
  if(!(window.crypto && window.crypto.subtle && window.TextEncoder)){
    return Promise.reject(new Error('no-crypto'));
  }
  return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass))
    .then(function(h){
      return window.crypto.subtle.importKey('raw', h, {name:'AES-GCM'}, false, ['decrypt']);
    })
    .then(function(key){
      return window.crypto.subtle.decrypt(
        {name:'AES-GCM', iv:_jtHexBytes(JT_WORDS_CIPHER.iv)},
        key,
        _jtB64Bytes(JT_WORDS_CIPHER.data)
      );
    })
    .then(function(buf){
      const arr = JSON.parse(new TextDecoder().decode(buf));
      if(!Array.isArray(arr) || !arr.length) throw new Error('bad');
      return arr;
    });
}

/* लॉक बैनर — सिर्फ शब्द सूची (words) पेज पर दिखेगा (v5.6.11) — host/print पर नहीं */
/* पासवर्ड के 5 गलत प्रयास = 30 मिनट बंद (v5.6.10 — PIN जैसा ही नियम) */
const JT_WP_MAX = 5, JT_WP_LOCK_MS = 30 * 60 * 1000;
function _wpFails(){ try{ return parseInt(localStorage.getItem('jt-wp-fail') || '0', 10) || 0; }catch(e){ return 0; } }
function _wpLockUntil(){ try{ return parseInt(localStorage.getItem('jt-wp-lock') || '0', 10) || 0; }catch(e){ return 0; } }
function _wpLocked(){ return Date.now() < _wpLockUntil(); }

function _jtShowLockBanner(){
  try{
    if(!jtWordsLocked()) return;
    if(!/words\.html/i.test(location.href)) return;
    const d = document.createElement('div');
    d.id = 'jt-words-lock';
    d.style.cssText = 'background:#fff;border:2px solid #ff6f00;border-radius:14px;padding:14px 16px;margin:12px 0;text-align:center';
    d.innerHTML = '<div style="font-weight:800;color:#bf360c;font-size:1.05rem">🔒 शब्द सूची लॉक है</div>' +
      '<div style="font-size:.9rem;color:#8d6e63;margin:4px 0 10px">गुप्त पासवर्ड डालें — सूची इसी फोन में खुलकर सेव हो जाएगी (5 गलत कोशिशों पर 30 मिनट बंद रहेगा)</div>' +
      '<input type="password" id="jt-words-pass" placeholder="पासवर्ड" autocomplete="off" ' +
      'style="text-align:center;font-size:1.05rem;padding:8px;border:1.5px solid #ffe0b2;border-radius:10px;width:70%;max-width:240px">' +
      '<button type="button" id="jt-words-open" style="display:block;margin:10px auto 0;padding:8px 22px;background:#e65100;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:1rem">🔓 खोलें</button>' +
      '<div id="jt-words-msg" style="display:none;color:#c62828;font-size:.9rem;margin-top:8px"></div>';
    document.body.insertBefore(d, document.body.firstChild);
    const btn = document.getElementById('jt-words-open');
    const inp = document.getElementById('jt-words-pass');
    const msg = document.getElementById('jt-words-msg');
    if(_wpLocked()){
      const mins = Math.ceil((_wpLockUntil() - Date.now()) / 60000);
      if(msg){ msg.textContent = '⏳ बहुत बार गलत पासवर्ड — ' + mins + ' मिनट बाद कोशिश करें'; msg.style.display = 'block'; }
      if(inp){ inp.disabled = true; }
      if(btn){ btn.disabled = true; }
    }else if(_wpLockUntil() > 0 && Date.now() >= _wpLockUntil()){
      try{ localStorage.removeItem('jt-wp-lock'); localStorage.removeItem('jt-wp-fail'); }catch(e){}
    }
    function tryUnlock(){
      const v = (inp && inp.value ? String(inp.value) : '').trim();
      if(!v) return;
      if(_wpLocked()) return;
      jtUnlockWords(v).then(function(arr){
        try{ localStorage.setItem('jt_words_unlocked', JSON.stringify(arr));
             localStorage.removeItem('jt-wp-fail'); localStorage.removeItem('jt-wp-lock'); }catch(e){}
        d.innerHTML = '<div style="font-weight:800;color:#2e7d32;font-size:1rem">✅ शब्द सूची खुल गई (' + arr.length + ' शब्द) — लोड हो रहा है…</div>';
        setTimeout(function(){ location.reload(); }, 900);
      }).catch(function(){
        const f = _wpFails() + 1;
        try{ localStorage.setItem('jt-wp-fail', String(f)); }catch(e3){}
        if(f >= JT_WP_MAX){
          try{ localStorage.setItem('jt-wp-lock', String(Date.now() + JT_WP_LOCK_MS)); }catch(e4){}
          if(msg){ msg.textContent = '⏳ बहुत बार गलत पासवर्ड — 30 मिनट के लिए बंद'; msg.style.display = 'block'; }
          if(inp){ inp.disabled = true; inp.value = ''; }
          if(btn){ btn.disabled = true; }
        }else{
          if(msg){ msg.textContent = 'गलत पासवर्ड — दोबारा कोशिश करें (' + f + '/' + JT_WP_MAX + ')'; msg.style.display = 'block'; }
          if(inp){ inp.value = ''; try{ inp.focus(); }catch(e2){} }
        }
      });
    }
    if(btn) btn.addEventListener('click', tryUnlock);
    if(inp) inp.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); tryUnlock(); } });
  }catch(e){}
}
if(document.body){ _jtShowLockBanner(); }
else if(document.addEventListener){ document.addEventListener('DOMContentLoaded', _jtShowLockBanner); }
