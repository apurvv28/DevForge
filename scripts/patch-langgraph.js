#!/usr/bin/env node
// Patches all @langchain/langgraph* CJS files that do require("uuid"),
// replacing them with Node built-in crypto equivalents.
// uuid@14 is ESM-only and cannot be require()'d from CJS.
'use strict';

const fs = require('fs');
const path = require('path');

// Inline replacement for the uuid module — covers v4, v5, v6, validate
const UUID_SHIM = `const _crypto = require("crypto");
const _uuid = {
  v4: () => _crypto.randomUUID(),
  v6: (() => {
    let lastMsecs = 0, lastNsecs = 0;
    function _b2u(b) {
      return [b[0],b[1],b[2],b[3],'-',b[4],b[5],'-',b[6],b[7],'-',b[8],b[9],'-',b[10],b[11],b[12],b[13],b[14],b[15]]
        .map((v) => typeof v === 'string' ? v : v.toString(16).padStart(2,'0')).join('');
    }
    return function(opts) {
      let msecs = (opts && opts.msecs !== undefined) ? opts.msecs : Date.now();
      if (msecs <= lastMsecs) { lastNsecs++; if (lastNsecs >= 1e4) { lastNsecs = 0; msecs = lastMsecs + 1; } } else lastNsecs = 0;
      lastMsecs = msecs;
      const b = _crypto.randomBytes(16);
      const msf = BigInt(msecs) + 122192928000000000n;
      const nsf = msf * 10000n + BigInt(lastNsecs);
      b[0]=Number((nsf>>52n)&0xffn); b[1]=Number((nsf>>44n)&0xffn); b[2]=Number((nsf>>36n)&0xffn); b[3]=Number((nsf>>28n)&0xffn);
      b[4]=Number((nsf>>20n)&0xffn); b[5]=Number((nsf>>12n)&0xffn); b[6]=(Number((nsf>>8n)&0x0fn))|0x60; b[7]=Number(nsf&0xffn);
      const cs = opts && opts.clockseq !== undefined ? opts.clockseq : undefined;
      if (cs !== undefined) { b[8]=(cs>>8)&0x3f|0x80; b[9]=cs&0xff; } else b[8]=(b[8]&0x3f)|0x80;
      return _b2u(b);
    };
  })(),
  v5: (name, namespace) => {
    const ns = namespace.replace(/-/g,'').match(/.{2}/g).map((x)=>parseInt(x,16));
    const h = _crypto.createHash('sha1').update(Buffer.from(ns)).update(name).digest();
    h[6]=(h[6]&0x0f)|0x50; h[8]=(h[8]&0x3f)|0x80;
    return [h[0],h[1],h[2],h[3],'-',h[4],h[5],'-',h[6],h[7],'-',h[8],h[9],'-',h[10],h[11],h[12],h[13],h[14],h[15]]
      .map((v)=>typeof v==='string'?v:v.toString(16).padStart(2,'0')).join('');
  },
  validate: (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str),
};`;

const TARGETS = [
  '@langchain/langgraph-checkpoint/dist/id.cjs',
  '@langchain/langgraph/dist/graph/graph.cjs',
  '@langchain/langgraph/dist/graph/messages_reducer.cjs',
];

let patched = 0;
for (const rel of TARGETS) {
  const target = path.resolve(__dirname, '../node_modules', rel);
  if (!fs.existsSync(target)) {
    console.log(`[patch-langgraph] Not found, skipping: ${rel}`);
    continue;
  }
  const src = fs.readFileSync(target, 'utf8');
  if (!src.includes('require("uuid")')) {
    console.log(`[patch-langgraph] Already patched: ${rel}`);
    continue;
  }
  const fixed = src.replace('let uuid = require("uuid");', `${UUID_SHIM}\nlet uuid = _uuid;`);
  fs.writeFileSync(target, fixed, 'utf8');
  console.log(`[patch-langgraph] Patched: ${rel}`);
  patched++;
}

if (patched > 0) console.log(`[patch-langgraph] Done. Patched ${patched} file(s).`);
