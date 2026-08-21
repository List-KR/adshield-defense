import assert from 'node:assert/strict';
import { atob } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setImmediate } from 'node:timers';
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

test('runtime recovers late Ad-Shield styles and error UI', async () => {
  let alertCalls = 0;
  const requests = [];

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

    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      if (node.tagName === 'LINK') {
        Promise.resolve().then(() => node.onload?.());
      }
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
  document.head = document.appendChild(new FakeNode('HEAD'));
  document.createElement = (tagName) => new FakeNode(tagName.toUpperCase());
  const body = document.appendChild(new FakeNode('BODY'));
  const loader = new FakeNode('SCRIPT', {
    data: 'znbgfzfef99v9xxuf9ef9fvsf796fjjfifxs9c\\f9u9vfpsfxubfxfx9v\\f9jbfifxv9c\\f9fifxu9hfffif1fxueppd9hxdfif7f6296fx9vfaf1uufafmdfa9i\\f99ff9l99',
    src: 'https://css-load.com/loader.min.js',
    onerror: `fetch('https://error-report.com/report')`,
  });
  body.appendChild(loader);
  const originalAppendChild = FakeNode.prototype.appendChild;
  const context = vm.createContext({
    document,
    location: { host: 'example.com', href: 'https://example.com/' },
    MutationObserver: FakeMutationObserver,
    Node: FakeNode,
    URL,
    atob,
    alert() {
      alertCalls++;
      return 'shown';
    },
    confirm() {
      return true;
    },
    async fetch(url) {
      requests.push(String(url));
      if (String(url).includes('/loader.min.js')) {
        return {
          ok: true,
          async text() {
            return `const a='eyJhbGci',b='.eyJleHA',c='.1234567890123456789012345678901234567890123'`;
          },
        };
      }
      return { ok: false };
    },
    setTimeout() {
      return 1;
    },
    setInterval() {
      return 1;
    },
  });

  vm.runInContext(runtime, context);

  assert.equal(loader.parentNode, body);
  assert.match(loader.getAttribute('onerror'), /error-report\.com/);

  for (let turn = 0; turn < 3; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const recoveredStyle = document.head.children.find(
    (node) => node.tagName === 'LINK',
  );
  assert.match(recoveredStyle?.href, /dogdrip\.net-css-bd-2/);
  assert.equal(
    requests.some((url) => url.includes('dogdrip.net-css-bd-2')),
    false,
  );

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
});
