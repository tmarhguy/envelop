import {Tomato,loadImage,makeFrame} from './tomato-cpu.mjs?v=20260917-fast-virtual-3';
import {CompileError,compile,hex,normalizeGreeting} from './compiler.mjs?v=20260917-fast-virtual-3';
self.onmessage=async({data})=>{
 try{
    const job=compile(data.text);postMessage({kind:'compiled',program:job?.canonical||'Chat text · no assembly program is sent.',hex:hex(job?.bytes||new TextEncoder().encode(data.text)),version:job?'Remote bytecode v1':'UTF-8 chat text',understood:job?.understood||null,ast:job?.ast||null});
  const response=await fetch(new URL('./tomato-os.bin?v=20260917-fast-virtual-3',import.meta.url));if(!response.ok)throw Error('Virtual firmware could not load.');
  const cpu=new Tomato(loadImage(await response.arrayBuffer()));
  cpu.step(200000);cpu.key(30);cpu.step(52500);cpu.key(13);cpu.step(52500);cpu.demo();
  const replies=[];let computeFinished=false,executionFailure=null;cpu.radio.onFrame=f=>{if(f.route!==1)return;if(f.type===8&&!job)replies.push(new TextDecoder().decode(new Uint8Array(f.payload.slice(4))));if(f.type===33){const p=f.payload,v=((p[5]*16777216)+(p[6]<<16)+(p[7]<<8)+p[8])>>>0;computeFinished=true;if(p[4]===0)replies.push(`${v} / 0x${v.toString(16).padStart(8,'0').toUpperCase()}`);else executionFailure={code:'EXECUTION_FAULT',message:`Tomato rejected the job (status ${p[4]}).`,details:{statusByte:p[4]}};}};
  for(let i=0;i<130&&cpu.tileText(2,11,3)!=='Ama';i++)cpu.step(52500);
  cpu.radio.receive(makeFrame(3,0,[]));for(let i=0;i<40&&cpu.tileText(2,11,3)==='Ama';i++)cpu.step(52500);
  const name=(data.name||'Friend').replace(/[^ -~]/g,'?').slice(0,32);cpu.contact(1,name);
  const shown=name.slice(0,Math.min(8,name.length));for(let i=0;i<80&&cpu.tileText(2,11,shown.length)!==shown;i++)cpu.step(52500);
  replies.length=0;
  postMessage({kind:'phase',phase:'executing'});
  if(job){
   cpu.radio.receive(makeFrame(32,1,[0,0,0,200,...job.bytes]));
   for(let i=0;i<64&&!computeFinished&&!executionFailure;i++)cpu.step(52500);
  }else{
   let txt=data.text.trim();const g=normalizeGreeting(txt);if(g)txt=g;if(/^(help|what can you do)[?.!]*$/i.test(txt))txt='/help';cpu.message(1,txt);
   let quietTicks=0,lastReplyCount=0;
   for(let i=0;i<240&&(replies.length===0||quietTicks<12);i++){
    cpu.step(52500);
    if(replies.length!==lastReplyCount){lastReplyCount=replies.length;quietTicks=0;}
    else if(replies.length)quietTicks++;
   }
  }
  if(executionFailure){postMessage({kind:'error',error:executionFailure});return;}
  if(!replies.length)throw Error('Virtual Tomato did not reply. Try /help.');
  postMessage({kind:'result',replies,target:'Virtual Tomato · browser CPU emulator'});
 }catch(e){postMessage({kind:'error',error:e instanceof CompileError?{code:e.code,message:e.message,details:e.details}:{code:'VIRTUAL_EXECUTION_ERROR',message:e.message,details:{}}});}
};
