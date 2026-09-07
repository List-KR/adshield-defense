/*!
 * @license MPL-2.0
 * Earlier revisions derived from FilteringDev/tinyShield (see Git history).
 * Runtime detection reimplemented from Ad-Shield behavior.
 * https://mozilla.org/MPL/2.0/
 */
(() => {
  'use strict';

  // ponytail: universal early hooks trade small per-call overhead for document-start coverage.
  const W = globalThis;
  const document = W.document;
  const apply = W.Reflect.apply;
  const functionToString = W.Function.prototype.toString;
  const regexpTest = W.RegExp.prototype.test;
  const descriptor = W.Object.getOwnPropertyDescriptor;
  const weakSet = W.WeakMap.prototype.set;
  const isArray = W.Array.isArray;
  const originals = new W.WeakMap();
  const functionKinds = new W.WeakMap();
  const originalSetTimeout = W.setTimeout;
  const originalClearTimeout = W.clearTimeout;
  const originalFetch = W.fetch;
  const originalRemoveChild = W.Node?.prototype.removeChild;
  const ownScript = document?.currentScript;
  const restoreCallbacks = [];
  const styleRecoveries = new W.Map();
  const recoveredStyles = new W.Set();
  const pendingStyles = new W.Map();
  const loaderAccess = new W.Map();
  let detected = false;
  let payloadKeys;
  const decodingTables = new W.Map();
  let recoveryObserver;
  const sourceOf = (fn) => apply(functionToString, fn, []);
  const test = (regexp, text) => apply(regexpTest, regexp, [text]);

  function install(owner, key, inspect) {
    const original = owner[key];
    if (typeof original !== 'function') {
      return;
    }
    const replacement = new W.Proxy(original, {
      apply(target, receiver, args) {
        inspect(args);
        return apply(target, receiver, args);
      },
    });
    apply(weakSet, originals, [replacement, original]);
    owner[key] = replacement;
    restoreCallbacks.push([owner, key, original, replacement]);
  }

  const adShieldHostPattern = /(^|\.)(ad-shield\.(io|cc)|adrecover\.com|cadmus\.script\.ac|css-load\.com|html-load\.com|content-loader\.com|img-load\.com|error-report\.com)$/i;
  const jwtPattern = /^eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{43}$/;
  // Protocol alphabets observed in css-load.com/loader.min.js (2026-09-07).
  // Includes prior alphabets for cached/older loaders; these are data, not code.
  const payloadKeyData = '[["ybfq",";feQX\\\\.Nx<y}2\\nU9bISL/6i!Yu#Ah|C^Z","1kohmv4rl08362aip7fjs5ctbqygzwxne",117,"4WB]3>\\to=nMvcKaw_rVR7zlqm)Fp`:TgO\'","x50w4oe7cjzq8kr6i9aft2p1ngulm3hybv",57,"?-08tP(JH1EG{%[j&s\\" D5k","3bpkimfvxe716nzoyrw0q52"],["nxzn","JKj%IVz[<EH&=FmicuM.:\\tS-xPoZs7\\nkA","o9qzaxtp406wke7ib2g38fymvj5lch1nr",117,"w1Gp>0yB`5Yt\\\\e42]^C3OUXgb n}a\'Tfq{","qgpk375ntl8jw9rmx2i0hc1zuv4oby6sef",115,"N(9|!/_RDv6Q)\\"8?L#hWlr;","ivmslr48ace3zokgxt10b6p"],["kfpv","ra;MH7zfAoQ\\txTUh?n=!NJK9<v`5{#m[3","895t7q1c2vemfuksl60hyzjnwo34bxpgi",97,"y}XW]O&Gl/Ct)sYB8-bF4R\\nD\'pSE0\\\\u.ZP","oilr87t6g1qbz5ef4hvpycujmx3nws02k9",114,"^w V_1qk6:j(\\"g>i%e|L2cI","6nv8cjgzbqs1k49wlx753ae"],["fmjx","XEQ5%<J_h#.0f?veK:{\\tCutj`BP8NGUb)","fu6qr8pikwcnx1astm479bvg2ezlo03hy",106,"sxp2W9 -3OnS&7H=rV4D;T[aw!]MAI/}Ll","4bov28syq7xaceg65fm09rt3lihnkuzjp1",53,"y\\\\6Zg1qm^kzc\'|(YioR\\">F\\n","cq9834khws2tragj7flnymu"],["zmpc",".Ip>szJ8EwahYM/v;yKc=f\\n([_T q3nOS","5nv1iegza269ju8soky04h3p7rltcxmbq",119,"QCABV\\"]#0jb&Wo6t:UuiHg1rPD4%)RlNk-","le4971m5irpukxjv3sq2o8y60gnbzthwfa",102,"G752e`LXx\'Zm}9<\\t{?F","plbi21cxfmo36tn50uq"],["fwbh","x5A8hE9=\\nQG1\\"CuJ\'oV(I)>lbW4D#e L6","wr275yogsj4kv03izcnx1uaqb8pflm6th",57,"3%t\\t{2rckfyXR]?NK&/Fgw;TSMmn-7_iU.","y93rfts7lxq8vkgjen5m0i6wzhap1ucb2o",101,"}qB<z`PZ[YH:0sjvaOp","6m7kwe3qaohu5g4bz8i"],["qbuw","i;Uj\'[<w\\"DT0lZLgS8f#hxsMV}ty:E-)`","3c51goq40pzal9r6xuvtkey2swnj7mihb",102,"k96YK(v/&ICmGB\\t5bza?HcP_1W qRoA.=\\n","mteqh0ys62p1fxj589ro4aunzlig3c7wbk",56,"{eF%OXrQ2>np3JN]47u","9jmanwyqx0s54zuto6h"],["nloc","x<[ykY%1-sK9_C0Raj#8OLl]/HwhqFU\\t3","0ozupkrx6qjwnygl34m7i9th1f8v2bec5",97,"&m2GT5IrP\\" .B(o=:igbJpWnz7tcvNZ`>\\n","74hfvbtcj2eroa0ul56yw3inqxkgp9m1zs",115,"uV6})Q\'?D{SeAMX4;Ef","91ysxe8luorn6vpciwq"],["kynb","0Nm}ubC9L6k{7(\\"nx>s=Ko]IBw/ySgf%W","a274bcljtv0omw6z9g5p13us8ekhxirfq",121,"e?`3AU<2Z[;\\tiJEFV\'|Pa8T5j-.v :q#H)","eow5rfluq8x4zgj70p13ci6mh2s9tnkabv",110,"&XD_QOhMrltpR1c4zG\\nY","c7863qbsmwy54otnhiv1"],["uyyk","Tx<W|XvcubCz-ekU/ oiM\\t&:%Ig>2h{s[","mjb0feu6lzx7kqhgop4at831c92ywir5n",118,"5f;Vt\\"qDLB91\'m\\n}?R6S(Z#A`Jr0HQlKP)","qp5r842ycvxjowbaz7uhts9gk6i0emn13f",115,"NGnE8a_y.FjYO=4w3]p7","kn1eho6fjbr40pxc9i2q"],["rypa","B8 /Y9o]VHC_p3yt\\nhTONi5q6IG-r=2g%","ul2ow01j9zq58mfk4cv37absyigteh6xn",112,"nEeJKa.:P{A;x0UL\\"4\'XFm|}wfvzQ#7ZS(","m8961qwzghu27xeoapn3k5ilvrfjc4syt0",114,"&j<RDs[W>bukM`c?1)\\tl","6akyhor80m37slfw1vxp"],["ehor","\\"q4\\nJ3fkZhj&lt`wH50T=\'g|(EP[B-QYD","7uil5a3gxbrptvjeymo4c09wqzs682nf1",107,"<GcpOI/\\tzAX%6?9o r.bmFRie>Ks_)v;Vu","ypwzx2usm8og5q74tanlb6ri3vcehj9kf1",104,"7y:x218]U#NC}nWaMS{L","bja3zkfvqltgu5sw678n"],["fkad","7z>g}{/W#`c[ZT&sI<2-haKXYn\\no)xSFA","niue8tmyacj3l91q65fxbwzrv7po2gk40",115,"1EHb.|u?p(qfPity\'r6O%\\tw=]9BJRD;:8k","phm21v9cw4b73yglnfxotazsuj8qrk650i",104,"Qj^ NCUv54le\\"VMm_30GL","bixqrhwn9zjm54o12fe0s"],["svmm","maG;FT.e2cYzV:%i})g4bp-KUZy<wL\\n_?","1nwsr7vk8fh0l3ut92jigqx6z45cpbmyo",97,"krBJtD(Qlv^>#[h{X19o&SEAM/n\\"O= 05P","36qz0mv9tne7kwra5i1ujx28oyfspcglh4",101,"|`\\t\'Rqj6CNWH]I8sx7u3f","wegyjpzux38q2a9vmifot"],["cokq","(r%96jVK7{kP\\tgDhOcFs\'1;M\\"IuQZ/yqA","izxsomqh3p8bvga49w7fy2tluc6e5n01r",106,"^zG[wm\\nC`=8Bv><&]0:T L#px3Xli-n).4","p91tzx4ibshwf3qyen506ugo2mkv8lrjc7",107,"EYf?RN2a}WbU5eH_|StJo","sm8fkhrwa94y0eupj2nq1"],["znbg","(\\tEHC_;s/.WgNfVl z9MYhQ}Tj:JFUS)#","o5hkm78up2yxwvzsj0at1bglr6ei43ncq",102,"KZi{^4<m\\"5\'c%\\nXLurypqA8[eIw-DR|kbB","ou7ercvw9l01yghnfip685bzxqtak3sjm4",57,"=6a0G>POo37nv?x&1`]2t","crxmjf7yhgt6o3p8l09iv"],["dggn","_l< VzqDF:2g61w{im(\\"7LAZa/^j%\\\\\'K?","x29hb8pwvsilcmq065t437rnyuo1jfzke",103,"`H;4SyMB.\\nfuxnv#RrP3EJQ&9Y[O0c\\tCUo","x8b3ln1k9mceis4u0whjoyrzv5qgtapf27",97,"NXGt5=}]bIkh)8T>p-|eWs","qxn6iup3ot8gz7flcw09by"],["ithc","B c1\\t3FY%<f_b2lu^8ZNCz#G\'vWM7r&Q=","s3zbo9ahgf7lk5y0cumrpqnwx6i4jevt2",56,"k`(59wj)\\"{g>s\\\\o6TiAx\\nLP?qapt0]-Iye","k523tlpzeqvs0yjh81ogua6wnbr7c9mf4i",49,"hn[RXm|DOH/:.EVKJ;4}SU","m0ryiqt8362p1faulj4zgh"],["irrr","W0|7_z}{roYkhXL^%(\'/>NtQGguZSA4vU","v9apyik6230j5ml7n8buqrf1zgscewxt4",111,"\\\\yjMF-f\\"R[\\tHwxns)pIC1=258E96PK:JO\\n","7gtkrpc45nwh6i8jfv93bsylaqezmu2o10",104,"milb`#3Baq];DTV?e.< &c","0t8kbf26uz9smh714pcexy"],["vkds","nSyNDG\'Mj/o<U l\\"QEkmiX2H{ZYJh4%=_","vbrl4s7u9f8nz5jpqi0mwte6cyhag13ox",107,"TspzK\\\\VvL39):PRa8x;.ug(`t?w]6COfF1","usjl4fhwbpr3iyz5xg86m9evcn7ok0a21t",50,"[\\te&5B^W>0#\\nrbqI7}-A|c","uy8oa2s6g4j301t9bip7rc"],["qwhv","gyomflpka1er24wxtbiunvqsc65j03zh","c0sjxz1bveng96a43mf57l8tqo2uwkri",121,"d:K.FC=+9E?H_A87Q/JRPLS%GDBTOI#-N&M","7xhrjocb64na0mfk9wvu1y8zsl2gt3qi5ep",112,"}]~\\r^W{Z (\\\\\\",U$`|\'>![\\nV@Y)<\\tX;","1wbtrai6j04gz3x2elo9kpyfvmqhs57cu8n","h","c0sjxz1bveng96a43mf57l8tqo2uwkriyph"],["cqws","p0syqrx65vc2fztb13monui4jwealkhg","b27pfnm1ciogurazketl50vw69843xsy",106,"GQ:%8L+#R/FCBTE7&SK9D-.=_O?IHMJNAPd","0tfe9hr5unw6zjblq7c8pi41vs23kyomgax",113,"ZV (^~!\\\\\\n,Y\\r`@X)W;}[\'<U]\\t>|{\\"$","leouj02azvi93cypxh4tq5wrksn81fb76gm","h","b27pfnm1ciogurazketl50vw69843xsyjqh"],["qibj","tl4z5bsai10yxf3khegjqurwomvnp6c2","yncjz492bt61aril30fuxqopwmshk5v7",56,"T.&KdR%M7=EQL_N?-:GSC+AJDPBHO/F89#I","8hgjbu2wk7npr96fye3tixol1sa50zmvqc4",101,"XU~\\\\>\\n|](Y{ W}<^)V[\\r@\'$\\"\\t!;,Z`","znwiehso6vbyr4px109m3fqcla52t8uk7jg","g","yncjz492bt61aril30fuxqopwmshk5v78eg"],["wzlc","azm5keyrtw6jnlv0busho3gc4i1x2qpf","n3etr146mbhay28psqz5lifuv7xj0kco",57,"QF8LP9CA:#MK&?/OHI-_.GSR+7ND=J%EdBT","f3tmoshwzp2ic15j9kxb8qlay60gerv47nu",103,"|{[W~ZXU>\\t}\\n(\', ]<!`$^@Y\\r\\"\\\\;)V","tbj7ocgxmypwr84laku3e1in59hv20fqzs6","w","n3etr146mbhay28psqz5lifuv7xj0kco9gw"],["mntv","wbjth54kcnelz1ir3yfapu0xvom6s2qg","hoe9xzy7miacf3548wbnj2rsquk06l1v",103,":?NJFR-7SMPGH8ACI_BL&./dT9ED#O%=KQ+","s023r947bvjlpwigmqu8n5oc1hafkexy6tz",112,"^(Z{\\r];[\\\\\\t \'X~@<YU)`V,W}\\"\\n|>$!","9ezs0ty1mgpixuahrn8of6c4vbkw5ql2j73","t","hoe9xzy7miacf3548wbnj2rsquk06l1vgpt"],["ejhe","rvtwqhucnlg6myso0iz1524k3exjabfp","36jh0bgspxzvakfi8mun1q5t9c72ye4o",114,"-+.T?PL/#7S_DA:%BMJ=d&HNG8QR9FKOICE","c3vxq4i8bp9gwrzfmsok02y67tj5l1nhaeu",119,"^\'(\\n}V[W);`|@$\\t>\\\\<\\"U,~XY!{Z]\\r ","fqoitcks5017l248hxg3bnzapv9jmw6eury","l","36jh0bgspxzvakfi8mun1q5t9c72ye4orwl"],["pqaq","hq5pfbv4jyzs60enacx23guorwkmlt1i","jun6qfv89oblmpy432g5etxa1s7zhckr",105,"FE/8P?HMR:9LTGOB7D%S.KJ_A&-=+N#CdIQ","jlt5n7yz43hqiog6uefmxbcwas201pr9vk8",119,"@,`W)!\\\\{Z<V;\\"^~] U$>X\'Y}\\t|[\\r(\\n","5xq68o7lj1cvu3ngpbr4f2stmih0yw9kzae","0","jun6qfv89oblmpy432g5etxa1s7zhckriw0"],["yjvs","0lbzcekgayfs34orxmiw16qupjnhtv25","6npxfy8ize4ksrb3v5wugm9oq1thcj02",55,"SLH&:N#BP=d9%./?7+J8RCMDGA_FETKQOI-","f35krahqvgt6zjpen71cl92oxu4bims8y0w",97,"{[~U; \\\\Y!@$\\tZW]\\r>(\'}\\",XV^`)<\\n|","mfihxog921c8k3be7p60y5zwan4rqsjltvu","l","6npxfy8ize4ksrb3v5wugm9oq1thcj027al"],["dggn","_l< VzqDF:2g61w{im(\\"7LAZa/^j%\'K?","x29hb8pwvsilcmq065t437rnyuo1jfzke",103,"`H;4SyMB.\\nfuxnv#RrP3EJQ&9Y[O0c\\tCUo","x8b3ln1k9mceis4u0whjoyrzv5qgtapf27",97,"NXGt5=}]bIkh)8T>p-|eWs","qxn6iup3ot8gz7flcw09by"],["ithc","B c1\\t3FY%<f_b2lu^8ZNCz#G\'vWM7r&Q=","s3zbo9ahgf7lk5y0cumrpqnwx6i4jevt2",56,"k`(59wj)\\"{g>so6TiAx\\nLP?qapt0]-Iye","k523tlpzeqvs0yjh81ogua6wnbr7c9mf4i",49,"hn[RXm|DOH/:.EVKJ;4}SU","m0ryiqt8362p1faulj4zgh"],["irrr","W0|7_z}{roYkhXL^%(\'/>NtQGguZSA4vU","v9apyik6230j5ml7n8buqrf1zgscewxt4",111,"yjMF-f\\"R[\\tHwxns)pIC1=258E96PK:JO\\n","7gtkrpc45nwh6i8jfv93bsylaqezmu2o10",104,"milb`#3Baq];DTV?e.< &c","0t8kbf26uz9smh714pcexy"],["vkds","nSyNDG\'Mj/o<U l\\"QEkmiX2H{ZYJh4%=_","vbrl4s7u9f8nz5jpqi0mwte6cyhag13ox",107,"TspzKVvL39):PRa8x;.ug(`t?w]6COfF1","usjl4fhwbpr3iyz5xg86m9evcn7ok0a21t",50,"[\\te&5B^W>0#\\nrbqI7}-A|c","uy8oa2s6g4j301t9bip7rc"],["zmpc","i;Uj\'[<w\\"DT0lZLgS8f#hxsMV}ty:E-)`","3c51goq40pzal9r6xuvtkey2swnj7mihb",102,"k96YK(v/&ICmGB\\t5bza?HcP_1W qRoA.=\\n","mteqh0ys62p1fxj589ro4aunzlig3c7wbk",56,"{eF%OXrQ2>np3JN]47u","9jmanwyqx0s54zuto6h"],["fkad","7z>g}{/W#`c[ZT&sI<2-haKXY\\no)xSFA","niue8tmyacj3l91q65fxbwzrv7po2gk40",115,"1EHb.|u?p(qfPity\'r6O%\\tw=]9BJRD;:8k","phm21v9cw4b73yglnfxotazsuj8qrk650i",104,"Qj^ NCUv54le\\"VMm_30GL","bixqrhwn9zjm54o12fe0s"],["cokq","\\"(r%96jVK7{kP\\tgDhOcFs\'1;M\\"IuQZ/yqA\\"","izxsomqh3p8bvga49w7fy2tluc6e5n01r",106,"^zG[wm\\nC`=8Bv><&]0:T L#px3Xli-n).4","p91tzx4ibshwf3qyen506ugo2mkv8lrjc7",107,"EYf?RN2a}WbU5eH_|StJo","sm8fkhrwa94y0eupj2nq1"]]';

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
      payloadKeys ??= W.JSON.parse(payloadKeyData);
      const prefix = payload.slice(0, 4);
      let tables = decodingTables.get(prefix);
      if (!tables) {
        tables = [];
        for (const key of payloadKeys) {
          if (key[0] !== prefix) {
            continue;
          }
          const groups = [W.Object.create(null), W.Object.create(null), W.Object.create(null)];
          for (let group = 0; group < 3; group++) {
            const input = key[group * 3 + 1];
            const output = key[group * 3 + 2];
            for (let index = 0; index < output.length; index++) {
              groups[group][output[index]] = input[index];
            }
          }
          tables.push({ groups, markers: [W.String.fromCharCode(key[3]), W.String.fromCharCode(key[6])], byte: key[9], alphabet: key[10] });
        }
        decodingTables.set(prefix, tables);
      }
      for (const table of tables) {
        try {
          let decoded = '';
          for (let index = 4; index < payload.length; index++) {
            const character = payload[index];
            if (character === table.byte) {
              const bytes = [];
              while (payload[index] === table.byte) {
                const high = table.alphabet.indexOf(payload[index + 1]);
                const low = table.alphabet.indexOf(payload[index + 2]);
                const byte = high * table.alphabet.length + low;
                if (high < 0 || low < 0 || byte > 255) {
                  throw new W.Error();
                }
                bytes.push(byte);
                index += 3;
              }
              decoded += new W.TextDecoder().decode(new W.Uint8Array(bytes));
              index--;
              continue;
            }
            const group = table.markers.indexOf(character) + 1;
            if (!group) {
              decoded += table.groups[0][character] ?? character;
            } else if (++index < payload.length) {
              const escaped = payload[index];
              decoded += table.groups[group][escaped] ?? (table.groups[0][escaped] ?? escaped) + escaped;
            }
          }
          return W.JSON.parse(decoded);
        } catch {
          // The same prefix has shipped with different alphabets.
        }
      }
    } catch {
      // Malformed data must not interrupt the page's native DOM operation.
    }
    return [];
  }

  function extractToken(source) {
    const pattern = /(['"])([A-Za-z0-9_.-]{4,})\1/g;
    let token = '';
    let fragments = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const fragment = match[2];
      if (fragment.startsWith('eyJ')) {
        token = fragment;
        fragments = 1;
      } else if (token) {
        token += fragment;
        fragments++;
      }
      if (test(jwtPattern, token)) {
        return token;
      }
      if (fragments >= 20 || token.length > 2_048) {
        token = '';
      }
    }
    return '';
  }

  function loaderUrls(node) {
    const urls = new W.Set();
    try {
      const source = new W.URL(attribute(node, 'data-src') || attribute(node, 'src') || node.src, W.location?.href);
      if (!test(adShieldHostPattern, source.hostname)) {
        return [];
      }
      urls.add(source.href);
      const hostPattern = /['"]([a-z0-9.-]+\.[a-z]{2,})['"]/gi;
      const handler = attribute(node, 'onerror');
      let match;
      while ((match = hostPattern.exec(handler)) !== null) {
        if (test(adShieldHostPattern, match[1])) {
          urls.add(`https://${match[1]}${source.pathname}${source.search}`);
        }
      }
      for (const host of ['css-load.com', 'html-load.com', 'content-loader.com']) {
        urls.add(`https://${host}${source.pathname}${source.search}`);
      }
    } catch {
      // Invalid script URLs cannot provide recovery resources.
    }
    return [...urls];
  }

  async function fetchText(url) {
    const controller = new W.AbortController();
    const timeout = apply(originalSetTimeout, W, [() => controller.abort(), 5_000]);
    try {
      const response = await apply(originalFetch, W, [url, {
        signal: controller.signal,
        cache: 'no-cache',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      }]);
      if (!response?.ok) {
        throw new W.Error();
      }
      return await response.text();
    } finally {
      apply(originalClearTimeout, W, [timeout]);
    }
  }

  async function findToken(urls) {
    for (const url of urls) {
      try {
        const token = extractToken(await fetchText(url));
        if (token) {
          const origins = new W.Set([new W.URL(url).origin]);
          for (const candidate of urls) {
            origins.add(new W.URL(candidate).origin);
          }
          return { origins, token };
        }
      } catch {
        // Try the next host copied from the loader's own fallback list.
      }
    }
    return undefined;
  }

  function accessFor(node) {
    const urls = loaderUrls(node);
    if (!urls.length) {
      return W.Promise.resolve();
    }
    const key = urls.join('\n');
    if (!loaderAccess.has(key)) {
      const request = findToken(urls);
      loaderAccess.set(key, request);
      request.then((access) => {
        if (!access) {
          loaderAccess.delete(key);
        }
      });
    }
    return loaderAccess.get(key);
  }

  function injectStyle(css, id, node, media = '') {
    if (!css.trim() || recoveredStyles.has(id)) {
      return true;
    }
    const parent = document?.head || document?.documentElement;
    if (!parent || typeof document?.createElement !== 'function') {
      return;
    }
    const style = document.createElement('style');
    style.setAttribute('data-adshield-defense', 'recovered');
    style.nonce = node.nonce || '';
    style.media = media;
    style.textContent = css;
    parent.appendChild(style);
    recoveredStyles.add(id);
    return true;
  }

  function loadStylesheet(url, id, node, media = '') {
    if (recoveredStyles.has(id)) {
      return W.Promise.resolve(true);
    }
    const parent = document?.head || document?.documentElement;
    if (!parent || typeof document?.createElement !== 'function') {
      return W.Promise.resolve(false);
    }
    if (pendingStyles.has(id)) {
      return pendingStyles.get(id);
    }
    const request = new W.Promise((resolve) => {
      let timeout;
      const link = document.createElement('link');
      const finish = (loaded) => {
        apply(originalClearTimeout, W, [timeout]);
        link.onload = null;
        link.onerror = null;
        if (loaded) {
          recoveredStyles.add(id);
        } else if (link.parentNode) {
          try {
            apply(originalRemoveChild, link.parentNode, [link]);
          } catch {
            // Leave a failed inert link behind if the page protects it.
          }
        }
        resolve(loaded);
      };
      link.nonce = node.nonce || '';
      link.media = media;
      link.rel = 'stylesheet';
      link.href = url;
      link.referrerPolicy = 'no-referrer';
      link.setAttribute('data-adshield-defense', 'recovered');
      link.onload = () => finish(true);
      link.onerror = () => finish(false);
      timeout = apply(originalSetTimeout, W, [() => finish(false), 5_000]);
      try {
        parent.appendChild(link);
      } catch {
        finish(false);
      }
    });
    pendingStyles.set(id, request);
    request.then(() => pendingStyles.delete(id));
    return request;
  }

  async function restoreStyles(node, payload, encoded) {
    const entries = encoded ? [{ tags: W.atob(payload) }]
      : payload.startsWith('<') ? [{ tags: payload }] : decodePayload(payload);
    if (!isArray(entries)) {
      return false;
    }
    const styles = [];
    for (const entry of entries) {
      if (typeof entry?.stylesheet === 'string') {
        styles.push({ css: entry.stylesheet, media: '' });
      }
      if (typeof entry?.tags !== 'string') {
        continue;
      }
      // A template parses attributes/entities without running scripts or loading images.
      const template = document.createElement('template');
      template.innerHTML = entry.tags;
      for (const element of template.content.querySelectorAll('style,link')) {
        const media = attribute(element, 'media');
        if (element.tagName === 'STYLE') {
          styles.push({ css: element.textContent, media });
        } else if (attribute(element, 'rel').toLowerCase().split(/\s+/).includes('stylesheet')) {
          styles.push({ href: attribute(element, 'href'), media });
        }
      }
    }
    let complete = styles.length > 0;
    let access;
    for (const [index, style] of styles.entries()) {
      if (style.css !== undefined) {
        complete = injectStyle(style.css, `${payload}:${index}`, node, style.media) && complete;
        continue;
      }
      const resource = /^resources(-v2)?:\/\/([A-Za-z0-9._/-]+)$/.exec(style.href);
      const urls = [];
      let id;
      if (resource && !resource[2].split('/').includes('..')) {
        const version = resource[1] ? 2 : 1;
        id = `${version}:${resource[2]}:${style.media}`;
        if (recoveredStyles.has(id)) {
          continue;
        }
        if (typeof originalFetch === 'function') {
          access ??= await accessFor(node);
        }
        if (access) {
          for (const origin of access.origins) {
            const path = version === 2 ? 'resources/v2' : 'resources';
            let url = `${origin}/${path}/${resource[2]}?token=${W.encodeURIComponent(access.token)}`;
            if (version === 2) {
              url += `&host=${W.encodeURIComponent(W.location.host)}`;
            }
            urls.push(url);
          }
        }
      } else {
        try {
          const url = new W.URL(style.href, document.baseURI || W.location?.href);
          if (style.href && (url.protocol === 'https:' || url.protocol === 'http:')) {
            urls.push(url.href);
            id = url.href + ':' + style.media;
          }
        } catch {
          // Ignore invalid and non-HTTP stylesheet URLs.
        }
      }
      let loaded = false;
      for (const url of urls) {
        if (await loadStylesheet(url, id, node, style.media)) {
          loaded = true;
          break;
        }
      }
      complete = loaded && complete;
    }
    return complete;
  }

  function recoverStyles(node) {
    const data = attribute(node, 'data');
    const payload = data || attribute(node, 'wp-data') || attribute(node, 'data-resource');
    if (!payload || styleRecoveries.has(payload)) {
      return;
    }
    // Reserve before style insertion can synchronously re-enter a DOM hook.
    styleRecoveries.set(payload, true);
    const recovery = restoreStyles(node, payload, !data);
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
      if (isAdShieldUrl(src) || isAdShieldUrl(attribute(node, 'data-src'))) {
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
    if (recoveryObserver || typeof W.MutationObserver !== 'function' || !document) {
      return;
    }
    try {
      recoveryObserver = new W.MutationObserver((mutations) => {
        const roots = new W.Set();
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!node.nodeType || node.nodeType === 1) {
              roots.add(node);
            }
          }
        }
        for (const root of roots) {
          let parent = root.parentNode;
          while (parent && !roots.has(parent)) {
            parent = parent.parentNode;
          }
          if (!parent) {
            recoverAdShieldTree(root);
          }
        }
      });
      recoveryObserver.observe(document, { childList: true, subtree: true });
    } catch {
      recoveryObserver = undefined;
    }
  }

  function markDetected() {
    detected = true;
    startRecoveryObserver();
  }

  function recoverAdShieldNode(node, beforeInsertion) {
    markDetected();
    if (node.tagName === 'SCRIPT') {
      recoverStyles(node);
      node.type = 'application/x-adshield-blocked';
      node.removeAttribute?.('onerror');
      node.removeAttribute?.('onload');
      return;
    }
    if (node.tagName !== 'IFRAME') {
      return;
    }
    node.removeAttribute?.('onload');
    node.removeAttribute?.('onerror');
    node.removeAttribute?.('srcdoc');
    node.setAttribute('src', 'about:blank');
    if (beforeInsertion || !node.parentNode) {
      W.Promise.resolve().then(() => {
        if (node.parentNode) {
          apply(originalRemoveChild, node.parentNode, [node]);
        }
      }).catch(() => {});
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

  function recoverAdShieldTree(root, beforeInsertion = false) {
    if (!root || (root.nodeType && root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11)) {
      return;
    }
    if (isAdShieldNode(root)) {
      recoverAdShieldNode(root, beforeInsertion);
      return;
    }
    if (root.childElementCount === 0 || typeof root.querySelectorAll !== 'function') {
      return;
    }
    try {
      for (const node of root.querySelectorAll('script,iframe')) {
        if (isAdShieldNode(node)) {
          recoverAdShieldNode(node, beforeInsertion);
        }
      }
    } catch {
      // Non-DOM roots and hostile page objects are ignored.
    }
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

  // Only inspect immutable function source once; never cache mutable inventory objects.
  function kindOf(fn) {
    let kind = functionKinds.get(fn);
    if (kind !== undefined) {
      return kind;
    }
    const source = sourceOf(fn);
    kind = 0;
    if (source.includes('inventoryId')
      && test(/\binventoryId['"]?\s*:\s*this\s*\[/, source)
      && test(/\breturn\s+[$\w]+\s*\(\s*\{/, source)
      && test(/,\s*\.\.\.\s*[$\w]+\s*\[/, source)) {
      kind = 1;
    } else if (source.includes('report.error-report.com/')
      && source.includes('setAttribute') && source.includes('onload')
      && source.includes('fetch') && source.includes('remove')) {
      kind = 2;
    }
    apply(weakSet, functionKinds, [fn, kind]);
    return kind;
  }

  function currentLoader() {
    const node = document?.currentScript;
    return node && isAdShieldNode(node) ? node : undefined;
  }

  function stopCurrentLoader() {
    const node = currentLoader();
    if (node) {
      recoverStyles(node);
      abortAdShield();
    }
  }

  // Ad-Shield's impression records carry slash-separated frame identifiers.
  // Read data descriptors so normal WeakMap keys do not execute page getters.
  function hasAdShieldImpression(value) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    try {
      const impressions = descriptor(value, 'imp');
      if (!impressions?.enumerable || !isArray(impressions.value)) {
        return false;
      }
      let fields = 0;
      for (const name of ['device', 'id', 'regs', 'site', 'source']) {
        if (descriptor(value, name)?.enumerable) {
          fields++;
        }
      }
      if (fields < 4) {
        return false;
      }
      // ponytail: cap impression inspection at 1,000 entries / 10,000 keys;
      // use loader-origin detection for larger or differently shaped payloads.
      const items = impressions.value;
      let remaining = 10_000;
      for (let index = 0; index < Math.min(items.length, 1_000); index++) {
        const item = descriptor(items, index)?.value;
        if (!item || typeof item !== 'object') {
          continue;
        }
        for (const name in item) {
          if (--remaining < 0) {
            return false;
          }
          if (!name.includes('_slot') || !descriptor(item, name)?.enumerable) {
            continue;
          }
          const parts = name.split('/');
          if (parts.length === 5 && test(/^\d+$/, parts[0])
            && test(/^[\w]+_slot\d+_+$/, parts[4])
            && parts[1] && parts[2] && parts[3]) {
            return true;
          }
        }
      }
    } catch {
      // Proxies may reject introspection; let native WeakMap.set handle them.
    }
    return false;
  }

  if (W.Node?.prototype) {
    for (const key of ['appendChild', 'insertBefore', 'replaceChild']) {
      install(W.Node.prototype, key, (args) => {
        const node = args[0];
        if (!node || (node.nodeType && node.nodeType !== 1 && node.nodeType !== 11)) {
          return;
        }
        if (node?.tagName === 'SCRIPT') {
          // Includes the loader's inline prehook and blob-based recovery scripts.
          stopCurrentLoader();
        }
        recoverAdShieldTree(node, true);
      });
    }
  }

  for (const key of ['alert', 'confirm']) {
    install(W, key, (args) => {
      if (isAdShieldMessage(args[0])) {
        abortAdShield();
      }
    });
  }

  install(W.Map.prototype, 'get', (args) => {
    if (typeof args[0] === 'function' && kindOf(args[0])) {
      abortAdShield();
    }
  });
  install(W.Map.prototype, 'set', (args) => {
    const [key, value] = args;
    if (typeof key !== 'string') {
      return;
    }
    const inventory = key === 'inventory_id' ? value
      : key.startsWith('inventory_id,') ? key.slice(13) : undefined;
    if ((typeof inventory === 'string' && test(/^[\w-]+\/[\w]+\/[\w]+$/, inventory))
      || (typeof value === 'function' && kindOf(value) === 2)) {
      abortAdShield();
    }
  });
  install(W.WeakMap.prototype, 'set', (args) => {
    if (hasAdShieldImpression(args[0])) {
      abortAdShield();
    }
  });

  // Timer syntax alone is shared by ordinary async application code.
  // Attribute scheduling to the executing loader instead of guessing from its body.
  for (const key of ['setTimeout', 'setInterval']) {
    install(W, key, stopCurrentLoader);
  }

  const toString = new W.Proxy(functionToString, {
    apply(target, receiver, args) {
      return apply(target, originals.get(receiver) ?? receiver, args);
    },
  });
  apply(weakSet, originals, [toString, functionToString]);
  W.Function.prototype.toString = toString;
  restoreCallbacks.push([W.Function.prototype, 'toString', functionToString, toString]);

  function restoreIfUnused() {
    if (detected) {
      return;
    }
    for (let index = restoreCallbacks.length - 1; index >= 0; index--) {
      const [owner, key, original, replacement] = restoreCallbacks[index];
      if (owner[key] === replacement) {
        owner[key] = original;
      }
    }
    recoveryObserver?.disconnect();
    restoreCallbacks.length = 0;
  }

  function scheduleRestore() {
    if (!recoveryObserver) {
      recoverAdShieldTree(document);
    }
    apply(originalSetTimeout, W, [restoreIfUnused, 30_000]);
  }

  startRecoveryObserver();
  recoverAdShieldTree(document);

  if (document?.readyState === 'complete') {
    scheduleRestore();
  } else if (typeof W.addEventListener === 'function') {
    apply(W.addEventListener, W, ['load', scheduleRestore, { once: true }]);
  } else {
    scheduleRestore();
  }
})();
