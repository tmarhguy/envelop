'use strict';
function revealHash() {
 const id=decodeURIComponent(location.hash.slice(1));
 const detail=document.getElementById(id);
 if(detail instanceof HTMLDetailsElement)detail.open=true;
}

if(typeof window!=='undefined'){
 window.addEventListener('hashchange',revealHash);revealHash();
 // Autoplay Tomato OS demo; pause if the user prefers reduced motion.
 const demo=document.querySelector('.origin-demo video');
 if(demo){
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>{ if(reduce.matches){ demo.pause(); demo.removeAttribute('autoplay'); } else { demo.play().catch(()=>{}); } };
  sync();
  if(typeof reduce.addEventListener==='function') reduce.addEventListener('change',sync);
 }
}
