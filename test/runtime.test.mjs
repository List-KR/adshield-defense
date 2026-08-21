import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const runtime = await readFile(
  new URL('../src/runtime.js', import.meta.url),
  'utf8',
);

test('runtime blocks Ad-Shield and keeps hooks after detection', () => {
  let loadHandler;
  let restoreHandler;
  let timerCalls = 0;
  const context = vm.createContext({
    document: { readyState: 'loading' },
    addEventListener(event, handler) {
      if (event === 'load') {
        loadHandler = handler;
      }
    },
    setTimeout(handler, delay) {
      timerCalls++;
      if (delay === 30_000) {
        restoreHandler = handler;
      }
      return 1;
    },
    setInterval() {
      timerCalls++;
      return 1;
    },
  });
  vm.runInContext(runtime, context);
  const patchedMapGet = vm.runInContext('Map.prototype.get', context);

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

  loadHandler();
  assert.equal(timerCalls, 2);
  restoreHandler();
  assert.equal(vm.runInContext('Map.prototype.get', context), patchedMapGet);
});

test('runtime restores hooks when no signature is detected', () => {
  let loadHandler;
  let restoreHandler;
  const context = vm.createContext({
    document: { readyState: 'loading' },
    addEventListener(event, handler) {
      if (event === 'load') {
        loadHandler = handler;
      }
    },
    setTimeout(handler, delay) {
      if (delay === 30_000) {
        restoreHandler = handler;
      }
      return 1;
    },
    setInterval() {
      return 1;
    },
  });
  const originals = vm.runInContext(`({
    get: Map.prototype.get,
    set: Map.prototype.set,
    weakSet: WeakMap.prototype.set,
    timeout: setTimeout,
    interval: setInterval,
    toString: Function.prototype.toString,
  })`, context);

  vm.runInContext(runtime, context);
  assert.notEqual(vm.runInContext('Map.prototype.get', context), originals.get);
  loadHandler();
  restoreHandler();

  assert.equal(vm.runInContext('Map.prototype.get', context), originals.get);
  assert.equal(vm.runInContext('Map.prototype.set', context), originals.set);
  assert.equal(vm.runInContext('WeakMap.prototype.set', context), originals.weakSet);
  assert.equal(vm.runInContext('setTimeout', context), originals.timeout);
  assert.equal(vm.runInContext('setInterval', context), originals.interval);
  assert.equal(
    vm.runInContext('Function.prototype.toString', context),
    originals.toString,
  );
});

test('runtime recovers late Ad-Shield nodes and blocks reinsertion', () => {
  let alertCalls = 0;
  let restoreHandler;

  class FakeNode {
    constructor(tagName = '', attributes = {}) {
      this.tagName = tagName;
      this.attributes = attributes;
      this.children = [];
      this.parentNode = null;
      this.textContent = '';
    }

    get src() {
      return this.getAttribute('src') ?? '';
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }

    getAttribute(name) {
      return this.attributes[name] ?? null;
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      return node;
    }

    removeChild(node) {
      const index = this.children.indexOf(node);
      this.children.splice(index, 1);
      node.parentNode = null;
      return node;
    }

    querySelectorAll() {
      return this.children.flatMap((child) => [
        ...(['SCRIPT', 'IFRAME'].includes(child.tagName) ? [child] : []),
        ...child.querySelectorAll(),
      ]);
    }
  }

  class FakeMutationObserver {
    static last;

    constructor(callback) {
      this.callback = callback;
      FakeMutationObserver.last = this;
    }

    observe() {}
  }

  const document = new FakeNode('#document');
  document.readyState = 'complete';
  const body = document.appendChild(new FakeNode('BODY'));
  document.currentScript = body.appendChild(new FakeNode('SCRIPT'));
  document.currentScript.textContent = 'css-load.com error-report.com';
  const loader = new FakeNode('SCRIPT', {
    src: 'https://css-load.com/loader.min.js',
    onerror: `fetch('https://error-report.com/report')`,
  });
  body.appendChild(loader);
  const originalAppendChild = FakeNode.prototype.appendChild;
  const context = vm.createContext({
    document,
    location: { href: 'https://example.com/' },
    MutationObserver: FakeMutationObserver,
    Node: FakeNode,
    URL,
    alert() {
      alertCalls++;
      return 'shown';
    },
    confirm() {
      return true;
    },
    setTimeout(handler, delay) {
      if (delay === 30_000) {
        restoreHandler = handler;
      }
      return 1;
    },
    setInterval() {
      return 1;
    },
  });

  vm.runInContext(runtime, context);
  const patchedAppendChild = FakeNode.prototype.appendChild;

  assert.equal(loader.parentNode, body);
  assert.match(loader.getAttribute('onerror'), /error-report\.com/);
  assert.equal(document.currentScript.parentNode, body);

  const safeScript = new FakeNode('SCRIPT', {
    src: 'https://example.com/loader.min.js',
  });
  assert.equal(body.appendChild(safeScript), safeScript);
  assert.equal(safeScript.parentNode, body);

  const retry = new FakeNode('SCRIPT', {
    src: 'https://fallback.example/loader.min.js',
    onerror: `fetch('https://error-report.com/report')`,
  });
  assert.equal(body.appendChild(retry), retry);
  assert.equal(retry.parentNode, body);

  assert.equal(vm.runInContext(`alert('hello')`, context), 'shown');
  assert.equal(alertCalls, 1);
  assert.throws(() => vm.runInContext(
    `alert('Failed to load website properly since adblock is blocked')`,
    context,
  ));
  assert.equal(alertCalls, 1);

  const overlay = new FakeNode('IFRAME', {
    src: 'https://info.error-report.com/modal',
  });
  originalAppendChild.call(body, overlay);
  assert.equal(overlay.parentNode, body);
  FakeMutationObserver.last.callback([{ addedNodes: [overlay] }]);
  assert.equal(overlay.parentNode, null);

  restoreHandler();
  assert.equal(FakeNode.prototype.appendChild, patchedAppendChild);
});
