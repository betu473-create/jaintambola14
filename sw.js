/* ============================================================
   जैन ताम्बोला — Service Worker (PWA / APK के लिए)
   ------------------------------------------------------------
   - ऐप की सभी फाइलें ऑफ़लाइन कैश में सुरक्षित रहती हैं
   - PWABuilder / FreeWebToApk से बिना वॉटरमार्क वाला
     100% फ़्री परमानेंट APK बनाया जा सकता है
   - नया कोड अपलोड करने के बाद CACHE नंबर बढ़ा दें
     (जैसे 'jain-tambola-v72' से 'jain-tambola-v73')
   ============================================================ */
const CACHE = 'jain-tambola-v102';

const ASSETS = [
  './',
  './index.html',
  './host.html',
  './join.html',
  './rules.html',
  './guide.html',
  './words.html',
  './print.html',
  './check.html',
  './screen.html',
  './settings.html',
  './css/style.css',
  './js/config.js',
  './js/words.js',
  './js/audio.js',
  './js/fx.js',
  './js/host.js',
  './js/player.js',
  './js/pwa.js',
  './js/net.js',
  './js/voice.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/logo.jpg'
];

/* इंस्टॉल: सभी ज़रूरी फाइलें पहले से कैश कर लो */
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(ASSETS); })
      .then(function(){ return self.skipWaiting(); })
  );
});

/* एक्टिवेट: पुराने कैश हटाओ */
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys
          .filter(function(k){ return k !== CACHE; })
          .map(function(k){ return caches.delete(k); }));
      })
      .then(function(){ return self.clients.claim(); })
  );
});

/* फ़ेच (v5.8.18):
   - पेज/JS/CSS/JSON  ->  नेटवर्क पहले (online हो तो हमेशा ताज़ा; न मिले तो कैश)
   - icon/audio       ->  कैश पहले (जल्दी खुले, bandwidth बचे) */
/* फ़ेच (v5.8.19):
   - पेज/JS/CSS/JSON  ->  नेटवर्क पहले, cache:no-store (WebView का पुराना cache भी bypass)
   - icon/audio       ->  कैश पहले (जल्दी खुले, bandwidth बचे) */
self.addEventListener('fetch', function(e){
  const req = e.request;
  if(!req || !req.url || !/^https?:/i.test(req.url)) return;
  if(req.method !== 'GET') return;
  let pathname = '';
  try{ pathname = new URL(req.url).pathname; }catch(err){}
  const isAsset = /\.(png|jpg|jpeg|webp|gif|svg|ico|mp3|wav|m4a|ogg)$/i.test(pathname);
  if(isAsset){
    e.respondWith(
      caches.match(req).then(function(hit){
        if(hit) return hit;
        return fetch(req).then(function(res){
          const copy = res.clone();
          caches.open(CACHE).then(function(c){ try{ c.put(req, copy); }catch(err2){} });
          return res;
        });
      })
    );
    return;
  }
  e.respondWith(
    fetch(req, {cache:'no-store'}).then(function(res){
      const copy = res.clone();
      caches.open(CACHE).then(function(c){ try{ c.put(req, copy); }catch(err2){} });
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){ return hit || caches.match('./index.html'); });
    })
  );
});
