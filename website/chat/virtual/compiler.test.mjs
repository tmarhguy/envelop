// Compile-level acceptance for the controlled natural language.
// Consumes tomato/tools/nl_fixtures.json (sibling checkout) so the browser
// compiler stays byte-identical to tomato/tools/remote_compile.py.
// Skips gracefully when the sibling checkout is absent (e.g. static deploy).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompileError, compile } from './compiler.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, '../../../../tomato/tools/nl_fixtures.json'),
  ...['TOMATO_CHECKOUT', 'TOMATO_DIR'].map(k => process.env[k] ? resolve(process.env[k], 'tools/nl_fixtures.json') : null).filter(Boolean),
];
const found = candidates.find(p => { try { return existsSync(p); } catch { return false; } });

test('nl_fixtures: controlled language, understood, fail-closed errors', { skip: !found && 'sibling tomato checkout absent' }, () => {
  const fix = JSON.parse(readFileSync(found, 'utf8'));
  assert.equal(fix.version, 6);
  for (const c of fix.compute) {
    const r = compile(c.input);
    assert.ok(r, `${c.input}: expected compute, got chat`);
    assert.equal(r.understood, c.understood, `${c.input}: understood`);
    assert.equal(r.canonical, c.canonical, `${c.input}: canonical`);
  }
  for (const c of fix.chat) assert.equal(compile(c.input), null, `${c.input}: expected chat`);
  for (const c of fix.errors) assert.throws(() => compile(c.input), e => e.message.includes(c.js_error), `${c.input}: expected /${c.js_error}/`);
});

function compileError(input) {
  try {
    compile(input);
    assert.fail(`expected compile error for ${JSON.stringify(input)}`);
  } catch (error) {
    assert.ok(error instanceof CompileError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'CompileError');
    assert.equal(typeof error.code, 'string');
    assert.ok(Object.isFrozen(error.details));
    return error;
  }
}

test('structured expression errors retain human-readable messages and safe details', () => {
  const unknown = compileError('/calc 2 squared');
  assert.equal(unknown.code, 'UNKNOWN_TOKEN');
  assert.deepEqual(unknown.details, {
    token: 'squared',
    guidance: 'Try numbers, operators like + - * / & | ^ ~, or /help.',
  });
  assert.match(unknown.message, /Unknown word 'squared'/);

  const malformed = compileError('/calc and(1)');
  assert.equal(malformed.code, 'MALFORMED_EXPRESSION');
  assert.deepEqual(malformed.details, {
    reason: 'wrong-argument-count',
    operation: 'and',
    min: 2,
    max: 8,
    actual: 1,
  });
  assert.match(malformed.message, /two arguments or more/);

  for (const operation of ['/', '%', '*']) {
    const unsupported = compileError(`/calc 7 ${operation} 3`);
    assert.equal(unsupported.code, 'UNSUPPORTED_OPERATION');
    assert.deepEqual(unsupported.details, { operation });
    assert.match(unsupported.message, /is not installed/);
  }
});

test('structured raw /run errors distinguish registers, ranges, and instructions', () => {
  const register = compileError('/run\nR8=1\nRETURN R0');
  assert.equal(register.code, 'INVALID_REGISTER');
  assert.deepEqual(register.details, { register: 'R8', min: 0, max: 7 });
  assert.match(register.message, /R0–R7/);

  const literal = compileError('/run\nR0=4294967296\nRETURN R0');
  assert.equal(literal.code, 'OUT_OF_RANGE');
  assert.deepEqual(literal.details, {
    range: 'literal',
    value: '4294967296',
    min: -2147483648,
    max: 4294967295,
  });
  assert.match(literal.message, /outside 32-bit range/);

  const instruction = compileError('/run\nDIV R0,R1,R2\nRETURN R0');
  assert.equal(instruction.code, 'INVALID_INSTRUCTION');
  assert.deepEqual(instruction.details, {
    instruction: 'DIV',
    reason: 'unsupported',
  });
  assert.match(instruction.message, /Unsupported instruction: DIV/);
});

test('successful output and ordinary-chat classification remain stable', () => {
  assert.deepEqual(compile('23 + 19'), {
    canonical: '/run\nR0=23\nR1=19\nADD R0,R0,R1\nRETURN R0',
    bytes: [1, 1, 0, 0, 0, 0, 23, 1, 1, 0, 0, 0, 19, 2, 0, 0, 1, 0, 48, 0],
    version: 1,
    understood: '23 + 19',
  });
  for (const message of ['Hello Tomato', 'tomatoes are red', 'meet me after lunch']) {
    assert.equal(compile(message), null);
  }
});

test('32-bit literal boundaries preserve modulo-2^32 machine encoding', () => {
  const min = compile('/run\nR0=-2147483648\nRETURN R0');
  assert.deepEqual(min.bytes, [1, 1, 0, 128, 0, 0, 0, 48, 0]);

  const max = compile('/run\nR0=4294967295\nRETURN R0');
  assert.deepEqual(max.bytes, [1, 1, 0, 255, 255, 255, 255, 48, 0]);

  const wrappingAdd = compile('4294967295 + 1');
  assert.equal(wrappingAdd.canonical, '/run\nR0=4294967295\nR1=1\nADD R0,R0,R1\nRETURN R0');
  assert.deepEqual(wrappingAdd.bytes.slice(0, 13), [1, 1, 0, 255, 255, 255, 255, 1, 1, 0, 0, 0, 1]);

  for (const value of ['-2147483649', '4294967296']) {
    const error = compileError(`/run\nR0=${value}\nRETURN R0`);
    assert.equal(error.code, 'OUT_OF_RANGE');
    assert.equal(error.details.value, value);
  }
});

test('instruction count boundary is deterministic and never skipped', () => {
  const atLimit = `/run\n${Array.from({ length: 31 }, () => 'CLR R0').join('\n')}\nRETURN R0`;
  assert.equal(compile(atLimit).bytes.length, 31 * 6 + 3);

  const overLimit = `/run\n${Array.from({ length: 32 }, () => 'CLR R0').join('\n')}\nRETURN R0`;
  const error = compileError(overLimit);
  assert.equal(error.code, 'OUT_OF_RANGE');
  assert.deepEqual(error.details, {
    range: 'instruction-count',
    value: 33,
    min: 1,
    max: 32,
  });
  assert.match(error.message, /Maximum 32 instructions/);
});

test('source and memory limits report exact safe boundaries', () => {
  assert.equal(compile('x'.repeat(2048)), null);
  const source = compileError('x'.repeat(2049));
  assert.equal(source.code, 'OUT_OF_RANGE');
  assert.deepEqual(source.details, {
    range: 'source-length',
    value: 2049,
    min: 0,
    max: 2048,
  });

  const memory = compile('/run\nLOAD R0,[255]\nRETURN R0');
  assert.deepEqual(memory.bytes, [1, 32, 0, 255, 48, 0]);

  const offset = compileError('/run\nLOAD R0,[256]\nRETURN R0');
  assert.equal(offset.code, 'OUT_OF_RANGE');
  assert.deepEqual(offset.details, {
    range: 'memory-offset',
    value: 256,
    min: 0,
    max: 255,
  });
  assert.match(offset.message, /Memory offsets are 0–255/);
});
