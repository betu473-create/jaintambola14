/* जैन ताम्बोला — छोटे विज़ुअल इफ़ेक्ट (विजेता पर कॉन्फ़ेटी) */
function confettiBurst(){
  const colors = ['#ffca28', '#ef6c00', '#66bb6a', '#42a5f5', '#ec407a', '#ffee58'];
  for(let i = 0; i < 80; i++){
    const d = document.createElement('div');
    d.className = 'confetti';
    d.style.left = (Math.random() * 100) + 'vw';
    d.style.background = colors[Math.floor(Math.random() * colors.length)];
    d.style.animationDuration = (2.4 + Math.random() * 2.2) + 's';
    d.style.animationDelay = (Math.random() * 0.6) + 's';
    document.body.appendChild(d);
    setTimeout(function(){ d.remove(); }, 5600);
  }
}
