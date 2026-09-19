// Installed ENVELOP ABI operations. LUT bits use index (C << 2) | (B << 1) | A.
import {BOOL3} from './lut-fuse.mjs';

export const ALU = Object.freeze({
  ADD:    {f:'A', g:'B', cin:0, lutA:0xAA, lutB:0xCC},
  SUB:    {f:'A', g:'~B', cin:1, lutA:0xAA, lutB:0x33},
  AND:    {f:'A & B', g:'0', cin:0, lutA:0x88, lutB:0},
  OR:     {f:'A | B', g:'0', cin:0, lutA:0xEE, lutB:0},
  XOR:    {f:'A ^ B', g:'0', cin:0, lutA:0x66, lutB:0},
  MASKADD:{f:'A', g:'B & C', cin:0, lutA:0xAA, lutB:0xC0},
  XORAND: {f:'A ^ B ^ C', g:'A & B & C', cin:0, lutA:0x96, lutB:0x80},
  ANDADD: {f:'A & B', g:'C', cin:0, lutA:0x88, lutB:0xF0},
  ORADD:  {f:'A | B', g:'C', cin:0, lutA:0xEE, lutB:0xF0},
  XORADD: {f:'A ^ B', g:'C', cin:0, lutA:0x66, lutB:0xF0},
  ANDN:   {f:'A & ~B', g:'0', cin:0, lutA:0x22, lutB:0},
  ORN:    {f:'A | ~B', g:'0', cin:0, lutA:0xBB, lutB:0},
  ...Object.fromEntries(Object.entries(BOOL3).map(([op, spec]) => [op, {
    f: spec.f, g: spec.g, cin: spec.cin, lutA: spec.lutA, lutB: spec.lutB,
  }])),
});

export function describeAlu(program) {
  return program.split('\n').flatMap(line => {
    const [op, ...regs] = line.replaceAll(',', ' ').split(/\s+/);
    const config = ALU[op];
    if (!config) return [];
    const h = n => '0x' + n.toString(16).padStart(2, '0').toUpperCase();
    return [`${line}\n  A=${regs[1]}, B=${regs[2]}${regs[3] ? ', C='+regs[3] : ''}\n  f=${config.f}; g=${config.g}; cin=${config.cin}\n  out = f(A,B,C) + g(A,B,C) + cin (mod 2^32)\n  LUT f=${h(config.lutA)}, g=${h(config.lutB)} · one native Dual-LUT instruction`];
  }).join('\n\n');
}
