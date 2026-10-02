/* Service Worker पंजीकरण — PWA/APK बनाने के लिए ज़रूरी */
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js').catch(function(){
      /* offline install न हो पाए तो भी गेम ऑनलाइन चलता रहेगा */
    });
  });
}

/* 🔄 पक्का अपडेट system (v5.8.16) — नया version आने पर popup + force update
   version localStorage me yaad rakhte hain (cache naam par bharosa nahi) */
(function(){
  var KEY = 'jt_ver_seen';
  function getSeen(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
  function setSeen(v){ try{ if(v) localStorage.setItem(KEY, String(v)); }catch(e){} }
  function getSwVer(cb){
    try{ fetch('./sw.js', {cache:'no-store'}).then(function(r){ return r.text(); }).then(function(t){
      var m = t.match(/jain-tambola-v(\d+)/); cb(m ? m[1] : null);
    }).catch(function(){ cb(null); }); }catch(e){ cb(null); }
  }
  function forceUpdate(msg){
    function say(t){ try{ if(typeof msg === 'function') msg(t); }catch(e){} }
    say('🔄 नया वर्ज़न लाया जा रहा है…');
    getSwVer(function(nv){
      setSeen(nv);
      function done(){ try{ location.reload(); }catch(e){} }
      try{
        caches.keys()
          .then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })
          .then(function(){ return ('serviceWorker' in navigator) ? navigator.serviceWorker.getRegistrations() : []; })
          .then(function(rs){ return Promise.all(rs.map(function(r){ return r.unregister(); })); })
          .then(done).catch(done);
      }catch(e){ done(); }
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
    var g = document.getElementById('jt-upd-go');
    if(g) g.addEventListener('click', function(){ d.textContent = '🔄 नया वर्ज़न लाया जा रहा है…'; forceUpdate(); });
    var l = document.getElementById('jt-upd-later');
    if(l) l.addEventListener('click', function(){ getSwVer(setSeen); try{ d.remove(); }catch(e){ d.style.display='none'; } });
  }
  window.addEventListener('load', function(){
    setTimeout(function(){
      getSwVer(function(nv){
        if(!nv) return;
        var seen = getSeen();
        if(!seen){ setSeen(nv); return; }        /* पहली बार — चुपचाप याद रखो */
        if(String(seen) !== String(nv)) popup();  /* नया version — popup दिखाओ */
      });
    }, 2200);
  });
})();
