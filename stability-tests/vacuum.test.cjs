const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const rxjs = require('rxjs');

function fixture(connect) {
  class HapStatusError extends Error { constructor(status) { super(String(status)); this.hapStatus = status; } }
  const hap = { HapStatusError, HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 } };
  const warnings = [];
  const log = { warn: s => warnings.push(s), info() {}, error() {}, debug() {}, setModel() {} };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(__dirname + '/../dist/services/device_manager.js', 'utf8'), {
    exports, setTimeout, clearTimeout, Date,
    require(name) {
      if (name === 'rxjs') return rxjs;
      if (name === '../miio') return { device: connect };
      if (name === '../utils/constants') return { cleaningStatuses: ['cleaning'] };
      throw Error(name);
    },
  });
  let shutdown;
  const manager = new exports.DeviceManager(hap, log, { ip: '192.0.2.1', token: 'test-token' }, { on: (_e, f) => { shutdown = f; } });
  return { manager, warnings, shutdown: () => shutdown() };
}

function device() {
  return { miioModel: 'roborock.vacuum.a15', matches: () => true, handle: { api: { parent: { socket: {} } } }, property: () => 42,
    on() {}, destroy() { this.destroyed = true; }, poll: async () => {}, state: async () => ({ state: 'cleaning' }) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('concurrent HomeKit reads share discovery and respect the failed-attempt cooldown', async () => {
  let reject, calls = 0;
  const f = fixture(() => { calls++; return new Promise((_resolve, r) => { reject = r; }); });
  const reads = [f.manager.ensureDevice('battery'), f.manager.ensureDevice('state')];
  reject(Error('handshake timeout'));
  const results = await Promise.allSettled(reads);
  assert.equal(calls, 1);
  assert.ok(results.every(r => r.status === 'rejected' && r.reason.hapStatus === -70402));
  await assert.rejects(f.manager.ensureDevice('battery'), e => e.hapStatus === -70402);
  assert.equal(calls, 1);
  assert.equal(f.warnings.length, 1);
  f.shutdown();
});

test('successful reconnection clears the cooldown and reuses the socket', async () => {
  let calls = 0;
  const d = device();
  const f = fixture(async () => { if (++calls === 1) throw Error('offline'); return d; });
  await flush();
  f.manager.nextConnectAt = 0;
  await f.manager.ensureDevice('battery');
  await f.manager.ensureDevice('battery');
  assert.equal(calls, 2);
  assert.equal(f.manager.device, d);
  assert.equal(f.manager.connectionFailures, 0);
  f.shutdown();
  assert.equal(d.destroyed, true);
  assert.equal(f.manager.stateSubscription, null);
});

test('shutdown closes a connection that finishes after disposal', async () => {
  let resolve;
  const d = device();
  const f = fixture(() => new Promise(r => { resolve = r; }));
  f.shutdown();
  resolve(d);
  await flush();
  assert.equal(d.destroyed, true);
  assert.equal(f.manager.stateSubscription, null);
  await assert.rejects(f.manager.ensureDevice('state'), e => e.hapStatus === -70402);
});

test('keepalive actually polls after 30 seconds and shutdown cancels it', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const d = device();
  let polls = 0;
  d.poll = async () => { polls++; };
  const f = fixture(async () => d);
  await flush();
  t.mock.timers.tick(30000);
  await flush();
  assert.equal(polls, 1);
  f.shutdown();
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(polls, 1);
});

test('cleaning reads await discovery and propagate offline status without duplicate logs', async () => {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(__dirname + '/../dist/services/main_service.js', 'utf8'), {
    exports, require: name => name === 'rxjs' ? rxjs : { PluginServiceClass: class {} },
  });
  const service = Object.create(exports.MainService.prototype);
  class HapStatusError extends Error {}
  service.hap = { HapStatusError };
  let ready = false, errors = 0;
  service.log = { info() {}, error() { errors++; } };
  service.deviceManager = { ensureDevice: async () => { ready = true; }, get isCleaning() { assert.equal(ready, true); return true; } };
  assert.equal(await service.getCleaning(), true);
  service.deviceManager.ensureDevice = async () => { throw new HapStatusError(); };
  await assert.rejects(service.getCleaning(), HapStatusError);
  assert.equal(errors, 0);
});
