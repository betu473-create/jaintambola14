/* Service Worker पंजीकरण — PWA/APK बनाने के लिए ज़रूरी */
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js').catch(function(){
      /* offline install न हो पाए तो भी गेम ऑनलाइन चलता रहेगा */
    });
  });
}

/* 🔄 पक्का अपडेट system (v5.8.15) — नया version आने पर popup + force update */
(function(){
  function getSwVer(cb){
    try{ fetch('./sw.js', {cache:'no-store'}).then(function(r){ return r.text(); }).then(function(t){
      var m = t.match(/jain-tambola-v(\d+)/); cb(m ? m[1] : null);
    }).catch(function(){ cb(null); }); }catch(e){ cb(null); }
  }
  function getCurVer(cb){
    try{ caches.keys().then(function(ks){ var v=null; ks.forEach(function(k){ var m=k.match(/jain-tambola-v(\d+)/); if(m) v=m[1]; }); cb(v); }).catch(function(){ cb(null); }); }catch(e){ cb(null); }
  }
  window.jtForceUpdate = function(msg){
    function say(t){ try{ if(typeof msg === 'function') msg(t); }catch(e){} }
    say('🔄 नया वर्ज़न लाया जा रहा है…');
    function done(){ try{ location.reload(); }catch(e){} }
    try{
      caches.keys()
        .then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })
        .then(function(){ return ('serviceWorker' in navigator) ? navigator.serviceWorker.getRegistrations() : []; })
        .then(function(rs){ return Promise.all(rs.map(function(r){ return r.unregister(); })); })
        .then(done).catch(done);
    }catch(e){ done(); }
  };
  window.jtCheckUpdate = function(msg){
    function say(t){ try{ if(typeof msg === 'function') msg(t); }catch(e){} }
    say('⏳ जाँच हो रही है…');
    getSwVer(function(nv){ getCurVer(function(cv){
      if(nv && cv && String(nv) !== String(cv)){ window.jtForceUpdate(msg); }
      else{ say('✅ आपके पास नया वर्ज़न ही है'); }
    }); });
  };
  function popup(){
    if(document.getElementById('jt-upd-pop')) return;
    var d = document.createElement('div');
    d.id = 'jt-upd-pop';
    d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:99998;background:#e65100;color:#fff;border-radius:14px;padding:12px 16px;font-weight:800;box-shadow:0 6px 22px rgba(0,0,0,.3);max-width:92%;text-align:center;font-size:.95rem';
    d.innerHTML = '🔄 नया वर्ज़न आ गया! <button id="jt-upd-go" style="margin-left:8px;background:#fff;color:#e65100;border:none;border-radius:10px;padding:8px 14px;font-weight:900;font-size:.9rem">अभी लाएँ</button>';
    document.body.appendChild(d);
    var g = document.getElementById('jt-upd-go');
    if(g) g.addEventListener('click', function(){ d.textContent = '🔄 नया वर्ज़न लाया जा रहा है…'; window.jtForceUpdate(); });
  }
  window.addEventListener('load', function(){
    setTimeout(function(){ getSwVer(function(nv){ getCurVer(function(cv){ if(nv && cv && String(nv) !== String(cv)) popup(); }); }); }, 2200);
  });
})();
