import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../docs/garden-counter.js', import.meta.url), 'utf8');
const {createGardenCounter} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const hostname = 'zhonglifr.github.io';
const prefix = 'zl:garden-20261009:';
function memory() {
  const entries = new Map();
  return {getItem: k => entries.get(k) ?? null, setItem: (k,v) => entries.set(k,v), removeItem: k => entries.delete(k)};
}
function backend() {
  const counts = new Map(), calls = [];
  const fetcher = async (url, options) => {
    const [,operation,namespace,key] = new URL(url).pathname.split('/');
    assert.equal(namespace, hostname);
    assert.equal(options.credentials, 'omit');
    calls.push({operation,key});
    if (operation === 'hit') counts.set(key, (counts.get(key) || 0) + 1);
    const found = counts.has(key);
    return {ok: found, status: found ? 200 : 404, json: async () => found ? {value: counts.get(key)} : {error:'Key not found'}};
  };
  return {counts, calls, fetcher};
}
test('counts are shared; reloads and repeated watering do not increment again', async () => {
  const service = backend(), storage = memory();
  const options = {hostname, storage, fetcher: service.fetcher};
  let counter = createGardenCounter(options);
  assert.equal((await counter.refresh('visit')).visitors.value, 1);
  assert.equal((await counter.refresh('water')).waterers.value, 1);
  counter = createGardenCounter(options);
  await counter.refresh('visit');
  assert.equal((await counter.refresh('water')).waterers.value, 1);
  const another = createGardenCounter({...options, storage: memory()});
  assert.equal((await another.refresh('visit')).visitors.value, 2);
  assert.equal((await another.refresh()).waterers.value, 1);
  assert.equal(service.calls.filter(c => c.operation === 'hit').length, 3);
});
test('preview writes never touch production counters', async () => {
  const service = backend();
  await createGardenCounter({hostname:'localhost', storage: memory(), fetcher: service.fetcher}).refresh('water');
  assert(service.calls.every(c => c.key.startsWith('garden-preview-')));
});
test('blocked storage uses read-only totals', async () => {
  const service = backend();
  const counter = createGardenCounter({hostname, storage: undefined, fetcher: service.fetcher});
  await counter.refresh('visit'); await counter.refresh('water');
  assert(service.calls.every(c => c.operation === 'get'));
});
test('overlapping water events register one visit and one watering', async () => {
  const service = backend();
  const counter = createGardenCounter({hostname, storage: memory(), fetcher: service.fetcher});
  await Promise.all([counter.refresh('visit'),counter.refresh('water'),counter.refresh('water')]);
  assert.equal(service.calls.filter(c => c.operation === 'hit').length, 2);
});
test('cross-tab locking rechecks shared flags before writing', async () => {
  const service = backend(), storage = memory();
  let queue = Promise.resolve();
  const locks = {request: (_name, fn) => { const job = queue.then(fn); queue = job; return job; }};
  const options = {hostname, storage, fetcher:service.fetcher, locks};
  await Promise.all([createGardenCounter(options).refresh('water'), createGardenCounter(options).refresh('water')]);
  assert.equal(service.calls.filter(c => c.operation === 'hit').length, 2);
});
test('a lost write response is not blindly retried and cannot inflate the total', async () => {
  const service = backend(), storage = memory();
  const fetcher = async (url, options) => {
    const response = await service.fetcher(url, options);
    if (url.includes('/hit/')) throw new Error('Response lost');
    return response;
  };
  const counter = createGardenCounter({hostname, storage, fetcher});
  assert.equal((await counter.refresh('visit')).visitors.stale, true);
  assert.equal((await counter.refresh('visit')).visitors.value, 1);
  await counter.refresh('water');
  assert.equal(service.calls.filter(c => c.operation === 'hit').length, 1);
  assert.equal(JSON.parse(storage.getItem(prefix + 'visitors')).state, 'pending');
});
test('network or malformed responses retain the last good value and timestamp', async () => {
  const service = backend(), storage = memory();
  const options = {hostname,storage,fetcher:service.fetcher};
  const original = await createGardenCounter(options).refresh('water');
  for (const fetcher of [async()=>{throw new Error('offline')}, async()=>({ok:true,json:async()=>({value:-2})}), async()=>({ok:true,json:async()=>({value:'100'})})]) {
    const data = await createGardenCounter({...options,fetcher}).refresh();
    assert.equal(data.waterers.value, 1);
    assert.equal(data.waterers.updated, original.waterers.updated);
    assert.equal(data.waterers.stale, true);
  }
});
test('only an explicit missing-key response is a legitimate zero', async () => {
  const counter = createGardenCounter({hostname, storage:memory(), fetcher:async()=>({ok:false,status:404,json:async()=>({error:'Unknown route'})})});
  const data = await counter.refresh();
  assert.equal(data.visitors.value,undefined);
  assert.equal(data.visitors.stale,true);
});
test('visits and watering each count again after thirty minutes', async () => {
  const service = backend(), storage = memory();
  let time = 1000000;
  const options = {hostname, storage, fetcher:service.fetcher, now:()=>time};
  await createGardenCounter(options).refresh('water');
  time += 30 * 60 * 1000 - 1;
  assert.equal((await createGardenCounter(options).refresh('visit')).visitors.value, 1);
  time += 1;
  const revisit = await createGardenCounter(options).refresh('visit');
  assert.equal(revisit.visitors.value, 2);
  assert.equal((await createGardenCounter(options).refresh('water')).waterers.value, 2);
  assert.equal(service.calls.filter(c=>c.operation==='hit').length, 4);
});
test('visit and watering cooldowns start independently', async () => {
  const service = backend(), storage = memory();
  let time = 1000000;
  const counter = createGardenCounter({hostname, storage, fetcher:service.fetcher, now:()=>time});
  await counter.refresh('visit');
  time += 15 * 60 * 1000;
  await counter.refresh('water');
  time += 15 * 60 * 1000;
  let data = await counter.refresh('water');
  assert.equal(data.visitors.value, 2);
  assert.equal(data.waterers.value, 1);
  time += 15 * 60 * 1000;
  data = await counter.refresh('water');
  assert.equal(data.visitors.value, 2);
  assert.equal(data.waterers.value, 2);
});
test('read-only refresh after thirty minutes does not create a visit', async () => {
  const service = backend(), storage = memory();
  let time = 1000000;
  const counter = createGardenCounter({hostname, storage, fetcher:service.fetcher, now:()=>time});
  await counter.refresh('visit');
  time += 45 * 60 * 1000;
  assert.equal((await counter.refresh()).visitors.value, 1);
  assert.equal((await counter.refresh('visit')).visitors.value, 2);
});
