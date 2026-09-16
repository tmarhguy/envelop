'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeResolution } = require('./chat.js');

test('durable compute permits virtual only after a terminal non-result', () => {
  assert.equal(computeResolution('completed'), 'physical');
  assert.equal(computeResolution('cancelled'), 'virtual-safe');
  assert.equal(computeResolution('failed'), 'virtual-safe');
  for (const status of ['queued', 'claimed', 'running', null, undefined]) {
    assert.equal(computeResolution(status), 'unknown');
  }
});
