// Bounded ENVELOP compute ABI v1. Compiles; CPU/OS executes the result.
export const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
export class CompileError extends Error {
 constructor(code,message,details={}){
  super(message);
  this.name='CompileError';
  this.code=code;
  this.details=Object.freeze({...details});
 }
}
const fail=(code,message,details)=>{throw new CompileError(code,message,details);};
// Greeting normalization: every hi/hey/hello variant addressed to Tomato
// becomes canonical "Hello", the only greeting the OS auto-replies to.
// Null when the text is not a greeting. Shared by web chat and the worker.
export const normalizeGreeting = text => /^(hi|hey|hello)\s*,?\s*(tomato)?\s*[!.?]*$/i.test((text || '').trim()) ? 'Hello' : null;
const LEADING_SHELL=/^(?:(?:on|for|from)\s+tomato,\s*|(?:could you please|would you please|can you please|can tomato calc(?:ulate)?|can tomato compute|could tomato calc(?:ulate)?|how much is|how much would|what does|what is|what would|tell me(?:\s+the)?|give me(?:\s+the)?|show me(?:\s+the)?|work out|figure out|(?:the\s+)?(?:result|value|answer)\s+(?:of|to|is)|can you|could you|would you|please (?:calculate|compute|calc|evaluate)|calculate|compute|evaluate|do you know|i (?:need|want)(?:\s+to know)?|find(?:\s+me)?|please|hey|hi|hello)(?:\s+tomato)?,?\s+)/i;
const TRAILING_FILLER=/\s+(?:(?:on|for|from)\s+tomato|for me|thank you|thanks|please|equals?)[?.!]*\s*$/i;
const OF_NAMES='plus|minus|and|or|xor|nand|nor|xnor|not|sum|difference|add|subtract|product|times';
const OF_ALIAS={plus:'plus',minus:'minus',and:'and',or:'or',xor:'xor',nand:'nand',nor:'nor',xnor:'xnor',not:'not',sum:'plus',difference:'minus',add:'plus',subtract:'minus',product:'*',times:'*'};
const OF_HEAD=new RegExp(String.raw`\b(?:the\s+)?(?:bitwise\s+)?(${OF_NAMES})\s+(?:of|between)\s+`,'gi');
const OF_TERM=/^(?:plus|minus|or|xor|nand|nor|xnor|sum|difference)\b/i;
const OP_VOCAB=['plus','minus','and','or','xor','nand','nor','xnor','not','sum','add'];
function stripShells(expression){
 expression=expression.replace(/\bwhat['’]s\b/gi,'what is').replace(/\bwhats\b/gi,'what is');
 for(let k=0;k<6;k++){const short=expression.replace(LEADING_SHELL,'');if(short===expression)break;expression=short;}
 expression=expression.replace(/[?.!]+$/,'').replace(/\bbitwise\s+/gi,'');
 for(let k=0;k<3;k++){const short=expression.replace(TRAILING_FILLER,'').trim();if(short===expression)break;expression=short;}
 return expression.replace(/\b(?:the|a|an)\b/gi,' ').replace(/\s+/g,' ').trim();
}
function sepLen(s,i){
 if(i>=s.length)return 0;
 if(s[i]===','||s[i]==='&')return 1;
 const slice=s.slice(i);
 const withM=slice.match(/^with\b/i);if(withM)return withM[0].length;
 const andM=slice.match(/^and\b/i);if(andM)return andM[0].length;
 return 0;
}
function isTerm(s,i){
 if(i>=s.length)return true;
 if(s[i]==='+'||s[i]==='|'||s[i]==='^')return true;
 return OF_TERM.test(s.slice(i));
}
function parseOfArgs(s){
 let i=0;const args=[];const n=s.length;
 for(;;){
  while(i<n&&/\s/.test(s[i]))i++;
  if(i>=n||(args.length&&isTerm(s,i)))break;
  const start=i;let depth=0;
  while(i<n){
   const c=s[i];
   if(c==='('){depth++;i++;continue;}
   if(c===')'){if(depth===0)break;depth--;i++;continue;}
   if(depth===0&&i>start&&(sepLen(s,i)||isTerm(s,i)))break;
   i++;
  }
  const arg=s.slice(start,i).trim();
  if(!arg)break;
  args.push(arg);
  while(i<n&&/\s/.test(s[i]))i++;
  const sl=sepLen(s,i);
  if(sl){i+=sl;continue;}
  break;
 }
 return [args,i];
}
function expandOf(s,depth=0){
 if(depth>8)return s;
 const matches=[...s.matchAll(new RegExp(OF_HEAD.source,'gi'))];
 if(!matches.length)return s;
 const m=matches[matches.length-1];
 const name=OF_ALIAS[m[1].toLowerCase()];
 const rest=s.slice(m.index+m[0].length);
 const [rawArgs,consumed]=parseOfArgs(rest);
 const args=rawArgs.map(a=>a.trim()).filter(Boolean);
 const ok=(name==='not'&&args.length===1)||(name!=='not'&&args.length>=2&&args.length<=8);
 if(!ok)return s.slice(0,m.index+m[0].length)+expandOf(rest,depth+1);
 const expanded=args.map(a=>expandOf(a,depth+1));
 let made;
 if(name==='*')made='('+expanded.join(' * ')+')';
 else if(name==='not')made=`not(${expanded[0]})`;
 else made=`${name}(${expanded.join(', ')})`;
 return expandOf(s.slice(0,m.index)+made+rest.slice(consumed),depth+1);
}
function editDist(a,b){
 if(Math.abs(a.length-b.length)>1)return 2;
 if(a===b)return 0;
 if(a.length>b.length)[a,b]=[b,a];
 if(a.length===b.length){let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])d++;return d;}
 let i=0,j=0,d=0;
 while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;}else{d++;if(d>1)return d;j++;}}
 return d+(b.length-j);
}
function unknownHint(prepared,word){
 const w=word.toLowerCase();
 if(w==='of'){
  const m=prepared.match(/\b(xnor|xor|nand|nor|plus|minus|difference|and|or|not|sum)\b/i);
  const op=OF_ALIAS[(m?m[1]:'xor').toLowerCase()]||'xor';
  return ` Did you mean ${op} of a and b, or ${op}(a, b)?`;
 }
 const hits=OP_VOCAB.filter(o=>editDist(w,o)===1);
 if(hits.length===1)return ` Did you mean ${hits[0]}?`;
 const words=prepared.split(/\s+/);
 for(let i=1;i<words.length;i++){
  const prefix=words.slice(0,i).join(' ');
  if(/\d/.test(prefix))break;
  const rest=words.slice(i).join(' ');
  try{if(compile(rest))return ` Did you mean ${rest}?`;}catch{continue;}
 }
 return '';
}
function unknownError(word,prepared){
 const hint=unknownHint(prepared,word);
 fail('UNKNOWN_TOKEN',`Unknown word '${word}'.${hint||" Try numbers, operators like + - & | ^ ~, or /help."}`,{token:word});
}
export function compile(source) {
 if(typeof source!=='string')fail('MALFORMED_EXPRESSION','Use at most 2048 characters.',{reason:'invalid-source-type'});
 if(source.length>2048)fail('OUT_OF_RANGE','Use at most 2048 characters.',{range:'source-length',value:source.length,min:0,max:2048});
  let text=source.trim(),understood=null;
 if(!/^\/run\b/i.test(text)) {
  const prepared=stripShells(text.replace(/^\/calc\s+/i,''));
  let expr=expandOf(prepared);
   const FN={plus:'+',minus:'-',and:'&',or:'|',xor:'^',nand:'&',nor:'|',xnor:'^'};
   const NEG=new Set(['nand','nor','xnor']);
   const head=/\b(plus|minus|and|or|xor|nand|nor|xnor|not|andn|orn|maskadd|xorand|andadd|oradd|xoradd)\s*\(/i;
   const tailOp=/(plus|minus|and|or|xor|nand|nor|xnor|not|andn|orn|maskadd|xorand|andadd|oradd|xoradd|[+\-&|^~(,])\s*$/i;
  const tailVal=/[0-9A-Za-z_)]\s*$/;
  const splitArgs=s=>{const parts=[];let depth=0,cur='';for(const ch of s){if(ch==='('){depth++;cur+=ch;}else if(ch===')'){depth--;cur+=ch;}else if(ch===','&&depth===0){parts.push(cur);cur='';}else cur+=ch;}parts.push(cur);return parts.map(p=>p.trim());};
  const expandFn=(s,depth,afterOp)=>{
   if(depth>32)fail('MALFORMED_EXPRESSION','Expression is too deeply nested.',{reason:'nesting-depth',maxDepth:32});
   const m=head.exec(s);
   if(!m)return s;
   const before=s.slice(0,m.index);
   const call=tailOp.test(before)?true:tailVal.test(before)?false:!afterOp;
   if(!call){const nm=m.index+m[1].length;return s.slice(0,nm)+expandFn(s.slice(nm),depth,true);}
   const name=m[1].toLowerCase();
   let j=m.index+m[0].length,nest=1;
   while(j<s.length&&nest){const c=s[j];if(c==='(')nest++;else if(c===')')nest--;j++;}
    if(nest)fail('MALFORMED_EXPRESSION','Function needs two arguments or more (up to eight), like and(45, 34).',{reason:'unclosed-function',operation:name});
    const args=splitArgs(s.slice(m.index+m[0].length,j-1));
    if(name==='not'){
      if(args.length!==1||!args[0])fail('MALFORMED_EXPRESSION','Function not needs exactly one argument, like not(5).',{reason:'wrong-argument-count',operation:name,expected:1,actual:args.filter(Boolean).length});
      const made=`~(${expandFn(args[0],depth+1)})`;
      return before+made+expandFn(s.slice(j),depth,true);
    }
    if(name==='maskadd'||name==='xorand'||name==='andadd'||name==='oradd'||name==='xoradd'||name==='andn'||name==='orn'){
      const need=(name==='andn'||name==='orn')?2:3;
      if(args.length!==need||args.some(a=>!a))fail('MALFORMED_EXPRESSION',`Function ${name} needs exactly ${need===2?'two':'three'} arguments, like ${name}(${need===2?'6, 3':'1, 2, 3'}).`,{reason:'wrong-argument-count',operation:name,expected:need,actual:args.filter(Boolean).length});
      const ea=args.map(a=>expandFn(a,depth+1));
      const made=`${name}(${ea.join(', ')})`;
      return before+made+expandFn(s.slice(j),depth,true);
    }
    if(args.length<2||args.length>8||args.some(a=>!a))fail('MALFORMED_EXPRESSION','Function needs two arguments or more (up to eight), like and(45, 34).',{reason:'wrong-argument-count',operation:name,min:2,max:8,actual:args.filter(Boolean).length});
    const fold=args.slice(1).reduce((acc,a)=>`(${acc} ${FN[name]} ${expandFn(a,depth+1)})`,expandFn(args[0],depth+1));
    const made=NEG.has(name)?`~(${fold})`:fold;
    return before+made+expandFn(s.slice(j),depth,true);
  };
  expr=expandFn(expr,0,false);
  for(const [w,o] of [['plus','+'],['minus','-'],['and','&'],['or','|'],['xor','^']])expr=expr.replace(new RegExp('\\b'+w+'\\b','gi'),o);
  if(!/^\/calc\b/i.test(text)&&!/[\d()+\-&|^~]/.test(expr))return null;
  if(!/^\/calc\b/i.test(text)&&!/^(?:[\d(~+\-^&|]|R[0-7]\b|(?:maskadd|xorand|andadd|oradd|xoradd|andn|orn)\s*\()/i.test(expr)&&!(/\d/.test(expr)&&/[+\-&|^~]|\bof\b/.test(expr)))return null;
  const reserved=new Set();
  const SINGLE=new Set(['maskadd','xorand','andadd','oradd','xoradd','andn','orn']);
  for(const w of expr.match(/(?<![0-9A-Za-z_])[A-Za-z_][A-Za-z0-9_]*/g)||[]){
   if(/^R[0-7]$/i.test(w))reserved.add(Number(w[1]));
   else if(/^R[0-9]+$/i.test(w))fail('INVALID_REGISTER','Use registers R0–R7.',{register:w,min:0,max:7});
   else if(SINGLE.has(w.toLowerCase()))continue;
   else unknownError(w,prepared);
  }
  const tokens=expr.match(/0x[\da-f]+|0b[01]+|\d+|[A-Za-z_][A-Za-z0-9_]*|[()+\-&|^~]|\S/gi)||[];
  let i=0;const lines=[],free=[7,6,5,4,3,2,1,0].filter(r=>!reserved.has(r)),prec={'|':1,'^':2,'&':3,'+':4,'-':4};
  const OPM={'+':'ADD','-':'SUB','&':'AND','|':'OR','^':'XOR'},SYM={ADD:'+',SUB:'-',AND:'&',OR:'|',XOR:'^'};
  const TRI={maskadd:'MASKADD',xorand:'XORAND',andadd:'ANDADD',oradd:'ORADD',xoradd:'XORADD'};
  const BIN2={andn:'ANDN',orn:'ORN'};
  function parseAST(min=0,depth=0){
   if(depth>32)fail('MALFORMED_EXPRESSION','Expression is too deeply nested.',{reason:'nesting-depth',maxDepth:32});
   let t=tokens[i++],node;
   if(t==='('){node=parseAST(0,depth+1);if(tokens[i++]!==')')fail('MALFORMED_EXPRESSION','Missing closing parenthesis.',{reason:'missing-closing-parenthesis'});}
   else if(t==='~'){node={k:'not',a:parseAST(5,depth+1)};}
   else if(t==='-'){const n=tokens[i++];if(!/^(0x[\da-f]+|0b[01]+|\d+)$/i.test(n||''))fail('MALFORMED_EXPRESSION','Minus needs a number.',{reason:'missing-number-after-minus'});node={k:'const',v:-Number(n),raw:'-'+n};}
   else if(/^(0x[\da-f]+|0b[01]+|\d+)$/i.test(t||''))node={k:'const',v:Number(t),raw:t};
   else if(/^[A-Za-z_][A-Za-z0-9_]*$/i.test(t||'')){
    const lw=t.toLowerCase();
    if(/^R[0-7]$/i.test(t))node={k:'reg',r:Number(t[1])};
    else if(/^R\d+$/i.test(t))fail('INVALID_REGISTER','Use registers R0–R7.',{register:t,min:0,max:7});
    else if((TRI[lw]||BIN2[lw])&&tokens[i]==='('){
      i++;const need=TRI[lw]?3:2,args=[];
      if(tokens[i]===')')fail('MALFORMED_EXPRESSION',`Function ${lw} needs exactly ${need} arguments.`,{reason:'wrong-argument-count',operation:lw,expected:need,actual:0});
      for(;;){args.push(parseAST(0,depth+1));if(tokens[i]===','){i++;continue;}break;}
      if(tokens[i++]!==')')fail('MALFORMED_EXPRESSION','Missing closing parenthesis.',{reason:'missing-closing-parenthesis',operation:lw});
      if(args.length!==need)fail('MALFORMED_EXPRESSION',`Function ${lw} needs exactly ${need} arguments.`,{reason:'wrong-argument-count',operation:lw,expected:need,actual:args.length});
      node=TRI[lw]?{k:'tri',op:TRI[lw],fn:lw,args}:{k:'bin2',op:BIN2[lw],fn:lw,args};
    }
    else unknownError(t,prepared);
   }
   else if(t==='*'||t==='/'||t==='%')fail('UNSUPPORTED_OPERATION',`'${t}' is not installed. Tomato runs + - & | ^ ~.`,{operation:t});
   else fail('MALFORMED_EXPRESSION','Use numbers, parentheses and + - & | ^ ~.',{reason:'invalid-syntax'});
   if(tokens[i]==='*'||tokens[i]==='/'||tokens[i]==='%')fail('UNSUPPORTED_OPERATION',`'${tokens[i]}' is not installed. Tomato runs + - & | ^ ~.`,{operation:tokens[i]});
   while(prec[tokens[i]]>=min){const op=tokens[i++],b=parseAST(prec[op]+1,depth+1);node={k:'bin',op:OPM[op],l:node,r:b};}
   return node;
  }
  const show=n=>{
   if(n.k==='const')return n.raw;
   if(n.k==='reg')return 'R'+n.r;
   if(n.k==='not'){const s=show(n.a);return '~'+((n.a.k==='const'||n.a.k==='reg')?s:`(${s})`);}
   if(n.k==='tri'||n.k==='bin2')return `${n.fn}(${n.args.map(show).join(', ')})`;
   return `(${show(n.l)} ${SYM[n.op]} ${show(n.r)})`;
  };
  const copy=a=>{const t=alloc();lines.push(`OR R${t},R${a},R${a}`);return t;};
  const alloc=()=>{if(!free.length)fail('OUT_OF_RANGE','Expression needs more than eight registers.',{range:'register-count',max:8});return free.pop();};
  function gen(n,depth=0){
   if(depth>32)fail('MALFORMED_EXPRESSION','Expression is too deeply nested.',{reason:'nesting-depth',maxDepth:32});
   if(n.k==='const'){const r=alloc();lines.push(`R${r}=${n.v}`);return r;}
   if(n.k==='reg')return n.r;
   if(n.k==='not'){let a=gen(n.a,depth+1);if(reserved.has(a))a=copy(a);const c=alloc();lines.push(`R${c}=4294967295`);lines.push(`XOR R${a},R${a},R${c}`);free.push(c);return a;}
   if(n.k==='tri'){const regs=n.args.map(a=>gen(a,depth+1));let ra=regs[0];const rb=regs[1],rc=regs[2];if(reserved.has(ra))ra=copy(ra);lines.push(`${n.op} R${ra},R${ra},R${rb},R${rc}`);for(const t of [rb,rc]){if(!reserved.has(t)&&t!==ra)free.push(t);}return ra;}
   if(n.k==='bin2'){let ra=gen(n.args[0],depth+1);const rb=gen(n.args[1],depth+1);if(reserved.has(ra))ra=copy(ra);lines.push(`${n.op} R${ra},R${ra},R${rb}`);if(!reserved.has(rb)&&rb!==ra)free.push(rb);return ra;}
   let a=gen(n.l,depth+1),b=gen(n.r,depth+1);
   if(reserved.has(a))a=copy(a);
   lines.push(`${n.op} R${a},R${a},R${b}`);
   if(!reserved.has(b))free.push(b);
   return a;
  }
  const root=parseAST();
  if(i!==tokens.length){const t=tokens[i];if(t==='*'||t==='/'||t==='%')fail('UNSUPPORTED_OPERATION',`'${t}' is not installed. Tomato runs + - & | ^ ~.`,{operation:t});fail('MALFORMED_EXPRESSION','Unsupported expression. Try 23 + 19.',{reason:'trailing-token'});}
  let rootShown=show(root);if(rootShown.startsWith('(')&&rootShown.endsWith(')'))rootShown=rootShown.slice(1,-1);
  understood=rootShown;
  const rr=gen(root);
  text='/run\n'+lines.concat(`RETURN R${rr}`).join('\n');
 }
 const lines=text.slice(4).split(/[;\n]/).map(s=>s.trim()).filter(Boolean),out=[1];let returned=false;
 if(lines.length>32)fail('OUT_OF_RANGE','Maximum 32 instructions.',{range:'instruction-count',value:lines.length,min:1,max:32});
 const reg=s=>{if(!/^R[0-7]$/i.test(s||''))fail('INVALID_REGISTER','Use registers R0–R7.',{register:s||null,min:0,max:7});return Number(s[1]);};
 for(const rawLine of lines){
  let line=rawLine;
  let am=line.match(/^(LD|LI)\s+(R\d+)\s*,?\s*(\[(\d+)\]|(\S+))$/i);
  if(am){line=am[4]!==undefined?`LOAD ${am[2]},[${am[4]}]`:`${am[2]}=${am[5]}`;}
  else if(am=line.match(/^ST\s*\[(\d+)\]\s*,?\s*(R\d+)$/i)){line=`STORE [${am[1]}],${am[2]}`;}
  else if(am=line.match(/^MOV\s+(R\d+)\s*,?\s*(R\d+)$/i)){line=`OR ${am[1]},${am[2]},${am[2]}`;}
  else if(am=line.match(/^CLR\s+(R\d+)$/i)){line=`${am[1]}=0`;}
  if(returned)fail('INVALID_INSTRUCTION','RETURN must be last.',{instruction:'RETURN',reason:'not-last'});
  let m=line.match(/^(R\d+)\s*=\s*(-?(?:0x[\da-f]+|0b[01]+|\d+))$/i);
  if(m){const n=m[2].startsWith('-')?-Number(m[2].slice(1)):Number(m[2]);if(!Number.isInteger(n)||n< -2147483648||n>4294967295)fail('OUT_OF_RANGE','Literal is outside 32-bit range.',{range:'literal',value:m[2],min:-2147483648,max:4294967295});out.push(1,reg(m[1]),n>>>24,(n>>>16)&255,(n>>>8)&255,n&255);continue;}
  m=line.match(/^(LOAD)\s+(R\d+)\s*,\s*\[(\d+)\]$/i)||line.match(/^(STORE)\s*\[(\d+)\]\s*,\s*(R\d+)$/i);
  if(m){const load=m[1].toUpperCase()==='LOAD',offset=Number(m[load?3:2]);if(offset>255)fail('OUT_OF_RANGE','Memory offsets are 0–255.',{range:'memory-offset',value:offset,min:0,max:255});out.push(load?32:33,reg(m[load?2:3]),offset);continue;}
  const parts=line.replaceAll(',',' ').split(/\s+/),op=parts.shift().toUpperCase(),code={ADD:2,SUB:3,AND:4,OR:5,XOR:6,MASKADD:7,XORAND:8,ANDADD:9,ORADD:10,XORADD:11,ANDN:12,ORN:13}[op];
  if(op==='RETURN'){if(parts.length!==1)fail('INVALID_INSTRUCTION','RETURN needs one register.',{instruction:'RETURN',reason:'wrong-operand-count',expected:1,actual:parts.length});out.push(48,reg(parts[0]));returned=true;}
  else if(code){const count=(code>=7&&code!==12&&code!==13)?4:3;if(parts.length!==count)fail('INVALID_INSTRUCTION','Wrong operand count.',{instruction:op,reason:'wrong-operand-count',expected:count,actual:parts.length});out.push(code,...parts.map(reg));if(count===3)out.push(0);}
  else fail('INVALID_INSTRUCTION','Unsupported instruction: '+op,{instruction:op,reason:'unsupported'});
 }
  if(!returned)fail('INVALID_INSTRUCTION','End the program with RETURN R0 (or another register).',{instruction:'RETURN',reason:'missing'});
  return {canonical:text,bytes:out,version:1,understood};
}
