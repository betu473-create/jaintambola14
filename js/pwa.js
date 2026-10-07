/* Service Worker पंजीकरण — PWA/APK बनाने के लिए ज़रूरी */
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js').catch(function(){
      /* offline install न हो पाए तो भी गेम ऑनलाइन चलता रहेगा */
    });
  });
}

/* 🔄 पक्का अपडेट system (v5.8.17)
   - version localStorage me yaad (jt_ver_seen) — ek baar dikha to dobara nahi
   - popup khud-ba-khud 10 second me hat jata hai
   - reload me cache-bust (?u=...) — taaki WebView ka purana cache bhi hatt jaye */
(function(){
  var KEY = 'jt_ver_seen';
  function getSeen(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
  function setSeen(v){ try{ if(v) localStorage.setItem(KEY, String(v)); }catch(e){} }
  function getSwVer(cb){
    try{ fetch('./sw.js', {cache:'no-store'}).then(function(r){ return r.text(); }).then(function(t){
      var m = t.match(/jain-tambola-v(\d+)/); cb(m ? m[1] : null);
    }).catch(function(){ cb(null); }); }catch(e){ cb(null); }
  }
  function reloadFresh(){
    try{
      var u = location.pathname + '?u=' + Date.now() + (location.hash || '');
      location.replace(u);
    }catch(e){ try{ location.reload(); }catch(e2){} }
  }
  function forceUpdate(msg){
    function say(t){ try{ if(typeof msg === 'function') msg(t); }catch(e){} }
    say('🔄 नया वर्ज़न लाया जा रहा है…');
    getSwVer(function(nv){
      setSeen(nv);
      try{
        caches.keys()
          .then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })
          .then(function(){ return ('serviceWorker' in navigator) ? navigator.serviceWorker.getRegistrations() : []; })
          .then(function(rs){ return Promise.all(rs.map(function(r){ return r.unregister(); })); })
          .then(reloadFresh).catch(reloadFresh);
      }catch(e){ reloadFresh(); }
    });
  }
  window.jtForceUpdate = forceUpdate;
  window.jtCheckUpdate = function(msg){
    function say(t){ try{ if(typeof msg === 'function') msg(t); }catch(e){} }
    say('⏳ जाँच हो रही है…');
    getSwVer(function(nv){
      if(!nv){ say('❌ जाँच नहीं हो पाई — इंटरनेट देख लें'); return; }
      if(getSeen() && String(getSeen()) !== String(nv)){ forceUpdate(msg); }
      else{ setSeen(nv); say('✅ आपके पास नया वर्ज़न ही है'); }
    });
  };
  function popup(){
    if(document.getElementById('jt-upd-pop')) return;
    var d = document.createElement('div');
    d.id = 'jt-upd-pop';
    d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:99998;background:#e65100;color:#fff;border-radius:14px;padding:12px 16px;font-weight:800;box-shadow:0 6px 22px rgba(0,0,0,.3);max-width:92%;text-align:center;font-size:.95rem';
    d.innerHTML = '🔄 नया वर्ज़न आ गया! <button id="jt-upd-go" style="margin-left:8px;background:#fff;color:#e65100;border:none;border-radius:10px;padding:8px 14px;font-weight:900;font-size:.9rem">अभी लाएँ</button> <button id="jt-upd-later" style="margin-left:4px;background:transparent;color:#fff;border:1.5px solid #fff;border-radius:10px;padding:8px 12px;font-weight:800;font-size:.85rem">बाद में</button>';
    document.body.appendChild(d);
    function gone(){ getSwVer(setSeen); try{ d.remove(); }catch(e){ d.style.display = 'none'; } }
    var g = document.getElementById('jt-upd-go');
    if(g) g.addEventListener('click', function(){ d.textContent = '🔄 नया वर्ज़न लाया जा रहा है…'; forceUpdate(); });
    var l = document.getElementById('jt-upd-later');
    if(l) l.addEventListener('click', gone);
    setTimeout(gone, 10000);   /* 10 सेकंड बाद खुद हट जाओ (और याद रखो) */
  }
  window.addEventListener('load', function(){
    setTimeout(function(){
      getSwVer(function(nv){
        if(!nv) return;
        var seen = getSeen();
        if(!seen){ setSeen(nv); return; }
        if(String(seen) !== String(nv)) popup();
      });
    }, 2500);
  });
})();


/* ============================================================
   🔎 बड़ा फ़ॉन्ट / Accessibility mode (v5.9)
   ------------------------------------------------------------
   - html par 'jt-big' class लगाता है → सारे rem फ़ॉन्ट बड़े
   - हर पेज पर नीचे-बाएँ एक छोटा बटन ख़ुद बन जाता है (toggle)
   - पसंद फ़ोन में याद रहती है (localStorage: jt-big)
   ============================================================ */
(function(){
  function on(){ try{ return localStorage.getItem('jt-big') === '1'; }catch(e){ return false; } }
  function apply(){ try{ document.documentElement.classList.toggle('jt-big', on()); }catch(e){} }
  function label(){ return on() ? '🔎 सामान्य अक्षर' : '🔎 बड़ा अक्षर'; }
  function addBtn(){
    if(document.getElementById('jt-a11y-btn')) return;
    var b = document.createElement('button');
    b.id = 'jt-a11y-btn'; b.type = 'button'; b.textContent = label();
    b.title = 'अक्षर छोटे/बड़े करें';
    b.addEventListener('click', function(){
      try{ localStorage.setItem('jt-big', on() ? '0' : '1'); }catch(e){}
      try{ if(window.jtAna) jtAna.count('big_font'); }catch(e){}
      apply(); b.textContent = label();
    });
    (document.body || document.documentElement).appendChild(b);
  }
  function injectCSS(){
    if(document.getElementById('jt-a11y-css')) return;
    var s = document.createElement('style');
    s.id = 'jt-a11y-css';
    s.textContent =
      'html.jt-big{font-size:118%;}' +
      'html.jt-big .btn{font-size:1.14rem;padding:16px 20px;}' +
      'html.jt-big .btn.small{font-size:.98rem;}' +
      'html.jt-big .muted{font-size:.98rem;}' +
      'html.jt-big .txt,html.jt-big input,html.jt-big select,html.jt-big textarea{font-size:1.12rem;}' +
      'html.jt-big .card h2,html.jt-big h2{font-size:1.3rem;}' +
      'html.jt-big .chip,html.jt-big .tag,html.jt-big .player-pill{font-size:.95rem;}' +
      'html.jt-big .toast{font-size:1rem;}' +
      'html.jt-big body{color:#241812;}' +
      'html.jt-big .muted{color:#4e342e;}' +
      'html.jt-big .card{border-color:#e0c9a6;}' +
      '#jt-a11y-btn{position:fixed;left:12px;bottom:12px;z-index:99998;background:#263238;color:#ffd54f;border:none;border-radius:999px;padding:10px 15px;font-weight:700;font-size:.86rem;font-family:inherit;box-shadow:0 3px 12px rgba(0,0,0,.35);cursor:pointer;opacity:.94}' +
      '#jt-a11y-btn:active{transform:scale(.96)}' +
      '@media print{#jt-a11y-btn{display:none}}';
    (document.head || document.documentElement).appendChild(s);
  }
  function start(){ injectCSS(); apply(); addBtn(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();


/* ============================================================
   📊 ऑप्ट-इन आँकड़े (v6.5)
   ------------------------------------------------------------
   सिर्फ इसी फ़ोन में गिनती — कुछ भी बाहर नहीं भेजा जाता।
   डिफ़ॉल्ट बंद; चालू करने पर ही दर्ज होता है।
   ============================================================ */
(function(){
  var K_ON = 'jt_analytics', K_ST = 'jt_ana_stats';
  function enabled(){ try{ return localStorage.getItem(K_ON) === '1'; }catch(e){ return false; } }
  function setEnabled(v){ try{ localStorage.setItem(K_ON, v ? '1' : '0'); }catch(e){} }
  function get(){ try{ return JSON.parse(localStorage.getItem(K_ST) || '{}') || {}; }catch(e){ return {}; } }
  function count(key, n){ if(!enabled()) return; var s = get(); s[key] = (s[key] || 0) + (n || 1); try{ localStorage.setItem(K_ST, JSON.stringify(s)); }catch(e){} }
  function clear(){ try{ localStorage.removeItem(K_ST); }catch(e){} }
  window.jtAna = { enabled:enabled, setEnabled:setEnabled, get:get, count:count, clear:clear };

  function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  ready(function(){
    var cb = document.getElementById('ana-on');
    if(!cb) return;
    var box = document.getElementById('ana-box');
    var NAMES = { game_started:'गेम शुरू', words_drawn:'शब्द निकाले', claims:'क्लेम', big_font:'बड़ा अक्षर', family_on:'फैमिली मोड', selfie_skip:'फोटो छोड़ी', bulk_rec:'बल्क रिकॉर्डिंग' };
    function paint(){
      if(!box) return;
      var s = get(), keys = Object.keys(s);
      if(!keys.length){ box.textContent = enabled() ? 'अभी कोई आँकड़ा नहीं — खेलते ही भरने लगेगा।' : '🔒 आँकड़े बंद हैं।'; return; }
      box.innerHTML = keys.map(function(k){ return '• ' + (NAMES[k] || k) + ': <b>' + s[k] + '</b>'; }).join('<br>');
    }
    cb.checked = enabled();
    paint();
    cb.addEventListener('change', function(){ setEnabled(!!cb.checked); paint(); });
    var rf = document.getElementById('ana-refresh'); if(rf) rf.addEventListener('click', paint);
    var cl = document.getElementById('ana-clear'); if(cl) cl.addEventListener('click', function(){ clear(); paint(); });
  });
})();


/* ============================================================
   🙏 सहयोग करें — UPI (v6.12)
   ------------------------------------------------------------
   Voluntarily support. Host apna UPI ID settings me daalta hai;
   QR + 'UPI ऐप में खोलें' button ban jaata hai. Koi payment
   gateway nahi — seedha UPI deep-link.
   ============================================================ */
(function(){
  function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  ready(function(){
    var inp = document.getElementById('upi-id');
    var sv = document.getElementById('upi-save');
    var box = document.getElementById('upi-box');
    if(!inp || !box) return;
    /* v6.14.5: 'अपना गेम' मोड में payment QR (developer ka) na dikhe */
    try{
      var _own = (localStorage.getItem('jt-own-mode') === '1') || /[?&]own=1/.test(location.search || '');
      if(_own){ var uc = document.getElementById('upi-card'); if(uc) uc.style.display = 'none'; }
    }catch(e){}
    var DEFAULT_UPI = 'himanshujain@sbi';   /* v6.17: app mein BAKED — site-data clear ke baad bhi rahega */
    function load(){ try{ return localStorage.getItem('jt_upi') || DEFAULT_UPI; }catch(e){ return DEFAULT_UPI; } }
    function render(){
      var id = load().trim();
      if(!id){ box.innerHTML = '<span class="muted">UPI ID डालकर सेव करें — फिर QR और भेजने का बटन दिखेगा।</span>'; return; }
      var upi = 'upi://pay?pa=' + encodeURIComponent(id) + '&pn=' + encodeURIComponent('Tambola App') + '&cu=INR';
      var html = '<div style="font-weight:800;font-size:1.05rem;color:#4e342e;word-break:break-all">UPI ID: ' + id + '</div>' +
        '<div class="btn-row" style="margin-top:8px">' +
          '<a class="btn small" href="' + upi + '" style="text-decoration:none">📲 UPI ऐप में खोलें</a>' +
          '<button class="btn small ghost" id="upi-copy" type="button">📋 UPI ID कॉपी करें</button>' +
        '</div>' +
        '<div id="upi-qr" style="margin-top:10px;text-align:center"></div>' +
        '<p class="muted" style="margin:6px 0 0;font-size:.82rem">QR स्कैन करें, या UPI ID कॉपी करके अपने UPI ऐप में भेजें।<br>(ऐप में "UPI ऐप में खोलें" न चले तो QR या कॉपी इस्तेमाल करें।)</p>';
      box.innerHTML = html;
      try{
        var cpy = document.getElementById('upi-copy');
        if(cpy) cpy.addEventListener('click', function(){
          function done(){ try{ if(typeof toast==='function') toast('📋 UPI ID कॉपी हो गई — UPI ऐप में paste करें'); }catch(e){} }
          function fb(){ try{ var ta=document.createElement('textarea'); ta.value=id; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); }catch(e){ try{ window.prompt('UPI ID:', id); }catch(e2){} } }
          try{ if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(id).then(done).catch(fb); } else fb(); }catch(e){ fb(); }
        });
      }catch(e){}
      try{
        if(typeof qrcode === 'function'){
          var q = qrcode(0, 'M'); q.addData(upi); q.make();
          var el = document.getElementById('upi-qr');
          if(el) el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2 });
        }
      }catch(e){}
    }
    inp.value = load();
    render();
    if(sv) sv.addEventListener('click', function(){
      var v = (inp.value || '').trim();
      try{ localStorage.setItem('jt_upi', v); }catch(e){}
      render();
      try{ if(typeof toast === 'function') toast(v ? '✅ UPI ID सेव हो गया' : 'UPI ID हटा दिया'); }catch(e){}
    });
  });
})();
