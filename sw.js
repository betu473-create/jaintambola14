/* ============================================================
   जैन ताम्बोला — Service Worker (PWA / APK के लिए)
   ------------------------------------------------------------
   - ऐप की सभी फाइलें ऑफ़लाइन कैश में सुरक्षित रहती हैं
   - PWABuilder / FreeWebToApk से बिना वॉटरमार्क वाला
     100% फ़्री परमानेंट APK बनाया जा सकता है
   - नया कोड अपलोड करने के बाद CACHE नंबर बढ़ा दें
     (जैसे 'jain-tambola-v4' से 'jain-tambola-v5')
   ============================================================ */
const CACHE = 'jain-tambola-v23';

const ASSETS = [
  './',
  './index.html',
  './host.html',
  './join.html',
  './rules.html',
  './words.html',
  './print.html',
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

/* फ़ेच: पहले कैश, नहीं मिले तो नेटवर्क (और नए को कैश में जोड़ो) */
self.addEventListener('fetch', function(e){
  const req = e.request;
  if(!req || !req.url || !/^https?:/i.test(req.url)) return;
  if(req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        const copy = res.clone();
        caches.open(CACHE).then(function(c){
          try{ c.put(req, copy); }catch(err){}
        });
        return res;
      }).catch(function(){
        return caches.match('./index.html');
      });
    })
  );
});
