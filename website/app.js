'use strict';
function revealHash() {
 const id=decodeURIComponent(location.hash.slice(1));
 const detail=document.getElementById(id);
 if(detail instanceof HTMLDetailsElement)detail.open=true;
}

// Pure device detection (node-testable; keep free of DOM access).
function detectPlatform(ua, uaPlatform, touch) {
 ua=(ua||'').toLowerCase();
 const plat=(uaPlatform||'').toLowerCase();
 if(plat==='android'||/android/.test(ua))return 'android';
 if(plat==='ios')return (/ipad/.test(ua)||(touch&&/mac/.test(ua)))?'ipad':'ios';
 if(/iphone/.test(ua))return 'ios';
 if(/ipad/.test(ua))return 'ipad';
 if(plat==='windows'||/windows nt/.test(ua))return 'windows';
 // iPadOS 13+ masquerades as macOS with touch support.
 if(plat==='macos')return touch?'ipad':'mac';
 if(/macintosh|mac os x/.test(ua))return touch?'ipad':'mac';
 return null;
}

function fillHero(id) {
 const box=document.getElementById('for-you');if(!box)return;
 const name=document.getElementById('for-you-name');
 const note=document.getElementById('for-you-note');
 const link=document.getElementById('for-you-link');
 const card=id&&document.querySelector(`[data-platform="${CSS.escape(id)}"]`);
 if(!card){
  name.textContent='Pick your device below';
  note.textContent='All downloads are in the row under this card.';
  link.href='#platforms';
  return;
 }
 name.textContent='Envelop for '+card.querySelector('h3').firstChild.textContent.trim();
 const req=card.querySelector('.requirements');
 note.textContent=(req?req.textContent+' · ':'')+card.querySelector('.availability').textContent;
 const src=card.querySelector('.download');
 const ready=src.classList.contains('ready');
 link.textContent='';
 link.textContent=ready?src.textContent.trim():'Installation details';
 link.href=src.getAttribute('href');
 if(src.hasAttribute('download'))link.setAttribute('download','');
 if(ready)link.classList.add('ready');
}

function boot(releases) {
 for(const item of releases.platforms){
  const card=document.querySelector(`[data-platform="${CSS.escape(item.id)}"]`);if(!card)continue;
  card.querySelector('.availability').textContent=item.note;
  const link=card.querySelector('.download');
  // Only same-origin packaged artifacts, never arbitrary manifest URLs.
  if(item.file && /^downloads\/[a-z0-9._-]+\.(zip|apk|ipa)$/.test(item.file)){
   link.href=item.file;link.setAttribute('download','');link.classList.add('ready');
   link.replaceChildren(document.createTextNode(item.label));
  }
 }
 let id=null;
 try{id=detectPlatform(navigator.userAgent,navigator.userAgentData&&navigator.userAgentData.platform,navigator.maxTouchPoints>1);}catch(e){id=null;}
 fillHero(id);
}

function bootFailed() {
 document.querySelectorAll('.availability').forEach(el=>{if(el.textContent.includes('Checking'))el.textContent='Build list unavailable · see installation details';});
 fillHero(null);
}

if(typeof window!=='undefined'){
 window.addEventListener('hashchange',revealHash);revealHash();
 fetch('releases.json').then(response=>{if(!response.ok)throw new Error('release manifest unavailable');return response.json();}).then(boot).catch(bootFailed);
 // Autoplay Tomato OS demo; pause if the user prefers reduced motion.
 const demo=document.querySelector('.origin-demo video');
 if(demo){
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>{ if(reduce.matches){ demo.pause(); demo.removeAttribute('autoplay'); } else { demo.play().catch(()=>{}); } };
  sync();
  if(typeof reduce.addEventListener==='function') reduce.addEventListener('change',sync);
 }
}
if(typeof module!=='undefined')module.exports={detectPlatform};
