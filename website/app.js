'use strict';
function revealHash() {
 const id=decodeURIComponent(location.hash.slice(1));
 const detail=document.getElementById(id);
 if(detail instanceof HTMLDetailsElement)detail.open=true;
}

if(typeof window!=='undefined'){
 window.addEventListener('hashchange',revealHash);revealHash();
 for (const menu of document.querySelectorAll('.site-menu')) {
  menu.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });
 }
 // Autoplay Tomato OS demo; pause if the user prefers reduced motion.
 const demo=document.querySelector('.origin-demo video');
 if(demo){
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>{ if(reduce.matches){ demo.pause(); demo.removeAttribute('autoplay'); } else { demo.play().catch(()=>{}); } };
  sync();
  if(typeof reduce.addEventListener==='function') reduce.addEventListener('change',sync);
 }
}
