"use strict";
// Local replacement for the deprecated `punycode` npm module (DEP0040).
// The only in-bundle consumer is `tr46` (via whatwg-url -> node-fetch@2 -> telegraf),
// which calls `punycode.toASCII()` / `punycode.toUnicode()` on IDN domain labels.
// Both are reimplemented with Node's built-in `node:url` domain functions
// (Web/WHATWG URL API) so the `punycode` package never gets bundled.
// Wired via esbuild alias in `npm run build:server`.

const { domainToASCII, domainToUnicode } = require("node:url");

function toString(value) {
  return value == null ? "" : String(value);
}

module.exports = {
  version: "2.3.1",
  toASCII(input) {
    const s = toString(input);
    if (!s) return s;
    const out = domainToASCII(s);
    return out || s;
  },
  toUnicode(input) {
    const s = toString(input);
    if (!s) return s;
    const out = domainToUnicode(s);
    return out || s;
  },
  ucs2: {
    decode(s) {
      return Array.from(toString(s), (c) => c.codePointAt(0));
    },
    encode(codePoints) {
      return String.fromCodePoint(...codePoints);
    }
  }
};
