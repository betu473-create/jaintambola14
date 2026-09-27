/* Service Worker पंजीकरण — PWA/APK बनाने के लिए ज़रूरी */
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('./sw.js').catch(function(){
      /* offline install न हो पाए तो भी गेम ऑनलाइन चलता रहेगा */
    });
  });
}
