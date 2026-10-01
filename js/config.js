/* ============================================================
   जैन ताम्बोला — मुख्य सेटिंग्स (ज़रूरत पड़ने पर ही बदलें)
   ============================================================ */
const JT_CONFIG = {

  /* आपकी लाइव साइट का पूरा लिंक — खाली ('') छोड़ने पर ऐप खुद
     जिस पते पर खुला है उसी के हिसाब से लिंक बनाएगा
     (Netlify और GitHub Pages — दोनों पर सही चलेगा) */
  SITE_URL: '',
  RELAY_URL: '',   /* (optional) 150+ players ke liye relay URL - khaali = PeerJS */

  SPEAK_TIMES: 1,       /* हर शब्द कितनी बार बोला जाए */
  SPEAK_LANG: 'hi-IN',  /* हिंदी आवाज़ (Web Speech API) */
  SPEAK_RATE: 0.9,     /* बोलने की रफ़्तार (0.85 पर कुछ शब्द अटकते थे) */
  AUTO_MODE_MS: 10000,  /* ऑटो मोड: अगला शब्द इतने मिलीसेकंड बाद */

  TICKET_CELLS: 12,     /* एक टिकट में कुल खंड/शब्द (Full House) */
  TICKET_COLS: 4,       /* एक पंक्ति में कॉलम (3 पंक्ति × 4 कॉलम = 12) */
  REPEAT_LIMIT: 1,      /* खिलाड़ी एक शब्द कितनी बार दोबारा सुन सकता है */
  HISTORY_DAYS: 1       /* गेम हिस्ट्री कितने दिन तक सेव रहे */
};

/* शेयर-लिंक बनाने के लिए साइट का पता
   (SITE_URL खाली हो तो जिस पते पर ऐप खुला है वही इस्तेमाल होगा) */
function jtSiteUrl(){
  const u = (JT_CONFIG.SITE_URL || '').trim();
  if(u) return u.replace(/\/+$/, '');
  try{
    const p = window.location.pathname.replace(/[^/]*$/, '');
    return (window.location.origin || '.') + p;
  }catch(e){
    return '.';
  }
}
