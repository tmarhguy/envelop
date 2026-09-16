'use strict';
function revealHash() {
 const id=decodeURIComponent(location.hash.slice(1));
 const detail=document.getElementById(id);
 if(detail instanceof HTMLDetailsElement)detail.open=true;
}

if(typeof window!=='undefined'){
 window.addEventListener('hashchange',revealHash);revealHash();
 for (const menu of document.querySelectorAll('.site-menu')) {
  const summary = menu.querySelector('summary');
  const syncMenu = () => {
   summary.setAttribute('aria-expanded', String(menu.open));
   summary.setAttribute('aria-label', menu.open ? 'Close menu' : 'Open menu');
  };
  menu.addEventListener('toggle', syncMenu);
  syncMenu();
  menu.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; summary.focus(); } });
 }
 // Load the sizeable capture only when it approaches the viewport. Playback
 // is limited to the actually visible, foreground case.
 const demo=document.querySelector('.origin-demo video');
 if(demo){
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const source=demo.querySelector('source[data-src]');
  let loaded=false;
  let onscreen=false;
  const load=()=>{
   if(loaded||!source)return;
   loaded=true;
   source.src=source.dataset.src;
   source.removeAttribute('data-src');
   demo.load();
  };
  const sync=()=>{
   if(document.hidden||!onscreen||reduce.matches){demo.pause();return;}
   load();
   demo.play().catch(()=>{});
  };
  if('IntersectionObserver' in window){
   const near=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){load();near.disconnect();}
   },{rootMargin:'320px 0px'});
   const visible=new IntersectionObserver(entries=>{
    onscreen=entries.some(entry=>entry.isIntersecting);
    sync();
   },{threshold:0.01});
   near.observe(demo);
   visible.observe(demo);
  }else{
   const loadFromControl=()=>{load();demo.removeEventListener('pointerdown',loadFromControl);};
   demo.addEventListener('pointerdown',loadFromControl);
  }
  document.addEventListener('visibilitychange',sync);
  if(typeof reduce.addEventListener==='function') reduce.addEventListener('change',sync);
 }
}
