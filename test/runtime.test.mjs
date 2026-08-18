import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('runtime ignores ordinary calls and blocks Ad-Shield signatures', async () => {
  let timerCalls = 0;
  const context = vm.createContext({
    setTimeout() {
      timerCalls++;
      return 1;
    },
    setInterval() {
      timerCalls++;
      return 1;
    },
  });
  const runtime = await readFile(
    new URL('../src/runtime.js', import.meta.url),
    'utf8',
  );
  vm.runInContext(runtime, context);

  assert.equal(vm.runInContext(`new Map([['ok', 1]]).get('ok')`, context), 1);
  assert.equal(vm.runInContext(`new Map().set('ok', 1).get('ok')`, context), 1);
  assert.equal(
    vm.runInContext(
      '(()=>{const key={}, map=new WeakMap(); return map.set(key, 1).get(key)})()',
      context,
    ),
    1,
  );
  assert.throws(() => vm.runInContext(
    'new Map().get(a=>{const b=c;if(d===e[f(abc)])return g({inventoryId:this[h(abc)],...i[j(abc)]})})',
    context,
  ));
  assert.throws(() => vm.runInContext(
    `new Map().set('inventory_id,abc-def/x/y', 'value')`,
    context,
  ));
  assert.throws(() => vm.runInContext(
    `new WeakMap().set({device:1,id:1,imp:[{'1/abc/def/foo/abc_slot1__':1}],regs:1,site:1,source:1}, {})`,
    context,
  ));
  vm.runInContext('setTimeout(() => {}, 0)', context);
  assert.equal(timerCalls, 1);
  vm.runInContext(
    'setTimeout(async()=>{const a=b;await c();await d(),e(!1,new Error(f(abc)))}, 0)',
    context,
  );
  assert.equal(timerCalls, 1);
  assert.match(
    vm.runInContext('Map.prototype.get.toString()', context),
    /^function get\(\) \{ \[native code\] \}$/,
  );
});
