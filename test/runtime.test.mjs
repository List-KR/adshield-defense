import assert from 'node:assert/strict';
import { atob } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { TextDecoder } from 'node:util';
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
  assert.equal(timerCalls, 2);
  assert.match(
    vm.runInContext('Map.prototype.get.toString()', context),
    /^function get\(\) \{ \[native code\] \}$/,
  );

  loadHandler();
  assert.equal(timerCalls, 3);
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

function createPage({ fetch, linkResult = () => true, readyState = 'complete' } = {}) {
  let alertCalls = 0;
  const requests = [];
  const timers = new Map();
  let nextTimer = 0;

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

    get childElementCount() {
      return this.children.length;
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    set innerHTML(html) {
      // Minimal test double; browser checks exercise the native HTML parser.
      this.content = new FakeNode();
      const tags = /<style\b([^>]*)>([\s\S]*?)<\/style>|<link\b([^>]*)>/gi;
      let match;
      while ((match = tags.exec(html))) {
        const node = new FakeNode(match[3] === undefined ? 'STYLE' : 'LINK');
        for (const attribute of (match[3] ?? match[1]).matchAll(/([\w-]+)=["']([^"']*)["']/g)) {
          node.setAttribute(attribute[1], attribute[2]);
        }
        node.textContent = match[2] || '';
        this.content.appendChild(node);
      }
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
      if (node.tagName === 'LINK' && node.href) {
        Promise.resolve().then(() => {
          const result = linkResult(node);
          if (result === true) {
            node.onload?.();
          } else if (result === false) {
            node.onerror?.();
          }
        });
      }
      return node;
    }

    removeChild(node) {
      const index = this.children.indexOf(node);
      this.children.splice(index, 1);
      node.parentNode = null;
      return node;
    }

    querySelectorAll(selector) {
      const names = selector.toUpperCase().split(',');
      return this.children.flatMap((child) => [
        ...(names.includes(child.tagName) ? [child] : []),
        ...child.querySelectorAll(selector),
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

    disconnect() {
      this.disconnected = true;
    }
  }

  const document = new FakeNode('#document');
  document.readyState = readyState;
  document.currentScript = null;
  document.head = document.appendChild(new FakeNode('HEAD'));
  document.createElement = (tagName) => new FakeNode(tagName.toUpperCase());
  const body = document.appendChild(new FakeNode('BODY'));
  const originalAppendChild = FakeNode.prototype.appendChild;
  const context = vm.createContext({
    document,
    location: { host: 'example.com', href: 'https://example.com/' },
    MutationObserver: FakeMutationObserver,
    Node: FakeNode,
    URL,
    atob,
    AbortController: globalThis.AbortController,
    TextDecoder,
    clearTimeout(id) {
      timers.delete(id);
    },
    alert() {
      alertCalls++;
      return 'shown';
    },
    confirm() {
      return true;
    },
    async fetch(url) {
      requests.push(String(url));
      if (fetch) {
        return fetch(url);
      }
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
    setTimeout(handler, delay) {
      timers.set(++nextTimer, { handler, delay });
      return nextTimer;
    },
    setInterval() {
      return 1;
    },
  });
  vm.runInContext(runtime, context);
  return {
    context, document, body, FakeNode, requests, timers, originalAppendChild,
    observer: FakeMutationObserver.last,
    get alertCalls() { return alertCalls; },
  };
}

async function settle() {
  for (let turn = 0; turn < 4; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('runtime recovers late Ad-Shield styles and error UI', async () => {
  const page = createPage();
  const { FakeNode, body, document, context, requests, originalAppendChild, observer } = page;
  const loader = new FakeNode('SCRIPT', {
    data: 'znbgfzfef99v9xxuf9ef9fvsf796fjjfifxs9c\\f9u9vfpsfxubfxfx9v\\f9jbfifxv9c\\f9fifxu9hfffif1fxueppd9hxdfif7f6296fx9vfaf1uufafmdfa9i\\f99ff9l99',
    src: 'https://css-load.com/loader.min.js',
    onerror: `fetch('https://error-report.com/report')`,
  });
  body.appendChild(loader);

  assert.equal(loader.parentNode, body);
  assert.equal(loader.getAttribute('onerror'), null);
  assert.equal(loader.type, 'application/x-adshield-blocked');

  await settle();
  const recoveredStyle = document.head.children.find(
    (node) => node.tagName === 'LINK',
  );
  assert.match(recoveredStyle?.href, /dogdrip\.net-css-bd-2/);
  assert.equal(
    requests.some((url) => url.includes('dogdrip.net-css-bd-2')),
    false,
  );

  assert.equal(vm.runInContext(`alert('hello')`, context), 'shown');
  assert.equal(page.alertCalls, 1);
  assert.throws(() => vm.runInContext(
    `alert('Failed to load website properly since adblock is blocked')`,
    context,
  ));
  assert.equal(page.alertCalls, 1);

  const overlay = new FakeNode('IFRAME', {
    src: 'https://info.error-report.com/modal',
  });
  originalAppendChild.call(body, overlay);
  assert.equal(overlay.parentNode, body);
  observer.callback([{ addedNodes: [overlay] }]);
  assert.equal(overlay.parentNode, null);
});

test('function inspection is cached and inventory getters remain untouched', () => {
  const page = createPage();
  const { context } = page;
  vm.runInContext(`
    let reads = 0;
    const impression = { device: 1, id: 1, regs: 1, site: 1, imp: [] };
    Object.defineProperty(impression, 'other', { enumerable: true, get() { reads++; throw Error(); } });
    const map = new WeakMap();
    map.set(impression, 1);
    const accessor = { device: 1, id: 1, regs: 1, site: 1, get imp() { reads++; throw Error(); } };
    map.set(accessor, 1);
    impression.imp.push({ '1/abc/def/foo/abc_slot1__': 1 });
  `, context);
  assert.equal(vm.runInContext('reads', context), 0);
  assert.throws(() => vm.runInContext('map.set(impression, 2)', context));
  assert.equal(vm.runInContext('map.get(impression)', context), 1);
  assert.equal(vm.runInContext('new WeakMap().set(Symbol(), 1) instanceof WeakMap', context), true);
  assert.throws(() => vm.runInContext('WeakMap.prototype.set.call({}, {}, 1)', context));

  // Count source reads using a fresh realm before installing the runtime.
  const fresh = vm.createContext({ setTimeout() {}, setInterval() {} });
  vm.runInContext(`
    let sourceReads = 0;
    const nativeToString = Function.prototype.toString;
    Function.prototype.toString = function() {
      sourceReads++;
      return Reflect.apply(nativeToString, this, []);
    };
  `, fresh);
  vm.runInContext(runtime, fresh);
  vm.runInContext(`
    sourceReads = 0;
    const fn = () => 1;
    const callbacks = new Map();
    for (let i = 0; i < 1000; i++) {
      callbacks.get(fn);
      callbacks.set('callback', fn);
    }
  `, fresh);
  assert.equal(vm.runInContext('sourceReads', fresh), 1);
  assert.throws(() => vm.runInContext('Function.prototype.toString.call({})', fresh));
});

test('loader scheduling and reinsertion are blocked without guessing ordinary timer bodies', () => {
  const { context, document, FakeNode, timers, body } = createPage();
  const before = timers.size;
  vm.runInContext('setTimeout(async()=>{const a=b;await c();await d(),e(!1,new Error(f(abc)))}, 0)', context);
  assert.equal(timers.size, before + 1);
  const loader = new FakeNode('SCRIPT', { src: 'https://css-load.com/loader.min.js' });
  document.currentScript = loader;
  assert.throws(() => vm.runInContext('setTimeout(() => {}, 0)', context));
  assert.equal(timers.size, before + 1);
  assert.throws(() => body.appendChild(new FakeNode('SCRIPT')));
  document.currentScript = null;
  assert.throws(() => vm.runInContext(`new Map().set('recovery', async function() {
    node.setAttribute('onload', '!async function(){}');
    await fetch('https://report.error-report.com/modal');
    node.remove();
  })`, context));
  assert.equal(vm.runInContext(`new Map().set('description', 'inventory_id,abc/def/ghi').size`, context), 1);
});

test('base64 styles preserve all blocks, media and nonce while sharing loader and resource requests', async () => {
  const { FakeNode, body, document, requests } = createPage();
  for (const name of ['wp-data', 'data-resource']) {
    const loader = new FakeNode('SCRIPT', {
      src: 'https://css-load.com/loader.min.js?site=sample',
      [name]: globalThis.btoa(`<style media="screen">.${name}{color:red}</style><style>.b{color:blue}</style><script src="resources://must-not-load"></script><link rel="stylesheet" href="resources-v2://shared"><style>.after{color:green}</style>`),
    });
    loader.nonce = 'page-nonce';
    body.appendChild(loader);
  }
  await settle();
  assert.equal(requests.length, 1);
  assert.match(requests[0], /\?site=sample$/);
  assert.equal(document.head.children.filter((node) => node.tagName === 'STYLE').length, 6);
  assert.ok(document.head.children.findIndex((node) => node.tagName === 'LINK')
    < document.head.children.findIndex((node) => node.textContent.includes('.after')));
  const links = document.head.children.filter((node) => node.tagName === 'LINK');
  assert.equal(links.length, 1);
  assert.match(links[0].href, /\/resources\/v2\/shared\?token=.*&host=example.com$/);
  assert.equal(document.head.children.every((node) => node.nonce === 'page-nonce'), true);
  assert.equal(document.head.children[0].media, 'screen');
});

test('partial CSS failure retries only missing resources and resource versions stay distinct', async () => {
  let fail = true;
  const page = createPage({ linkResult: (node) => !(fail && node.href.includes('/resources/v2/')) });
  const { body, FakeNode, document, observer, requests } = page;
  const loader = new FakeNode('SCRIPT', {
    src: 'https://css-load.com/loader.min.js',
    data: '<style>.a{color:red}</style><link rel="stylesheet" href="resources://same"><link rel="stylesheet" href="resources-v2://same">',
  });
  body.appendChild(loader);
  await settle();
  assert.equal(document.head.children.length, 2);
  fail = false;
  observer.callback([{ addedNodes: [loader] }]);
  await settle();
  assert.equal(document.head.children.length, 3);
  assert.equal(requests.length, 1);
  assert.equal(document.head.children.filter((node) => node.tagName === 'STYLE').length, 1);
});

test('stalled stylesheet loads time out and fall back; idle observer is disconnected', async () => {
  const { FakeNode, body, document, timers } = createPage({
    linkResult: (node) => node.href.startsWith('https://css-load.com') ? undefined : true,
  });
  body.appendChild(new FakeNode('SCRIPT', {
    src: 'https://css-load.com/loader.min.js',
    data: '<link rel="stylesheet" href="resources://slow">',
  }));
  await settle();
  const timeout = [...timers.values()].find((timer) => timer.delay === 5_000);
  assert.ok(timeout);
  timeout.handler();
  await settle();
  assert.equal(document.head.children.length, 1);
  assert.match(document.head.children[0].href, /^https:\/\/html-load.com\//);
  assert.equal([...timers.values()].some((timer) => timer.delay === 5_000), false);

  const idle = createPage();
  const replacement = () => 7;
  idle.context.setInterval = replacement;
  [...idle.timers.values()].find((timer) => timer.delay === 30_000).handler();
  assert.equal(idle.observer.disconnected, true);
  assert.equal(idle.context.setInterval, replacement);
});

test('late trees, text nodes, hostile URLs and blob recovery scripts are handled selectively', async () => {
  const { body, FakeNode, originalAppendChild, observer } = createPage();
  const container = new FakeNode('DIV');
  const loader = new FakeNode('SCRIPT', {
    src: 'blob:https://example.com/123',
    'data-src': 'https://html-load.com/recovery.js',
  });
  originalAppendChild.call(container, loader);
  body.appendChild(container);
  assert.equal(loader.type, 'application/x-adshield-blocked');
  const ordinary = new FakeNode('SCRIPT', { src: 'https://css-load.com.example.org/loader.min.js' });
  body.appendChild(ordinary);
  assert.equal(ordinary.type, undefined);
  observer.callback([{ addedNodes: [{ nodeType: 3, querySelectorAll() { throw Error('text scanned'); } }] }]);
  const overlay = new FakeNode('IFRAME', { src: 'https://info.error-report.com/modal' });
  assert.equal(body.appendChild(overlay), overlay);
  assert.equal(overlay.src, 'about:blank');
  await settle();
  assert.equal(overlay.parentNode, null);
  const outer = new FakeNode('DIV');
  const inner = new FakeNode('DIV');
  originalAppendChild.call(outer, inner);
  originalAppendChild.call(inner, ordinary);
  let scans = 0;
  outer.querySelectorAll = inner.querySelectorAll = () => {
    scans++;
    return [ordinary];
  };
  observer.callback([{ addedNodes: [ordinary, inner, outer] }]);
  assert.equal(scans, 1);
});

test('current loader byte escapes recover UTF-8 styles', async () => {
  const { FakeNode, body, document } = createPage();
  body.appendChild(new FakeNode('SCRIPT', {
    src: 'https://css-load.com/loader.min.js',
    data: 'qwhvpkpipgt30zntinn3pgyxpgmsy70yxyxmnxsgnpiqs73n73yxp4pgh1uhxehx3h1qhzehjtp4pgp5qszsgyxgcmp0epz9pzkpmp1pgp1pw',
  }));
  await settle();
  assert.equal(document.head.children[0]?.textContent, 'body::before{content:"한글";color:rgb(1,2,3)}');
});
