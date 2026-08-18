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
  }

  const toStringProxy = new W.Proxy(functionToString, {
    apply(target, thisArg, args) {
      return nativeSources.get(thisArg) ?? apply(target, thisArg, args);
    },
  });
  nativeSources.set(toStringProxy, sourceOf(functionToString));
  W.Function.prototype.toString = toStringProxy;

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
      throw new W.Error();
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
        && test(inventoryIdPattern, `${key},${value}`)
      ) {
        throw new W.Error();
      }
      if (typeof value === 'function') {
        const text = `${key},${sourceOf(value)}`;
        if (
          text.includes('error-report.com')
          && all(reinsertionPatterns, text)
        ) {
          throw new W.Error();
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
      throw new W.Error();
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
        return undefined;
      }
      return apply(target, thisArg, args);
    });
  }
})();
