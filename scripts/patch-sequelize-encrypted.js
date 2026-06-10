/**
 * Patches sequelize-encrypted to work with Node.js 22+.
 *
 * Two bugs in sequelize-encrypted@1.x:
 *   1. Uses deprecated `new Buffer()` constructor (removed in Node.js 22+).
 *   2. Uses streaming cipher API (cipher.end + cipher.read) which may return
 *      an empty buffer in Node.js 22+ because the readable side isn't consumed
 *      before read() is called, leaving only the IV stored and causing
 *      ERR_OSSL_BAD_DECRYPT on every subsequent decrypt.
 */

const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "..",
  "node_modules",
  "sequelize-encrypted",
  "index.js"
);

if (!fs.existsSync(file)) {
  console.log("sequelize-encrypted not found, skipping patch");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = 0;

// Fix 1: new Buffer(key, 'hex') → Buffer.from(key, 'hex')
if (src.includes("new Buffer(key, 'hex')")) {
  src = src.replace(/new Buffer\(key, 'hex'\)/g, "Buffer.from(key, 'hex')");
  changed++;
}

// Fix 2: new Buffer(previous) → Buffer.from(previous)
if (src.includes("new Buffer(previous)")) {
  src = src.replace(/new Buffer\(previous\)/g, "Buffer.from(previous)");
  changed++;
}

// Fix 3: streaming cipher API → explicit update/final
const OLD_CIPHER =
  "cipher.end(JSON.stringify(value), 'utf-8');\n" +
  "            var enc_final = Buffer.concat([new_iv, cipher.read()]);";
const NEW_CIPHER =
  "var __enc = Buffer.concat([\n" +
  "                cipher.update(Buffer.from(JSON.stringify(value), 'utf-8')),\n" +
  "                cipher.final()\n" +
  "            ]);\n" +
  "            var enc_final = Buffer.concat([new_iv, __enc]);";

if (src.includes(OLD_CIPHER)) {
  src = src.replace(OLD_CIPHER, NEW_CIPHER);
  changed++;
}

if (changed > 0) {
  fs.writeFileSync(file, src, "utf8");
  console.log(`sequelize-encrypted patched OK (${changed} fix(es) applied)`);
} else {
  console.log("sequelize-encrypted: already patched or pattern not found");
}
