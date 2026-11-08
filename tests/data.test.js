import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as data from '../JS/data.js';

test('a driver RPC row is normalized from either supported response shape', () => {
  assert.equal(typeof data.busFromRow, 'function');
  const row = { id: 'bus', label: 'Bus', route_id: 'route', engine_on: true, status: 'on_time', lat: 18, lng: -76 };
  assert.equal(data.busFromRow(row).id, 'bus');
  assert.equal(data.busFromRow([row]).id, 'bus');
  assert.throws(() => data.busFromRow([]), /bus/i);
  assert.throws(() => data.busFromRow([row, row]), /bus/i);
});
