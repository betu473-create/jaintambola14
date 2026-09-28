/* ============================================================
   जैन ताम्बोला — असली आवाज़ (Voice Pack) v1
   ------------------------------------------------------------
   - शब्द सूची पेज से होस्ट अपनी आवाज़ रिकॉर्ड कर सकता है
   - रिकॉर्डिंग उसी फोन में (IndexedDB) सेव रहती है
   - गेम में शब्द निकलने पर:
     रिकॉर्डिंग है तो वही बजती है, नहीं तो TTS बोलता है
   - v5.6.3: क्रमांक भी बोला जाता है (क्रमांक पंद्रह — अरिहंत)
   ============================================================ */
var jtVoice = (function(){
  var DB_NAME = 'jt_voice', STORE = 'clips';
  var _db = null;

  function open(){
    if(_db) return Promise.resolve(_db);
    return new Promise(function(resolve, reject){
      try{
        var rq = indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = function(e){
          e.target.result.createObjectStore(STORE);
        };
        rq.onsuccess = function(e){ _db = e.target.result; resolve(_db); };
        rq.onerror = function(){ reject(rq.error); };
      }catch(err){ reject(err); }
    });
  }

  /* किसी शब्द की रिकॉर्डिंग लाओ (Blob या null) */
  function get(word){
    return open().then(function(db){
      return new Promise(function(resolve){
        try{
          var tx = db.transaction(STORE, 'readonly');
          var rq = tx.objectStore(STORE).get(word);
          rq.onsuccess = function(){ resolve(rq.result || null); };
          rq.onerror = function(){ resolve(null); };
        }catch(e){ resolve(null); }
      });
    }).catch(function(){ return null; });
  }

  /* रिकॉर्डिंग सेव करो */
  function put(word, blob){
    return open().then(function(db){
      return new Promise(function(resolve){
        try{
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(blob, word);
          tx.oncomplete = function(){ resolve(true); };
          tx.onerror = function(){ resolve(false); };
        }catch(e){ resolve(false); }
      });
    }).catch(function(){ return false; });
  }

  /* रिकॉर्डिंग मिटाओ */
  function del(word){
    return open().then(function(db){
      return new Promise(function(resolve){
        try{
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE)['delete'](word);
          tx.oncomplete = function(){ resolve(true); };
          tx.onerror = function(){ resolve(false); };
        }catch(e){ resolve(false); }
      });
    }).catch(function(){ return false; });
  }

  /* किन-किन शब्दों की आवाज़ सेव है */
  function keys(){
    return open().then(function(db){
      return new Promise(function(resolve){
        try{
          var tx = db.transaction(STORE, 'readonly');
          var rq = tx.objectStore(STORE).getAllKeys();
          rq.onsuccess = function(){ resolve(rq.result || []); };
          rq.onerror = function(){ resolve([]); };
        }catch(e){ resolve([]); }
      });
    }).catch(function(){ return []; });
  }

  /* एक रिकॉर्डिंग बजाना (1 बार) */
  function playBlob(blob){
    return new Promise(function(resolve){
      try{
        var url = URL.createObjectURL(blob);
        var a = new Audio(url);
        a.onended = function(){ URL.revokeObjectURL(url); resolve(true); };
        a.onerror = function(){ URL.revokeObjectURL(url); resolve(false); };
        a.play().catch(function(){ URL.revokeObjectURL(url); resolve(false); });
      }catch(e){ resolve(false); }
    });
  }

  /* मुख्य फ़ंक्शन: रिकॉर्डिंग है तो वही (N बार), वरना TTS */
  function sayWord(word, times){
    var n = times || (window.JT_CONFIG ? JT_CONFIG.SPEAK_TIMES : 1);
    get(word).then(function(blob){
      if(!blob){
        try{ speakWord(word, times); }catch(e){}
        return;
      }
      var i = 0;
      function once(ok){
        i++;
        if(ok && i < n){
          setTimeout(function(){ playBlob(blob).then(once); }, 250);
        }
      }
      playBlob(blob).then(once);
    });
  }

  /* क्रमांक बोलकर फिर शब्द (v5.6.3):
     रिकॉर्डिंग हो तो पहले TTS नंबर बोलेगा, फिर आपकी रिकॉर्डेड आवाज़ */
  function sayAnnounce(num, word, times){
    var hn = (typeof hindiNumberWords === 'function') ? hindiNumberWords(num) : '';
    get(word).then(function(blob){
      if(!blob){
        try{ speakWord(hn ? ('क्रमांक ' + hn + ' — ' + word) : word, times); }catch(e){}
        return;
      }
      var n = times || (window.JT_CONFIG ? JT_CONFIG.SPEAK_TIMES : 1);
      var playRec = function(){
        var i = 0;
        function once(ok){
          i++;
          if(ok && i < n){
            setTimeout(function(){ playBlob(blob).then(once); }, 250);
          }
        }
        playBlob(blob).then(once);
      };
      if(hn && typeof speakThen === 'function'){
        speakThen('क्रमांक ' + hn, playRec);
      }else{
        playRec();
      }
    });
  }

  return {
    get: get,
    put: put,
    del: del,
    keys: keys,
    playBlob: playBlob,
    sayWord: sayWord,
    sayAnnounce: sayAnnounce
  };
})();
