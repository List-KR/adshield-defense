/*!
 * @license MPL-2.0
 * Derived from FilteringDev/tinyShield's monkey-patch logic.
 * https://mozilla.org/MPL/2.0/
 */
(() => {
  'use strict';

  // ponytail: universal early hooks trade small per-call overhead for document-start coverage.
  const W = globalThis;
  const apply = W.Reflect.apply;
  const functionToString = W.Function.prototype.toString;
  const regexpTest = W.RegExp.prototype.test;
  const propertyIsEnumerable = W.Object.prototype.propertyIsEnumerable;
  const isArray = W.Array.isArray;
  const nativeSources = new W.WeakMap();
  const originalSetTimeout = W.setTimeout;
  const originalRemoveChild = W.Node?.prototype.removeChild;
  const ownScript = W.document?.currentScript;
  const restoreCallbacks = [];
  let detected = false;
  let recoveryObserver;
  const sourceOf = (fn) => apply(functionToString, fn, []);
  const test = (regexp, text) => apply(regexpTest, regexp, [text]);

  function all(patterns, text) {
    for (const pattern of patterns) {
      if (!test(pattern, text)) {
        return false;
      }
    }
    return true;
  }

  function wrap(owner, key, handler) {
    const target = owner[key];
    const proxy = new W.Proxy(target, { apply: handler });
    nativeSources.set(proxy, sourceOf(target));
    owner[key] = proxy;
    restoreCallbacks.push(() => {
      if (owner[key] === proxy) {
        owner[key] = target;
      }
    });
  }

  const adShieldHostPattern = /(^|\.)(ad-shield\.(io|cc)|adrecover\.com|cadmus\.script\.ac|css-load\.com|html-load\.com|content-loader\.com|img-load\.com|error-report\.com)$/i;

  function attribute(node, name) {
    try {
      const value = node.getAttribute(name);
      return typeof value === 'string' ? value : '';
    } catch {
      return '';
    }
  }

  function isAdShieldUrl(value) {
    if (!value || typeof W.URL !== 'function') {
      return false;
    }
    try {
      return test(adShieldHostPattern, new W.URL(value, W.location?.href).hostname);
    } catch {
      return false;
    }
  }

  function isAdShieldNode(node) {
    try {
      if (
        !node
        || node === ownScript
        || (node.tagName !== 'SCRIPT' && node.tagName !== 'IFRAME')
      ) {
        return false;
      }
      const src = attribute(node, 'src') || node.src;
      if (isAdShieldUrl(src)) {
        return true;
      }
      if (node.tagName === 'IFRAME') {
        return false;
      }
      const handlers = `${attribute(node, 'onerror')},${attribute(node, 'onload')}`;
      if (handlers.includes('error-report.com')) {
        return true;
      }
      const text = node.textContent;
      return typeof text === 'string'
        && text.includes('error-report.com')
        && (
          text.includes('css-load.com')
          || text.includes('html-load.com')
          || text.includes('content-loader.com')
        );
    } catch {
      return false;
    }
  }

  function startRecoveryObserver() {
    if (recoveryObserver || typeof W.MutationObserver !== 'function' || !W.document) {
      return;
    }
    try {
      recoveryObserver = new W.MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            recoverAdShieldTree(node);
          }
        }
      });
      recoveryObserver.observe(W.document, { childList: true, subtree: true });
    } catch {
      recoveryObserver = undefined;
    }
  }

  function markDetected() {
    detected = true;
    startRecoveryObserver();
  }

  function neutralizeAdShieldNode(node, remove) {
    markDetected();
    try {
      node.onerror = null;
      node.onload = null;
      node.removeAttribute('onerror');
      node.removeAttribute('onload');
    } catch {
      // Keep removing a protected node even if its handlers cannot be cleared.
    }
    if (!remove || !node.parentNode) {
      return;
    }
    try {
      if (typeof originalRemoveChild === 'function') {
        apply(originalRemoveChild, node.parentNode, [node]);
      } else {
        node.remove();
      }
    } catch {
      // The hooks still block later Ad-Shield work if the node is protected.
    }
  }

  function recoverAdShieldTree(root) {
    if (!root) {
      return false;
    }
    if (isAdShieldNode(root)) {
      neutralizeAdShieldNode(root, true);
      return true;
    }
    try {
      for (const node of root.querySelectorAll('script,iframe')) {
        if (isAdShieldNode(node)) {
          neutralizeAdShieldNode(node, true);
        }
      }
    } catch {
      // Non-DOM roots and hostile page objects are ignored.
    }
    return false;
  }

  function abortAdShield() {
    markDetected();
    throw new W.Error();
  }

  if (W.Node?.prototype) {
    for (const key of ['appendChild', 'insertBefore', 'replaceChild']) {
      if (typeof W.Node.prototype[key] !== 'function') {
        continue;
      }
      wrap(W.Node.prototype, key, (target, thisArg, args) => {
        if (isAdShieldNode(args[0])) {
          neutralizeAdShieldNode(args[0], false);
          return key === 'replaceChild' ? args[1] : args[0];
        }
        return apply(target, thisArg, args);
      });
    }
  }

  const toStringProxy = new W.Proxy(functionToString, {
    apply(target, thisArg, args) {
      return nativeSources.get(thisArg) ?? apply(target, thisArg, args);
    },
  });
  nativeSources.set(toStringProxy, sourceOf(functionToString));
  W.Function.prototype.toString = toStringProxy;
  restoreCallbacks.push(() => {
    if (W.Function.prototype.toString === toStringProxy) {
      W.Function.prototype.toString = functionToString;
    }
  });

  const initPatterns = [
    /[a-zA-Z0-9]+ *=> *{ *const *[a-zA-Z0-9]+ *= *[a-zA-Z0-9]+ *; *if/,
    /===? *[a-zA-Z0-9]+ *\[ *[a-zA-Z0-9]+\( *[0-9a-z]+ *\) *\] *\) *return *[a-zA-Z0-9]+ *\( *{ *('|\")?inventoryId('|\")? *:/,
    /{ *('|\")?inventoryId('|\")? *: *this *\[[a-zA-Z0-9]+ *\( *[0-9a-z]+ *\) *\] *, *\.\.\. *[a-zA-Z0-9]+ *\[ *[a-zA-Z0-9]+ *\( *[0-9a-z]+ *\) *\] *} *\)/,
  ];

  function isInitFunction(text) {
    if (!text.includes('inventoryId')) {
      return false;
    }
    let matches = 0;
    for (const pattern of initPatterns) {
      if (test(pattern, text) && ++matches === 2) {
        return true;
      }
    }
    return false;
  }

  wrap(W.Map.prototype, 'get', (target, thisArg, args) => {
    if (
      typeof args[0] === 'function'
      && isInitFunction(sourceOf(args[0]))
    ) {
      abortAdShield();
    }
    return apply(target, thisArg, args);
  });

  const inventoryIdPattern = /inventory_id,[a-zA-Z0-9-]+\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+/;
  const reinsertionPatterns = [
    /[a-z0-9A-Z]+\.setAttribute\( *('|\")onload('|\") *, *('|\")! *async *function\( *\) *\{ *let */,
    /confirm\( *[A-Za-z0-9]+ *\) *\) *{ *const *[A-Za-z0-9]+ *= *new *[A-Za-z0-9]+\.URL\(('|\")https:\/\/report\.error-report\.com\//,
    /\.forEach *\( *\( *[A-Za-z0-9]+ *=> *[A-Za-z0-9]+\.remove *\( *\) *\) *\) *\) *, *[0-9a-f]+ *\) *; *const *[A-Za-z0-9]+ *= *awai,t *\( *await *fetch *\(/,
  ];

  wrap(W.Map.prototype, 'set', (target, thisArg, args) => {
    const [key, value] = args;
    if (typeof key === 'string') {
      if (
        typeof value === 'string'
        && (key.includes('inventory_id') || value.includes('inventory_id'))
        && test(inventoryIdPattern, `${key},${value}`)
      ) {
        abortAdShield();
      }
      if (typeof value === 'function') {
        const text = `${key},${sourceOf(value)}`;
        if (
          text.includes('error-report.com')
          && all(reinsertionPatterns, text)
        ) {
          abortAdShield();
        }
      }
    }
    return apply(target, thisArg, args);
  });

  const secondaryInventoryKeys = ['device', 'id', 'regs', 'site', 'source'];
  const frameIdPattern = /^[0-9]+\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+\/[a-z0-9()-]+\/[a-zA-Z0-9_]+_slot[0-9]+_+/;

  function isInventoryObject(value) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    let operations = 6;

    try {
      if (!apply(propertyIsEnumerable, value, ['imp'])) {
        return false;
      }
      let commonKeys = 1;
      for (const key of secondaryInventoryKeys) {
        if (apply(propertyIsEnumerable, value, [key])) {
          commonKeys++;
        }
      }
      if (commonKeys < 5) {
        return false;
      }

      let topLevelKeys = 0;
      for (const key in value) {
        if (!apply(propertyIsEnumerable, value, [key])) {
          continue;
        }
        if (++topLevelKeys > 300 || ++operations > 10_000) {
          return false;
        }

        const items = value[key];
        if (!isArray(items)) {
          continue;
        }
        const length = Math.min(items.length, 1_000);

        for (let index = 0; index < length; index++) {
          if (++operations > 10_000) {
            return false;
          }
          const item = items[index];
          if (!item || typeof item !== 'object') {
            continue;
          }

          let innerKeys = 0;
          for (const innerKey in item) {
            if (!apply(propertyIsEnumerable, item, [innerKey])) {
              continue;
            }
            if (++innerKeys > 100 || ++operations > 10_000) {
              return false;
            }
            if (test(frameIdPattern, innerKey)) {
              return true;
            }
          }
        }
        if (items.length > 1_000) {
          return false;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  wrap(W.WeakMap.prototype, 'set', (target, thisArg, args) => {
    if (isInventoryObject(args[0])) {
      abortAdShield();
    }
    return apply(target, thisArg, args);
  });

  const timerPatterns = [
    /async *\( *\) *=> *{ *const *[A-Za-z0-9]+ *= *[A-Za-z0-9]+ *; *await *[A-Za-z0-9]+ *\( *\)/,
    /; *await *[A-Za-z0-9]+ *\( *\) *, *[A-Za-z0-9]+ *\( *! *1 *, *new *Error *\( *[A-Za-z0-9]+ *\( *[0-9a-f]+ *\) *\) *\) *}/,
    / *\) *\) *\) *}/,
  ];
  const AsyncFunction = (async () => {}).constructor;

  function isAdShieldTimer(handler) {
    if (typeof handler === 'function') {
      try {
        if (handler.constructor !== AsyncFunction) {
          return false;
        }
      } catch {
        return false;
      }
    }
    if (typeof handler !== 'function' && typeof handler !== 'string') {
      return false;
    }
    const text = typeof handler === 'function' ? sourceOf(handler) : handler;
    return text.includes('new Error') && all(timerPatterns, text);
  }

  for (const key of ['setTimeout', 'setInterval']) {
    wrap(W, key, (target, thisArg, args) => {
      if (isAdShieldTimer(args[0])) {
        markDetected();
        return undefined;
      }
      return apply(target, thisArg, args);
    });
  }

  function restoreIfUnused() {
    if (detected) {
      return;
    }
    for (let index = restoreCallbacks.length - 1; index >= 0; index--) {
      restoreCallbacks[index]();
    }
  }

  function scheduleRestore() {
    recoverAdShieldTree(W.document);
    apply(originalSetTimeout, W, [restoreIfUnused, 30_000]);
  }

  recoverAdShieldTree(W.document);

  if (W.document?.readyState === 'complete') {
    scheduleRestore();
  } else if (typeof W.addEventListener === 'function') {
    apply(W.addEventListener, W, ['load', scheduleRestore, { once: true }]);
  } else {
    scheduleRestore();
  }
})();
