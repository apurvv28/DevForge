#!/usr/bin/env node
// Patches @langchain/langgraph-checkpoint/dist/id.cjs to replace the broken
// require("uuid") call (uuid@14 is ESM-only) with Node built-in crypto.
'use strict';

const fs = require('fs');
const path = require('path');

const target = path.resolve(
  __dirname,
  '../node_modules/@langchain/langgraph-checkpoint/dist/id.cjs',
);

if (!fs.existsSync(target)) {
  console.log('[patch-langgraph] id.cjs not found, skipping.');
  process.exit(0);
}

const original = fs.readFileSync(target, 'utf8');

if (!original.includes('require("uuid")')) {
  console.log('[patch-langgraph] Already patched, skipping.');
  process.exit(0);
}

const patched = `const _crypto = require("crypto");
//#region src/id.ts
let lastMsecs = 0;
let lastNsecs = 0;
function _bytesToUuid(b) {
\treturn [b[0],b[1],b[2],b[3],'-',b[4],b[5],'-',b[6],b[7],'-',b[8],b[9],'-',b[10],b[11],b[12],b[13],b[14],b[15]]
\t\t.map((v) => typeof v === 'string' ? v : v.toString(16).padStart(2, '0')).join('');
}
function uuid6(clockseq) {
\tlet msecs = Date.now();
\tif (msecs <= lastMsecs) {
\t\tlastNsecs += 1;
\t\tif (lastNsecs >= 1e4) { lastNsecs = 0; msecs = lastMsecs + 1; }
\t} else lastNsecs = 0;
\tlastMsecs = msecs;
\tconst b = _crypto.randomBytes(16);
\tconst msecsFull = BigInt(msecs) + 122192928000000000n;
\tconst nsecsFull = msecsFull * 10000n + BigInt(lastNsecs);
\tb[0] = Number((nsecsFull >> 52n) & 0xffn);
\tb[1] = Number((nsecsFull >> 44n) & 0xffn);
\tb[2] = Number((nsecsFull >> 36n) & 0xffn);
\tb[3] = Number((nsecsFull >> 28n) & 0xffn);
\tb[4] = Number((nsecsFull >> 20n) & 0xffn);
\tb[5] = Number((nsecsFull >> 12n) & 0xffn);
\tb[6] = (Number((nsecsFull >> 8n) & 0x0fn)) | 0x60;
\tb[7] = Number(nsecsFull & 0xffn);
\tif (clockseq !== undefined) { b[8] = (clockseq >> 8) & 0x3f | 0x80; b[9] = clockseq & 0xff; }
\telse b[8] = (b[8] & 0x3f) | 0x80;
\treturn _bytesToUuid(b);
}
function uuid5(name, namespace) {
\tconst nsBytes = namespace.replace(/-/g, "").match(/.{2}/g).map((byte) => parseInt(byte, 16));
\tconst hash = _crypto.createHash('sha1').update(Buffer.from(nsBytes)).update(name).digest();
\thash[6] = (hash[6] & 0x0f) | 0x50;
\thash[8] = (hash[8] & 0x3f) | 0x80;
\treturn _bytesToUuid(hash);
}
//#endregion
exports.uuid5 = uuid5;
exports.uuid6 = uuid6;

//# sourceMappingURL=id.cjs.map`;

fs.writeFileSync(target, patched, 'utf8');
console.log('[patch-langgraph] Patched @langchain/langgraph-checkpoint/dist/id.cjs');
