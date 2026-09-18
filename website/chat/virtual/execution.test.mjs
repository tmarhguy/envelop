// Exercise the shipped worker, firmware, radio framing and CPU; no mocked arithmetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from './compiler.mjs';
import {ALU, describeAlu} from './alu.mjs';
import {HELP_GUIDE, SUGGESTION_CATALOG} from '../help.mjs';

test('shipped firmware executes every advertised arithmetic operation', async () => {
  const originalFetch = globalThis.fetch;
  const originalSelf = globalThis.self;
  const originalPost = globalThis.postMessage;
  const image = readFileSync(new URL('./tomato-os.bin', import.meta.url));
  globalThis.self = {};
  globalThis.fetch = async () => ({ok:true, arrayBuffer:async () => image.buffer.slice(image.byteOffset,image.byteOffset+image.byteLength)});
  let messages;
  globalThis.postMessage = m => messages.push(m);
  try {
    await import('./worker.mjs');
    const cases = [
      ['23 + 19',42], ['andadd(0xF0, 0xAA, 7)',167], ['oradd(0xF0, 0xAA, 7)',257],
      ['xoradd(0xF0, 0xAA, 7)',97], ['andn(0xFF, 0x0F)',240], ['orn(0xF0, 0x0F)',4294967280],
      ['xorand(0xF0, 0xAA, 0x0F)',85], ['maskadd(0xFF, 7, 9)',256],
      ['(240 | 170) + 7',257], ['240 + (7 & 9)',241], ['255 & ~15',240],
      ['xor(5, and(7, 3))',6], ['and(5, or(7, 3))',5], ['or(5, xor(7, 3))',5],
      ['nand(234, nor(234, 34))',4294967295],
      ['4294967295 + 1',0], ['34 * 3',102], ['345 / 345',1], ['23 + xnor(5, 3)',16],
      ['/run; R0=73; STORE [12],R0; LOAD R1,[12]; RETURN R1',73],
    ];
    const refs = {
      maskadd:(a,b,c)=>(a+(b&c))>>>0, xorand:(a,b,c)=>((a^b^c)+(a&b&c))>>>0,
      andadd:(a,b,c)=>((a&b)+c)>>>0, oradd:(a,b,c)=>((a|b)+c)>>>0,
      xoradd:(a,b,c)=>((a^b)+c)>>>0, andn:(a,b)=>(a&~b)>>>0, orn:(a,b)=>(a|~b)>>>0,
      xorbc:(a,b,c)=>(a^(b&c))>>>0, xorbo:(a,b,c)=>(a^(b|c))>>>0, xorbx:(a,b,c)=>(a^(b^c))>>>0,
      andbo:(a,b,c)=>(a&(b|c))>>>0, andbx:(a,b,c)=>(a&(b^c))>>>0, andbc:(a,b,c)=>(a&(b&c))>>>0,
      orbc:(a,b,c)=>(a|(b&c))>>>0, orbo:(a,b,c)=>(a|(b|c))>>>0, orbx:(a,b,c)=>(a|(b^c))>>>0,
    };
    for (const [op,reference] of Object.entries(refs)) {
      for (const values of [[0,0,0],[0xffffffff,0xffffffff,1],[0x80000000,0x7fffffff,0xffffffff],[0xaaaaaaaa,0x55555555,0x12345678]]) {
        const args=values.slice(0,reference.length);
        cases.push([`${op}(${args.join(',')})`,reference(...args)]);
      }
    }
    const seen = new Set(cases.map(([text])=>text));
    for (const option of [...HELP_GUIDE.groups.flatMap(g=>g.options), ...SUGGESTION_CATALOG]) {
      try { if (!seen.has(option.prompt) && compile(option.prompt)) { cases.push([option.prompt]); seen.add(option.prompt); } } catch { /* deliberate malformed examples */ }
    }
    for (const [text,expected] of cases) {
      messages=[];
      await self.onmessage({data:{text,name:'Test'}});
      const result=messages.find(m=>m.kind==='result');
      assert.ok(result, `${text}: ${JSON.stringify(messages.at(-1))}`);
      assert.match(result.target,/Virtual Tomato/);
      if(expected!==undefined)assert.equal(Number(result.replies[0].split(' / ')[0]),expected,text);
    }
    messages=[];
    await self.onmessage({data:{text:'Hello, Tomato!',name:'Test'}});
    assert.ok(messages.some(m=>m.kind==='result'&&m.replies.some(r=>/hello/i.test(r))),JSON.stringify(messages.at(-1)));
  } finally {
    globalThis.fetch=originalFetch; globalThis.self=originalSelf; globalThis.postMessage=originalPost;
  }
});

test('composed expressions preserve a single native dual-LUT instruction', () => {
  for (const [input,op] of [
    ['(240 & 170) + 7','ANDADD'], ['(240 | 170) + 7','ORADD'], ['(240 ^ 170) + 7','XORADD'],
    ['240 + (7 & 9)','MASKADD'], ['255 & ~15','ANDN'], ['240 | ~15','ORN'],
    ['xor(5, and(7, 3))','XORBC'], ['5 ^ (7 & 3)','XORBC'], ['and(5, or(7, 3))','ANDBO'],
    ['or(5, xor(7, 3))','ORBX'], ['xor(and(7, 3), 5)','XORBC'],
    ['nand(234, nor(234, 34))','NANDNOR'], ['nor(5, and(7, 3))','NORAND'],
    ['and(5, nor(7, 3))','ANDNOR'], ['xor(5, nand(7, 3))','XORNAND'],
  ]) {
    const job=compile(input);
    const operations=job.canonical.split('\n').filter(l=>ALU[l.split(' ')[0]]);
    assert.equal(operations.length,1,input);
    assert.ok(operations[0].startsWith(op+' '),job.canonical);
    assert.match(describeAlu(job.canonical),/f\(A,B,C\) \+ g\(A,B,C\) \+ cin/);
    assert.match(describeAlu(job.canonical),/one native Dual-LUT instruction/);
  }
  // Parentheses change meaning: the compiler must not move an AND across ADD.
  assert.equal(compile('(240 + 7) & 9').canonical.includes('MASKADD'),false);
});
