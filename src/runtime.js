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
  const originalFetch = W.fetch;
  const originalRemoveChild = W.Node?.prototype.removeChild;
  const ownScript = W.document?.currentScript;
  const restoreCallbacks = [];
  const styleRecoveries = new W.Map();
  const recoveredStyles = new W.Set();
  let detected = false;
  let payloadKeys;
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
  const jwtPattern = /^eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{43}$/;
  // ponytail: legacy payload keys; parse new formats when they appear live.
  const payloadKeyData = 'W1siZGdnbiIsIl9sPCBWenFERjoyZzYxd3tpbShcIjdMQVphL15qJSdLPyIsIngyOWhiOHB3dnNpbGNtcTA2NXQ0Mzdybnl1bzFqZnprZSIsMTAzLCJgSDs0U3lNQi5cbmZ1eG52I1JyUDNFSlEmOVlbTzBjXHRDVW8iLCJ4OGIzbG4xazltY2VpczR1MHdoam95cnp2NXFndGFwZjI3Iiw5NywiTlhHdDU9fV1iSWtoKThUPnAtfGVXcyIsInF4bjZpdXAzb3Q4Z3o3ZmxjdzA5YnkiXSxbIml0aGMiLCJCIGMxXHQzRlklPGZfYjJsdV44Wk5DeiNHJ3ZXTTdyJlE9IiwiczN6Ym85YWhnZjdsazV5MGN1bXJwcW53eDZpNGpldnQyIiw1Niwia2AoNTl3ailcIntnPnNvNlRpQXhcbkxQP3FhcHQwXS1JeWUiLCJrNTIzdGxwemVxdnMweWpoODFvZ3VhNnduYnI3YzltZjRpIiw0OSwiaG5bUlhtfERPSC86LkVWS0o7NH1TVSIsIm0wcnlpcXQ4MzYycDFmYXVsajR6Z2giXSxbImlycnIiLCJXMHw3X3p9e3JvWWtoWExeJSgnLz5OdFFHZ3VaU0E0dlUiLCJ2OWFweWlrNjIzMGo1bWw3bjhidXFyZjF6Z3NjZXd4dDQiLDExMSwieWpNRi1mXCJSW1x0SHd4bnMpcElDMT0yNThFOTZQSzpKT1xuIiwiN2d0a3JwYzQ1bndoNmk4amZ2OTNic3lsYXFlem11Mm8xMCIsMTA0LCJtaWxiYCMzQmFxXTtEVFY/ZS48ICZjIiwiMHQ4a2JmMjZ1ejlzbWg3MTRwY2V4eSJdLFsidmtkcyIsIm5TeU5ERydNai9vPFUgbFwiUUVrbWlYMkh7WllKaDQlPV8iLCJ2YnJsNHM3dTlmOG56NWpwcWkwbXd0ZTZjeWhhZzEzb3giLDEwNywiVHNwektWdkwzOSk6UFJhOHg7LnVnKGB0P3ddNkNPZkYxIiwidXNqbDRmaHdicHIzaXl6NXhnODZtOWV2Y243b2swYTIxdCIsNTAsIltcdGUmNUJeVz4wI1xucmJxSTd9LUF8YyIsInV5OG9hMnM2ZzRqMzAxdDliaXA3cmMiXSxbInptcGMiLCJpO1VqJ1s8d1wiRFQwbFpMZ1M4ZiNoeHNNVn10eTpFLSlgIiwiM2M1MWdvcTQwcHphbDlyNnh1dnRrZXkyc3duajdtaWhiIiwxMDIsIms5NllLKHYvJklDbUdCXHQ1YnphP0hjUF8xVyBxUm9BLj1cbiIsIm10ZXFoMHlzNjJwMWZ4ajU4OXJvNGF1bnpsaWczYzd3YmsiLDU2LCJ7ZUYlT1hyUTI+bnAzSk5dNDd1IiwiOWptYW53eXF4MHM1NHp1dG82aCJdLFsiZndiaCIsIng1QThoRTk9XG5RRzFcIkN1SidvVihJKT5sYlc0RCNlIEw2Iiwid3IyNzV5b2dzajRrdjAzaXpjbngxdWFxYjhwZmxtNnRoIiw1NywiMyV0XHR7MnJja2Z5WFJdP05LJi9GZ3c7VFNNbW4tN19pVS4iLCJ5OTNyZnRzN2x4cTh2a2dqZW41bTBpNnd6aGFwMXVjYjJvIiwxMDEsIn1xQjx6YFBaW1lIOjBzanZhT3AiLCI2bTdrd2UzcWFvaHU1ZzRiejhpIl0sWyJxYnV3IiwiaTtVaidbPHdcIkRUMGxaTGdTOGYjaHhzTVZ9dHk6RS0pYCIsIjNjNTFnb3E0MHB6YWw5cjZ4dXZ0a2V5MnN3bmo3bWloYiIsMTAyLCJrOTZZSyh2LyZJQ21HQlx0NWJ6YT9IY1BfMVcgcVJvQS49XG4iLCJtdGVxaDB5czYycDFmeGo1ODlybzRhdW56bGlnM2M3d2JrIiw1Niwie2VGJU9YclEyPm5wM0pOXTQ3dSIsIjlqbWFud3lxeDBzNTR6dXRvNmgiXSxbIm5sb2MiLCJ4PFt5a1klMS1zSzlfQzBSYWojOE9MbF0vSHdocUZVXHQzIiwiMG96dXBrcng2cWp3bnlnbDM0bTdpOXRoMWY4djJiZWM1Iiw5NywiJm0yR1Q1SXJQXCIgLkIobz06aWdiSnBXbno3dGN2TlpgPlxuIiwiNzRoZnZidGNqMmVyb2EwdWw1Nnl3M2lucXhrZ3A5bTF6cyIsMTE1LCJ1VjZ9KVEnP0R7U2VBTVg0O0VmIiwiOTF5c3hlOGx1b3JuNnZwY2l3cSJdLFsia3luYiIsIjBObX11YkM5TDZrezcoXCJueD5zPUtvXUlCdy95U2dmJVciLCJhMjc0YmNsanR2MG9tdzZ6OWc1cDEzdXM4ZWtoeGlyZnEiLDEyMSwiZT9gM0FVPDJaWztcdGlKRUZWJ3xQYThUNWotLnYgOnEjSCkiLCJlb3c1cmZsdXE4eDR6Z2o3MHAxM2NpNm1oMnM5dG5rYWJ2IiwxMTAsIiZYRF9RT2hNcmx0cFIxYzR6R1xuWSIsImM3ODYzcWJzbXd5NTRvdG5oaXYxIl0sWyJ1eXlrIiwiVHg8V3xYdmN1YkN6LWVrVS8gb2lNXHQmOiVJZz4yaHtzWyIsIm1qYjBmZXU2bHp4N2txaGdvcDRhdDgzMWM5Mnl3aXI1biIsMTE4LCI1ZjtWdFwicURMQjkxJ21cbn0/UjZTKFojQWBKcjBIUWxLUCkiLCJxcDVyODQyeWN2eGpvd2Jhejd1aHRzOWdrNmkwZW1uMTNmIiwxMTUsIk5HbkU4YV95LkZqWU89NHczXXA3Iiwia24xZWhvNmZqYnI0MHB4YzlpMnEiXSxbInJ5cGEiLCJCOCAvWTlvXVZIQ19wM3l0XG5oVE9OaTVxNklHLXI9MmclIiwidWwyb3cwMWo5enE1OG1mazRjdjM3YWJzeWlndGVoNnhuIiwxMTIsIm5FZUpLYS46UHtBO3gwVUxcIjQnWEZtfH13ZnZ6USM3WlMoIiwibTg5NjFxd3pnaHUyN3hlb2FwbjNrNWlsdnJmamM0c3l0MCIsMTE0LCImajxSRHNbVz5idWtNYGM/MSlcdGwiLCI2YWt5aG9yODBtMzdzbGZ3MXZ4cCJdLFsiZWhvciIsIlwicTRcbkozZmtaaGombHRgd0g1MFQ9J2d8KEVQW0ItUVlEIiwiN3VpbDVhM2d4YnJwdHZqZXltbzRjMDl3cXpzNjgybmYxIiwxMDcsIjxHY3BPSS9cdHpBWCU2PzlvIHIuYm1GUmllPktzXyl2O1Z1IiwieXB3engydXNtOG9nNXE3NHRhbmxiNnJpM3ZjZWhqOWtmMSIsMTA0LCI3eTp4MjE4XVUjTkN9bldhTVN7TCIsImJqYTN6a2Z2cWx0Z3U1c3c2NzhuIl0sWyJma2FkIiwiN3o+Z317L1cjYGNbWlQmc0k8Mi1oYUtYWVxubyl4U0ZBIiwibml1ZTh0bXlhY2ozbDkxcTY1Znhid3pydjdwbzJnazQwIiwxMTUsIjFFSGIufHU/cChxZlBpdHkncjZPJVx0dz1dOUJKUkQ7OjhrIiwicGhtMjF2OWN3NGI3M3lnbG5meG90YXpzdWo4cXJrNjUwaSIsMTA0LCJRal4gTkNVdjU0bGVcIlZNbV8zMEdMIiwiYml4cXJod245emptNTRvMTJmZTBzIl0sWyJzdm1tIiwibWFHO0ZULmUyY1l6VjolaX0pZzRicC1LVVp5PHdMXG5fPyIsIjFud3NyN3ZrOGZoMGwzdXQ5MmppZ3F4Nno0NWNwYm15byIsOTcsImtyQkp0RChRbHZePiNbaHtYMTlvJlNFQU0vblwiTz0gMDVQIiwiMzZxejBtdjl0bmU3a3dyYTVpMXVqeDI4b3lmc3BjZ2xoNCIsMTAxLCJ8YFx0J1JxajZDTldIXUk4c3g3dTNmIiwid2VneWpwenV4MzhxMmE5dm1pZm90Il0sWyJjb2txIiwiXCIociU5NmpWSzd7a1BcdGdEaE9jRnMnMTtNXCJJdVFaL3lxQVwiIiwiaXp4c29tcWgzcDhidmdhNDl3N2Z5MnRsdWM2ZTVuMDFyIiwxMDYsIl56R1t3bVxuQ2A9OEJ2PjwmXTA6VCBMI3B4M1hsaS1uKS40IiwicDkxdHp4NGlic2h3ZjNxeWVuNTA2dWdvMm1rdjhscmpjNyIsMTA3LCJFWWY/Uk4yYX1XYlU1ZUhffFN0Sm8iLCJzbThma2hyd2E5NHkwZXVwajJucTEiXSxbInpuYmciLCIoXHRFSENfO3MvLldnTmZWbCB6OU1ZaFF9VGo6SkZVUykjIiwibzVoa203OHVwMnl4d3Z6c2owYXQxYmdscjZlaTQzbmNxIiwxMDIsIktaaXteNDxtXCI1J2MlXG5YTHVyeXBxQThbZUl3LURSfGtiQiIsIm91N2VyY3Z3OWwwMXlnaG5maXA2ODVienhxdGFrM3NqbTQiLDU3LCI9NmEwRz5QT28zN252P3gmMWBdMnQiLCJjcnhtamY3eWhndDZvM3A4bDA5aXYiXV0=';

  function attribute(node, name) {
    try {
      const value = node.getAttribute(name);
      return typeof value === 'string' ? value : '';
    } catch {
      return '';
    }
  }

  function decodePayload(payload) {
    try {
      payloadKeys ??= W.JSON.parse(W.atob(payloadKeyData));
      let key;
      for (const candidate of payloadKeys) {
        if (candidate[0] === payload.slice(0, 4)) {
          key = candidate;
          break;
        }
      }
      if (!key) {
        return [];
      }
      const unwrap = (input, output, character) => {
        const index = output.indexOf(character);
        return index < 0 ? character : input[index];
      };
      let decoded = '';
      let mode = 0;
      for (const character of payload.slice(4)) {
        if (!mode && character === W.String.fromCharCode(key[3])) {
          mode = 1;
          continue;
        }
        if (!mode && character === W.String.fromCharCode(key[6])) {
          mode = 2;
          continue;
        }
        if (mode === 1) {
          mode = 0;
          decoded += key[5].includes(character)
            ? unwrap(key[4], key[5], character)
            : unwrap(key[1], key[2], character) + character;
          continue;
        }
        if (mode === 2) {
          mode = 0;
          decoded += key[8].includes(character)
            ? unwrap(key[7], key[8], character)
            : unwrap(key[1], key[2], character) + character;
          continue;
        }
        decoded += unwrap(key[1], key[2], character);
      }
      return W.JSON.parse(decoded);
    } catch {
      return [];
    }
  }

  function extractToken(source) {
    const fragments = [];
    const pattern = /(['"])([A-Za-z0-9_.-]{4,})\1/g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      fragments.push(match[2]);
    }
    for (let start = 0; start < fragments.length; start++) {
      if (!fragments[start].startsWith('eyJ')) {
        continue;
      }
      let token = '';
      for (let index = start; index < Math.min(start + 20, fragments.length); index++) {
        token += fragments[index];
        if (test(jwtPattern, token)) {
          return token;
        }
        if (token.length > 2_048) {
          break;
        }
      }
    }
    return '';
  }

  function loaderUrls(node) {
    const urls = new W.Set();
    try {
      const source = new W.URL(attribute(node, 'src') || node.src, W.location?.href);
      urls.add(source.href);
      const hostPattern = /['"]([a-z0-9.-]+\.[a-z]{2,})['"]/gi;
      const handler = attribute(node, 'onerror');
      let match;
      while ((match = hostPattern.exec(handler)) !== null) {
        urls.add(`https://${match[1]}${source.pathname}`);
      }
      for (const host of ['css-load.com', 'html-load.com', 'content-loader.com']) {
        urls.add(`https://${host}${source.pathname}`);
      }
    } catch {
      // Invalid script URLs cannot provide recovery resources.
    }
    return [...urls];
  }

  async function fetchText(url, cache) {
    const response = await apply(originalFetch, W, [url, {
      cache,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    }]);
    if (!response?.ok) {
      throw new W.Error();
    }
    return response.text();
  }

  async function findToken(node) {
    const urls = loaderUrls(node);
    for (const url of urls) {
      try {
        const token = extractToken(await fetchText(url, 'no-cache'));
        if (token) {
          const origins = new W.Set();
          origins.add(new W.URL(url).origin);
          for (const candidate of urls) {
            origins.add(new W.URL(candidate).origin);
          }
          return { token, origins };
        }
      } catch {
        // Try the next host copied from the loader's own fallback list.
      }
    }
    return undefined;
  }

  function injectStyle(css, id) {
    if (!css.trim() || recoveredStyles.has(id)) {
      return false;
    }
    const parent = W.document?.head || W.document?.documentElement;
    if (!parent || typeof W.document?.createElement !== 'function') {
      return false;
    }
    const style = W.document.createElement('style');
    style.setAttribute('data-adshield-defense', 'recovered');
    style.textContent = css;
    parent.appendChild(style);
    recoveredStyles.add(id);
    return true;
  }

  async function restoreStyles(node, payload) {
    const entries = payload.startsWith('<') ? [{ tags: payload }] : decodePayload(payload);
    if (!isArray(entries)) {
      return false;
    }
    const resources = [];
    let restored = false;
    for (const [index, entry] of entries.entries()) {
      if (typeof entry?.stylesheet === 'string') {
        restored = injectStyle(entry.stylesheet, `${payload}:${index}`) || restored;
      }
      if (typeof entry?.tags !== 'string') {
        continue;
      }
      const stylePattern = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      let match;
      while ((match = stylePattern.exec(entry.tags)) !== null) {
        restored = injectStyle(match[1], `${payload}:style:${index}`) || restored;
      }
      const resourcePattern = /resources(-v2)?:\/\/([A-Za-z0-9._/-]+)/g;
      while ((match = resourcePattern.exec(entry.tags)) !== null) {
        resources.push({ id: match[2], version: match[1] ? 2 : 1 });
      }
    }
    if (!resources.length || typeof originalFetch !== 'function') {
      return restored;
    }
    const access = await findToken(node);
    if (!access) {
      return restored;
    }
    for (const resource of resources) {
      if (recoveredStyles.has(resource.id)) {
        continue;
      }
      for (const origin of access.origins) {
        const path = resource.version === 2 ? 'resources/v2' : 'resources';
        let url = `${origin}/${path}/${resource.id}?token=${W.encodeURIComponent(access.token)}`;
        if (resource.version === 2) {
          url += `&host=${W.encodeURIComponent(W.location.host)}`;
        }
        try {
          const css = await fetchText(url, 'force-cache');
          if (injectStyle(css, resource.id)) {
            restored = true;
            break;
          }
        } catch {
          // Resource mirrors share the token, so try the next one.
        }
      }
    }
    return restored;
  }

  function recoverStyles(node) {
    const payload = attribute(node, 'data') || attribute(node, 'wp-data');
    if (!payload || styleRecoveries.has(payload)) {
      return;
    }
    const recovery = restoreStyles(node, payload);
    styleRecoveries.set(payload, recovery);
    recovery.then((restored) => {
      if (!restored) {
        styleRecoveries.delete(payload);
      }
    }, () => styleRecoveries.delete(payload));
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

  function recoverAdShieldNode(node) {
    markDetected();
    if (node.tagName === 'SCRIPT') {
      recoverStyles(node);
      return;
    }
    if (node.tagName !== 'IFRAME' || !node.parentNode) {
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
      recoverAdShieldNode(root);
      return true;
    }
    try {
      for (const node of root.querySelectorAll('script,iframe')) {
        if (isAdShieldNode(node)) {
          recoverAdShieldNode(node);
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

  function isAdShieldMessage(value) {
    if (typeof value !== 'string') {
      return false;
    }
    const lower = value.toLowerCase();
    return lower.includes('failed to load website')
      || (value.includes('애드블록') && value.includes('로드'));
  }

  if (W.Node?.prototype) {
    for (const key of ['appendChild', 'insertBefore', 'replaceChild']) {
      if (typeof W.Node.prototype[key] !== 'function') {
        continue;
      }
      wrap(W.Node.prototype, key, (target, thisArg, args) => {
        if (isAdShieldNode(args[0])) {
          recoverAdShieldNode(args[0]);
          if (args[0].tagName === 'IFRAME') {
            return key === 'replaceChild' ? args[1] : args[0];
          }
        }
        return apply(target, thisArg, args);
      });
    }
  }

  for (const key of ['alert', 'confirm']) {
    if (typeof W[key] !== 'function') {
      continue;
    }
    wrap(W, key, (target, thisArg, args) => {
      if (isAdShieldMessage(args[0])) {
        abortAdShield();
      }
      return apply(target, thisArg, args);
    });
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
