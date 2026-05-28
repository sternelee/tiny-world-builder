  // -------- prelude (hoisted pure utils) --------
  // Relocated here from module 28 so they are defined before any later
  // module's top-level code runs. The god-file split turned one shared
  // <script> (where function declarations hoisted across the whole block)
  // into ordered <script src> units; these pure PRNG helpers are used by
  // module 04's load-time texture generation, so they must load first.
  // Mulberry32 — deterministic PRNG seeded from a string.
  function seedHash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function makeMulberry32(seedStr) {
    let a = seedHash(String(seedStr || ''));
    return function() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
