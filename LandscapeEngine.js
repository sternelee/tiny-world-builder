/**
 * Standalone Landscape Engine for Three.js
 * Generates procedural terraced canyons, biomes (desert/grassland/snow),
 * streaming chunk terrain, water, and flora. Supports realistic and low-poly modes.
 * Compatible with both global <script> tag inclusion and ES module bundlers.
 */

// Handle either global THREE or bundler-imported THREE
const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : null;

class LandscapeEngine {
  /**
   * @param {Object} config
   * @param {THREE.Scene} config.scene - Target Three.js Scene
   * @param {number} [config.seed=8472] - Random number seed for terrain/placement
   * @param {string} [config.initialBiome='grassland'] - 'grassland', 'desert', or 'snow'
   * @param {string} [config.styleMode='realistic'] - 'realistic' or 'lowpoly'
   * @param {THREE.Color} [config.fogColorOut] - Color object updated with current fog color
   */
  constructor({ scene, seed = 8472, initialBiome = 'grassland', styleMode = 'realistic', fogColorOut = null }) {
    if (!THREE) {
      throw new Error('LandscapeEngine: Three.js (THREE) must be loaded first.');
    }
    this.scene = scene;
    this.seed = seed;
    this.currentBiomeName = initialBiome;
    this.styleMode = styleMode; // 'realistic' or 'lowpoly'
    this.fogColorOut = fogColorOut;

    // Clip bounds (world-space AABB). When enabled, fragments outside
    // the box are discarded, producing clean flat faces at the boundary.
    this._clipEnabled = false;
    this._clipMin = new THREE.Vector3(-1e6, -1e6, -1e6);
    this._clipMax = new THREE.Vector3( 1e6,  1e6,  1e6);
    this._clipPlanes = [];

    // Grid Settings
    this.CHUNK_SIZE = 600;
    this.CHUNK_RES = 60;
    this.RENDER_RADIUS = 3; // 7x7 high-detail grid around target

    this.FAR_CHUNK_SIZE = 1800;
    this.FAR_CHUNK_RES = 90;
    this.FAR_RADIUS = 4; // 9x9 far LOD grid

    this.AIRFIELD_FLAT_RADIUS = 230;
    this.AIRFIELD_FLAT_R2 = this.AIRFIELD_FLAT_RADIUS * this.AIRFIELD_FLAT_RADIUS;
    this.AIRFIELD_SURFACE_Y = 0.08;

    this.WATER_LEVEL = 4.0;
    this.WATER_EXTENT = 24000;
    this.WATER_RUNWAY_R = 420;

    // Active collections
    this.chunks = new Map();
    this.farChunks = new Map();
    this.pendingChunkBuilds = [];
    this.pendingChunkKeys = new Set();
    this.pendingFarChunkBuilds = [];
    this.pendingFarChunkKeys = new Set();

    // Configuration constants
    this.SEED_OX = (this.seed * 17.31) % 1000;
    this.SEED_OY = (this.seed * 23.79) % 1000;

    // Biome Settings
    this.BIOMES = {
      desert: {
        strata: [
          { h: -10, c: 0x3a2218 }, { h:   6, c: 0x5a3220 },
          { h:  22, c: 0x8a4d2e }, { h:  42, c: 0xb16b40 },
          { h:  60, c: 0xc78854 }, { h:  92, c: 0xd49868 },
          { h: 130, c: 0xdfb486 }, { h: 180, c: 0xe2c79c },
          { h: 260, c: 0xdcc7a4 },
        ],
        cliffTint: 0x7a3c22,
        fogColor: 0xe8b888,
        skyTop: 0x4a7ca8, skyBottom: 0xffd4a0,
        groundTint: 0x6a4830, ambient: 0x2a2520,
        lowPolyAmbient: 0x3a3328,
        sunColor: 0xfff1d4,
        hasCactus: true, pineChance: 0.55, shrubChance: 0.85,
      },
      snow: {
        strata: [
          { h: -10, c: 0x2a2a30 }, { h:   6, c: 0x404050 },
          { h:  22, c: 0x5a5f6a }, { h:  42, c: 0x8088a0 },
          { h:  60, c: 0xb4c0cf }, { h:  92, c: 0xd4dde6 },
          { h: 130, c: 0xe8edf2 }, { h: 180, c: 0xf6f8fb },
          { h: 260, c: 0xffffff },
        ],
        cliffTint: 0x3a3a4a,
        fogColor: 0xbfd0e0,
        skyTop: 0x5a7ca8, skyBottom: 0xdae4ec,
        groundTint: 0x5a6878, ambient: 0x2a303a,
        lowPolyAmbient: 0x3a4250,
        sunColor: 0xf4f2ec,
        hasCactus: false, pineChance: 0.75, shrubChance: 0.25,
      },
      grassland: {
        strata: [
          { h: -10, c: 0x2a3818 }, { h:   6, c: 0x3e5e22 },
          { h:  22, c: 0x548030 }, { h:  42, c: 0x6a9040 },
          { h:  60, c: 0x7e9448 }, { h:  92, c: 0x8c9458 },
          { h: 130, c: 0x90886a }, { h: 180, c: 0xa09c88 },
          { h: 260, c: 0xb4b0a0 },
        ],
        cliffTint: 0x4a3820,
        fogColor: 0xc4d8c0,
        skyTop: 0x6090c0, skyBottom: 0xdee8c8,
        groundTint: 0x405030, ambient: 0x2a3820,
        lowPolyAmbient: 0x3a4828,
        sunColor: 0xfff4d0,
        hasCactus: false, pineChance: 0.7, shrubChance: 0.85,
      },
    };

    this.currentBiome = { ...this.BIOMES[this.currentBiomeName] };
    this.STRATA = this.currentBiome.strata.map(s => ({ h: s.h, c: new THREE.Color(s.c) }));
    this.CLIFF_TINT = new THREE.Color(this.currentBiome.cliffTint);

    // Sun direction vector
    this.sunDir = new THREE.Vector3(0.58, 0.76, 0.28).normalize();

    this._initSharedShaders();
    this._initSharedGeometries();
    this._initWater();
  }

  // --- Math Helpers ---
  _smoothstep(t) { return t * t * (3 - 2 * t); }
  _clamp01(t) { return Math.max(0, Math.min(1, t)); }
  _smoothstepRange(edge0, edge1, x) {
    const t = this._clamp01((x - edge0) / (edge1 - edge0));
    return this._smoothstep(t);
  }

  _hash2(x, y) {
    const s = Math.sin((x + this.SEED_OX) * 127.1 + (y + this.SEED_OY) * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  _srand(a, b, salt = 0) {
    const s = Math.sin(a * 12.9898 + b * 78.233 + salt * 37.719 + this.seed * 0.1417) * 43758.5453;
    return s - Math.floor(s);
  }

  _vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = this._smoothstep(fx), v = this._smoothstep(fy);
    const a = this._hash2(ix, iy);
    const b = this._hash2(ix + 1, iy);
    const c = this._hash2(ix, iy + 1);
    const d = this._hash2(ix + 1, iy + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) +
           c * (1 - u) * v + d * u * v;
  }

  _fbm(x, y, oct) {
    let v = 0, a = 1, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) {
      v += a * this._vnoise(x * f, y * f);
      tot += a;
      a *= 0.5; f *= 2;
    }
    return v / tot;
  }

  /**
   * Evaluates the absolute height of the canyon terrain at grid coordinates.
   * @param {number} x - X Coordinate
   * @param {number} z - Z Coordinate
   * @returns {number} Height
   */
  getHeight(x, z) {
    const runwayEllipse = Math.hypot(x * 1.45, z * 0.22);
    const runwayMask = this._smoothstepRange(220, 560, runwayEllipse);
    const corridorX = 1 - this._smoothstepRange(135, 360, Math.abs(x));
    const corridorZ = 1 - this._smoothstepRange(260, 1850, Math.abs(z));
    const approachCorridor = this._clamp01(corridorX * corridorZ);

    let h = 0, amp = 1, freq = 0.0018, tot = 0;
    for (let i = 0; i < 5; i++) {
      const n = this._vnoise(x * freq, z * freq);
      h += amp * (1 - Math.abs(n * 2 - 1)); // ridged
      tot += amp;
      amp *= 0.5; freq *= 2;
    }
    h = Math.pow(h / tot, 2.4) * 260;

    // Large-scale valleys
    h += (this._fbm(x * 0.0006, z * 0.0006, 3) - 0.4) * 120;
    h = Math.max(0, h);

    // Terracing mesas
    const step = 28;
    const t = h / step;
    const base = Math.floor(t);
    const frac = t - base;
    const tr = frac < 0.72 ? 0 : this._smoothstep((frac - 0.72) / 0.28);
    h = (base + tr) * step;

    // Carve runway corridor
    h *= Math.max(runwayMask, 1 - approachCorridor * 0.96);
    h = Math.max(0, h - approachCorridor * 22);

    // Airstrip basin details
    const basinRipple = (1 - runwayMask) * (this._fbm(x * 0.006, z * 0.006, 2) - 0.5) * 5.5;
    h = Math.max(0, h + basinRipple);

    // Airfield flatness exclusion
    const runwayPad = (1 - this._smoothstepRange(18, 42, Math.abs(x)))
      * (1 - this._smoothstepRange(215, 285, Math.abs(z)));
    const apronPad = (1 - this._smoothstepRange(8, 74, Math.abs(x - 34)))
      * (1 - this._smoothstepRange(92, 210, Math.abs(z - 150)));
    const taxiPad = (1 - this._smoothstepRange(6, 18, Math.abs(x - 17)))
      * (1 - this._smoothstepRange(62, 168, Math.abs(z - 116)));
    const airfieldPad = this._clamp01(Math.max(runwayPad, apronPad, taxiPad));
    h *= 1 - airfieldPad * 0.998;
    h = Math.max(0, h - airfieldPad * 3.5);

    return h;
  }

  _strataColor(h, out) {
    for (let i = 0; i < this.STRATA.length - 1; i++) {
      if (h <= this.STRATA[i + 1].h) {
        const t = (h - this.STRATA[i].h) / (this.STRATA[i + 1].h - this.STRATA[i].h);
        out.copy(this.STRATA[i].c).lerp(this.STRATA[i + 1].c, Math.max(0, Math.min(1, t)));
        return out;
      }
    }
    out.copy(this.STRATA[this.STRATA.length - 1].c);
    return out;
  }

  // --- Shaders Initialization ---
  _initSharedShaders() {
    this.SAND_VS = `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vColor = color;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `;

    this.SAND_FS = `
      precision highp float;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform vec3 ambientColor;
      uniform vec3 skyTint;
      uniform vec3 groundTint;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      uniform float hazeStrength;
      uniform float hazeExponent;
      uniform float clipEnabled;
      uniform vec3 clipMin;
      uniform vec3 clipMax;

      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        // Clip bounds discard
        if (clipEnabled > 0.5) {
          if (vWorldPos.x < clipMin.x || vWorldPos.x > clipMax.x ||
              vWorldPos.z < clipMin.z || vWorldPos.z > clipMax.z) discard;
        }

        vec3 N = normalize(vNormal);
        vec2 uv = vWorldPos.xz;
        float r1 = cos(uv.x * 0.55 + uv.y * 0.21);
        float r2 = cos(uv.y * 0.62 - uv.x * 0.27 + 1.7);
        float r3 = cos((uv.x + uv.y) * 0.13);
        float r4 = cos(uv.x * 1.8 + uv.y * 0.6) * 0.3;
        float r5 = cos(uv.y * 1.6 - uv.x * 1.2 + 0.5) * 0.3;
        vec3 rippleN = normalize(vec3(
          r1 * 0.06 + r3 * 0.02 + r4 * 0.025,
          1.0,
          r2 * 0.06 + r3 * 0.02 + r5 * 0.025
        ));

        float flatness = smoothstep(0.55, 0.92, N.y);
        vec3 perturbed = normalize(mix(N, normalize(N + (rippleN - vec3(0.0, 1.0, 0.0)) * 0.7), flatness));

        vec3 L = normalize(sunDir);
        float rawNdotL = dot(perturbed, L);
        float NdotL = max(rawNdotL, 0.0);
        float sunFacing = smoothstep(-0.18, 0.78, rawNdotL);

        float hemi = perturbed.y * 0.5 + 0.5;
        vec3 hemiCol = mix(groundTint, skyTint, hemi);

        vec3 diffuse = vColor * (NdotL * sunColor + hemiCol * 0.45 + ambientColor);

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 H = normalize(L + V);
        float NdotH = max(dot(perturbed, H), 0.0);
        float spec = pow(NdotH, 22.0) * 0.18 * flatness;
        float sparkleNoise = vnoise(uv * 55.0);
        float sparkleMask = smoothstep(0.79, 0.93, sparkleNoise) * pow(NdotH, 90.0) * flatness;
        vec3 sparkle = sunColor * sparkleMask * 5.0;

        float backLight = max(dot(-perturbed, L), 0.0);
        vec3 backScatter = vColor * sunColor * backLight * 0.07;

        float rim = 1.0 - max(dot(N, V), 0.0);
        rim = pow(rim, 2.5) * 0.15;
        vec3 rimCol = mix(vColor, fogColor, 0.6) * rim;

        vec3 color = diffuse + spec * sunColor + sparkle + backScatter + rimCol;
        color *= mix(vec3(0.72, 0.78, 0.88), vec3(1.03, 1.0, 0.97), sunFacing);

        float dist = length(vWorldPos - cameraPosition);
        float fogF = clamp((dist - fogNear) / (fogFar - fogNear), 0.0, 1.0);
        float horizon = pow(clamp(1.0 - abs(V.y), 0.0, 1.0), hazeExponent);
        float haze = clamp(fogF * (0.86 + horizon * hazeStrength), 0.0, 1.0);
        vec3 hazeColor = mix(fogColor, skyTint, 0.38 + horizon * 0.22);
        color = mix(color, hazeColor, haze);

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    this.LOWPOLY_FS = `
      precision highp float;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform vec3 ambientColor;
      uniform vec3 skyTint;
      uniform vec3 groundTint;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      uniform float hazeStrength;
      uniform float hazeExponent;
      uniform float clipEnabled;
      uniform vec3 clipMin;
      uniform vec3 clipMax;

      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        // Clip bounds discard
        if (clipEnabled > 0.5) {
          if (vWorldPos.x < clipMin.x || vWorldPos.x > clipMax.x ||
              vWorldPos.z < clipMin.z || vWorldPos.z > clipMax.z) discard;
        }

        vec3 dx = dFdx(vWorldPos);
        vec3 dy = dFdy(vWorldPos);
        vec3 N = normalize(cross(dx, dy));
        if (N.y < 0.0) N = -N;

        vec3 L = normalize(sunDir);
        float rawNdotL = dot(N, L);
        float NdotL = max(rawNdotL, 0.0);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 H = normalize(L + V);

        float band;
        if (NdotL > 0.72)       band = 1.00;
        else if (NdotL > 0.38)  band = 0.86;
        else if (NdotL > 0.02)  band = 0.74;
        else                    band = 0.62;

        vec3 c = vColor * 1.04;
        c = floor(c * 12.0) / 12.0;
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(lum), c, 1.08);

        float hemi = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 hemiCol = mix(groundTint, skyTint, hemi);
        float sunFacing = smoothstep(-0.18, 0.78, rawNdotL);
        float backLight = max(dot(-N, L), 0.0);
        float spec = pow(max(dot(N, H), 0.0), 18.0) * 0.08;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5) * 0.12;
        vec3 rimCol = mix(c, fogColor, 0.55) * rim;
        vec3 shadowCol = mix(groundTint, skyTint, 0.70 + hemi * 0.24);
        vec3 litCol = band * sunColor + hemiCol * 0.52 + ambientColor;
        vec3 shadeCol = shadowCol * (0.56 + hemi * 0.14) + ambientColor * 0.56;

        vec3 color = c * mix(shadeCol, litCol, smoothstep(-0.12, 0.34, rawNdotL));
        color += spec * sunColor;
        color += c * sunColor * backLight * 0.08;
        color += rimCol;
        color *= mix(vec3(0.84, 0.88, 0.95), vec3(1.04, 1.00, 0.96), sunFacing);

        float dist = length(vWorldPos - cameraPosition);
        float fogF = clamp((dist - fogNear) / (fogFar - fogNear), 0.0, 1.0);
        float horizon = pow(clamp(1.0 - abs(V.y), 0.0, 1.0), hazeExponent);
        float haze = clamp(fogF * (0.96 + horizon * (hazeStrength + 0.18)), 0.0, 1.0);
        vec3 hazeColor = mix(fogColor, skyTint, 0.66 + horizon * 0.16);
        color = mix(color, hazeColor, haze);

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    this.sandMat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir:        { value: this.sunDir.clone() },
        sunColor:      { value: new THREE.Color(this.currentBiome.sunColor) },
        ambientColor:  { value: new THREE.Color(this.currentBiome.ambient) },
        skyTint:       { value: new THREE.Color(this.currentBiome.skyTop) },
        groundTint:    { value: new THREE.Color(this.currentBiome.groundTint) },
        fogColor:      { value: new THREE.Color(this.currentBiome.fogColor) },
        fogNear:       { value: 360 },
        fogFar:        { value: 6200 },
        hazeStrength:  { value: 0.92 },
        hazeExponent:  { value: 1.55 },
        clipEnabled:   { value: 0.0 },
        clipMin:       { value: this._clipMin },
        clipMax:       { value: this._clipMax },
      },
      vertexShader: this.SAND_VS,
      fragmentShader: this.SAND_FS,
    });

    this.sandMatLowPoly = new THREE.ShaderMaterial({
      uniforms: {
        sunDir:       { value: this.sunDir.clone() },
        sunColor:     { value: new THREE.Color(this.currentBiome.sunColor) },
        ambientColor: { value: new THREE.Color(this.currentBiome.lowPolyAmbient) },
        skyTint:      { value: new THREE.Color(this.currentBiome.skyTop) },
        groundTint:   { value: new THREE.Color(this.currentBiome.groundTint) },
        fogColor:     { value: new THREE.Color(this.currentBiome.fogColor) },
        fogNear:      { value: 500 },
        fogFar:       { value: 6100 },
        hazeStrength: { value: 0.98 },
        hazeExponent: { value: 1.30 },
        clipEnabled:  { value: 0.0 },
        clipMin:      { value: this._clipMin },
        clipMax:      { value: this._clipMax },
      },
      vertexShader: this.SAND_VS,
      fragmentShader: this.LOWPOLY_FS,
      extensions: { derivatives: true },
    });
  }

  // --- Geometry Instancing Helpers ---
  _initSharedGeometries() {
    this.rockGeo = (() => {
      const g = new THREE.DodecahedronGeometry(1, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = Math.sin(x * 4.7 + this.seed) * Math.cos(y * 3.1) * Math.sin(z * 5.3);
        p.setXYZ(i, x * (1 + n * 0.28), y * (1 + n * 0.18), z * (1 + n * 0.22));
      }
      g.computeVertexNormals();
      return g;
    })();
    this.rockMat = new THREE.MeshLambertMaterial({ color: 0x9c6840 });
    this.rockMatLowPoly = new THREE.MeshPhongMaterial({ color: 0x9c6840, flatShading: true, shininess: 0 });

    this.pineGeo = this._buildPineGeo();
    this.cactusGeo = this._buildCactusGeo();
    this.shrubGeo = this._buildShrubGeo();
    this.boulderGeo = this._buildBoulderGeo();

    this.floraMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.floraMatLow = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0 });
  }

  _mergeColored(entries) {
    let total = 0;
    for (const e of entries) total += e.geo.attributes.position.count;
    const positions = new Float32Array(total * 3);
    const normals = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const indices = [];
    let vOff = 0;
    for (const e of entries) {
      const pg = e.geo;
      const pn = pg.attributes.position;
      pg.computeVertexNormals();
      const nr = pg.attributes.normal;
      for (let i = 0; i < pn.count; i++) {
        positions[(vOff + i) * 3]     = pn.getX(i);
        positions[(vOff + i) * 3 + 1] = pn.getY(i);
        positions[(vOff + i) * 3 + 2] = pn.getZ(i);
        normals[(vOff + i) * 3]     = nr.getX(i);
        normals[(vOff + i) * 3 + 1] = nr.getY(i);
        normals[(vOff + i) * 3 + 2] = nr.getZ(i);
        colors[(vOff + i) * 3]     = e.col.r;
        colors[(vOff + i) * 3 + 1] = e.col.g;
        colors[(vOff + i) * 3 + 2] = e.col.b;
      }
      const idx = pg.index;
      if (idx) {
        for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + vOff);
      } else {
        for (let i = 0; i < pn.count; i++) indices.push(i + vOff);
      }
      vOff += pn.count;
      pg.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    out.setIndex(indices);
    return out;
  }

  _buildPineGeo() {
    const geos = [];
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6);
    trunk.translate(0, 1.1, 0);
    geos.push({ geo: trunk, col: new THREE.Color(0x5d3a1a) });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.ConeGeometry(1.5 - i * 0.22, 1.8, 6);
      c.translate(0, 2.5 + i * 0.85, 0);
      geos.push({ geo: c, col: new THREE.Color(i % 2 === 0 ? 0x2d6a2a : 0x3a8a38) });
    }
    return this._mergeColored(geos);
  }

  _buildCactusGeo() {
    const geos = [];
    const col = new THREE.Color(0x4a7a3a);
    const body = new THREE.CylinderGeometry(0.35, 0.42, 2.4, 8);
    body.translate(0, 1.2, 0);
    geos.push({ geo: body, col });

    const armL = new THREE.CylinderGeometry(0.18, 0.22, 0.9, 7);
    armL.rotateZ(Math.PI / 2);
    armL.translate(-0.6, 1.5, 0);
    geos.push({ geo: armL, col });
    const armLUp = new THREE.CylinderGeometry(0.18, 0.18, 0.7, 7);
    armLUp.translate(-1.0, 1.9, 0);
    geos.push({ geo: armLUp, col });

    const armR = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 7);
    armR.rotateZ(Math.PI / 2);
    armR.translate(0.5, 1.9, 0);
    geos.push({ geo: armR, col });
    const armRUp = new THREE.CylinderGeometry(0.16, 0.16, 0.55, 7);
    armRUp.translate(0.82, 2.22, 0);
    geos.push({ geo: armRUp, col });

    const cap = new THREE.SphereGeometry(0.38, 7, 5);
    cap.translate(0, 2.38, 0);
    geos.push({ geo: cap, col });
    return this._mergeColored(geos);
  }

  _buildShrubGeo() {
    const geos = [];
    for (let i = 0; i < 5; i++) {
      const r = 0.35 + (i % 3) * 0.1;
      const d = new THREE.DodecahedronGeometry(r, 0);
      const ang = (i / 5) * Math.PI * 2;
      d.translate(Math.cos(ang) * 0.3, r * 0.7, Math.sin(ang) * 0.3);
      geos.push({ geo: d, col: new THREE.Color(0x7a5a2a) });
    }
    return this._mergeColored(geos);
  }

  _buildBoulderGeo() {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * 5.3 + this.seed) * Math.cos(y * 3.7) * Math.sin(z * 4.1);
      p.setXYZ(i, x * (1 + n * 0.25), y * (1 + n * 0.20), z * (1 + n * 0.22));
    }
    geo.computeVertexNormals();

    const cols = new Float32Array(p.count * 3);
    const c = new THREE.Color(0xa07450);
    for (let i = 0; i < p.count; i++) {
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return geo;
  }

  // --- Water Implementation ---
  _initWater() {
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        time:      { value: 0 },
        shallow:   { value: new THREE.Color(0x4ea68a) },
        deep:      { value: new THREE.Color(0x143a46) },
        skyTop:    { value: new THREE.Color(this.currentBiome.skyTop) },
        skyBottom: { value: new THREE.Color(this.currentBiome.skyBottom) },
        cameraPos: { value: new THREE.Vector3() },
        fogColor:  { value: new THREE.Color(this.currentBiome.fogColor) },
        fogNear:   { value: 500 },
        fogFar:    { value: 6100 },
        sunDir:    { value: this.sunDir.clone() },
        runwayR:   { value: this.WATER_RUNWAY_R },
        reflectivity: { value: 1.28 },
        fresnelBoost: { value: 1.12 },
        sunGlint:     { value: 1.18 },
        waterOpacity: { value: 0.92 },
        clipEnabled:  { value: 0.0 },
        clipMin:      { value: this._clipMin },
        clipMax:      { value: this._clipMax },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying float vDist;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float time;
        uniform vec3 shallow;
        uniform vec3 deep;
        uniform vec3 skyTop;
        uniform vec3 skyBottom;
        uniform vec3 cameraPos;
        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;
        uniform vec3 sunDir;
        uniform float runwayR;
        uniform float reflectivity;
        uniform float fresnelBoost;
        uniform float sunGlint;
        uniform float waterOpacity;
        uniform float clipEnabled;
        uniform vec3 clipMin;
        uniform vec3 clipMax;
        varying vec3 vWorldPos;
        varying float vDist;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          // Clip bounds discard
          if (clipEnabled > 0.5) {
            if (vWorldPos.x < clipMin.x || vWorldPos.x > clipMax.x ||
                vWorldPos.z < clipMin.z || vWorldPos.z > clipMax.z) discard;
          }

          float rw = length(vWorldPos.xz);
          if (rw < runwayR) discard;
          float rwFade = smoothstep(runwayR, runwayR + 60.0, rw);

          vec2 uv = vWorldPos.xz * 0.012;
          float r1 = noise(uv + vec2(time * 0.05, time * 0.03));
          float r2 = noise(uv * 2.3 - vec2(time * 0.07, time * 0.04));
          float ripple = r1 * 0.65 + r2 * 0.35;

          vec2 eps = vec2(0.5, 0.0);
          float rN = noise(uv + eps.xy) - noise(uv - eps.xy);
          float rE = noise(uv + eps.yx) - noise(uv - eps.yx);
          vec3 norm = normalize(vec3(-rN * 0.6, 1.0, -rE * 0.6));
          float sun = pow(max(0.0, dot(norm, sunDir)), 32.0);
          vec3 viewDir = normalize(cameraPos - vWorldPos);
          float fresnel = pow(1.0 - max(0.0, dot(norm, viewDir)), 3.0);
          float skyMix = clamp(viewDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 reflectedSky = mix(skyBottom, skyTop, pow(skyMix, 0.8));

          vec3 col = mix(deep, shallow, ripple * 0.58 + 0.24);
          float reflectionMix = clamp((0.14 + fresnel * 0.44 * fresnelBoost) * reflectivity, 0.0, 0.94);
          col = mix(col, reflectedSky, reflectionMix);
          col += vec3(1.0, 0.98, 0.92) * sun * (0.28 + 0.42 * sunGlint);

          col = floor(col * 12.0) / 12.0;

          float fogF = clamp((vDist - fogNear) / (fogFar - fogNear), 0.0, 1.0);
          col = mix(col, fogColor, fogF);

          gl_FragColor = vec4(col, waterOpacity * rwFade);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.waterGeo = new THREE.PlaneGeometry(this.WATER_EXTENT, this.WATER_EXTENT, 1, 1);
    this.waterGeo.rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(this.waterGeo, this.waterMat);
    this.waterMesh.position.y = this.WATER_LEVEL;
    this.waterMesh.renderOrder = 3;
    this.scene.add(this.waterMesh);
  }

  // --- Terrain Chunk Builder ---
  _makeChunk(cx, cz) {
    const group = new THREE.Group();
    const lowPoly = this.styleMode === 'lowpoly';
    const sandM = lowPoly ? this.sandMatLowPoly : this.sandMat;
    const rockM = lowPoly ? this.rockMatLowPoly : this.rockMat;

    const geo = new THREE.PlaneGeometry(this.CHUNK_SIZE, this.CHUNK_SIZE, this.CHUNK_RES, this.CHUNK_RES);
    geo.rotateX(-Math.PI / 2);

    const cxW = (cx + 0.5) * this.CHUNK_SIZE;
    const czW = (cz + 0.5) * this.CHUNK_SIZE;

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = cxW + lx;
      const wz = czW + lz;
      const h = this.getHeight(wx, wz);
      pos.setY(i, h);

      this._strataColor(h, tmp);

      // Cliff face tint
      const hN = this.getHeight(wx + 5, wz);
      const hE = this.getHeight(wx, wz + 5);
      const slope = Math.min(1, (Math.abs(hN - h) + Math.abs(hE - h)) * 0.045);
      if (slope > 0.25) {
        tmp.lerp(this.CLIFF_TINT, (slope - 0.25) * 0.55);
      }

      // Mottling noise
      const n1 = this._vnoise(wx * 0.045, wz * 0.045);
      const n2 = this._vnoise(wx * 0.011, wz * 0.011);
      tmp.multiplyScalar(0.78 + n1 * 0.22 + (n2 - 0.5) * 0.18);

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, sandM);
    mesh.position.set(cxW, 0, czW);
    group.add(mesh);

    // --- Scatter Instanced Rocks ---
    const ROCKS_PER_CHUNK = 50;
    const rocks = new THREE.InstancedMesh(this.rockGeo, rockM, ROCKS_PER_CHUNK);
    const dummy = new THREE.Object3D();
    let added = 0;

    for (let i = 0; i < ROCKS_PER_CHUNK * 2 && added < ROCKS_PER_CHUNK; i++) {
      const r1 = this._srand(cx, cz, i * 2);
      const r2 = this._srand(cx, cz, i * 2 + 1);
      const lxr = (r1 - 0.5) * this.CHUNK_SIZE;
      const lzr = (r2 - 0.5) * this.CHUNK_SIZE;
      const wx = cxW + lxr;
      const wz = czW + lzr;
      const dist = Math.sqrt(wx * wx + wz * wz);
      if (dist < 280) continue; 
      const h = this.getHeight(wx, wz);
      if (h < 4) continue;
      const scl = 0.6 + this._srand(cx, cz, i + 100) * 3.2;
      dummy.position.set(wx, h - scl * 0.3, wz);
      dummy.rotation.set(
        this._srand(cx, cz, i + 200) * Math.PI,
        this._srand(cx, cz, i + 300) * Math.PI * 2,
        this._srand(cx, cz, i + 400) * Math.PI
      );
      dummy.scale.set(scl, scl * (0.7 + this._srand(cx, cz, i + 500) * 0.6), scl);
      dummy.updateMatrix();
      rocks.setMatrixAt(added, dummy.matrix);
      added++;
    }
    rocks.count = added;
    rocks.instanceMatrix.needsUpdate = true;
    group.add(rocks);

    // --- Scatter Flora Clutter ---
    const floraMaterial = lowPoly ? this.floraMatLow : this.floraMat;
    const CAP_PINE = 180, CAP_CACTUS = 100, CAP_SHRUB = 220, CAP_BOULDER = 60;

    const pines    = new THREE.InstancedMesh(this.pineGeo,    floraMaterial, CAP_PINE);
    const cacti    = new THREE.InstancedMesh(this.cactusGeo,  floraMaterial, CAP_CACTUS);
    const shrubs   = new THREE.InstancedMesh(this.shrubGeo,   floraMaterial, CAP_SHRUB);
    const boulders = new THREE.InstancedMesh(this.boulderGeo, floraMaterial, CAP_BOULDER);

    let nPine = 0, nCactus = 0, nShrub = 0, nBoulder = 0;
    const d = new THREE.Object3D();

    const samples = 600;
    for (let i = 0; i < samples; i++) {
      const rx = this._srand(cx, cz, i * 3);
      const rz = this._srand(cx, cz, i * 3 + 1);
      const pick = this._srand(cx, cz, i * 3 + 2);
      const lx = (rx - 0.5) * this.CHUNK_SIZE;
      const lz = (rz - 0.5) * this.CHUNK_SIZE;
      const wx = cxW + lx;
      const wz = czW + lz;

      const r2 = wx * wx + wz * wz;
      if (r2 < 240 * 240) continue; 

      const h = this.getHeight(wx, wz);
      if (h < this.WATER_LEVEL + 0.5) continue; 

      const hN = this.getHeight(wx + 6, wz);
      const hE = this.getHeight(wx, wz + 6);
      const slope = (Math.abs(hN - h) + Math.abs(hE - h)) * 0.05;
      if (slope > 0.44) continue; 

      d.position.set(wx, h, wz);
      d.rotation.set(0, this._srand(cx, cz, i + 800) * Math.PI * 2, 0);

      if (this.currentBiome.hasCactus && pick < 0.35 && nCactus < CAP_CACTUS) {
        const s = 0.72 + this._srand(cx, cz, i + 900) * 0.92;
        d.scale.set(s, s, s);
        d.updateMatrix();
        cacti.setMatrixAt(nCactus++, d.matrix);
      } else if (pick < this.currentBiome.shrubChance && nShrub < CAP_SHRUB) {
        const s = 0.55 + this._srand(cx, cz, i + 1000) * 0.72;
        d.scale.set(s, s, s);
        d.updateMatrix();
        shrubs.setMatrixAt(nShrub++, d.matrix);
      }

      if (pick < this.currentBiome.pineChance && nPine < CAP_PINE) {
        const s = 0.68 + this._srand(cx, cz, i + 1100) * 1.5;
        d.scale.set(s, s * (0.85 + this._srand(cx, cz, i + 1200) * 0.3), s);
        d.updateMatrix();
        pines.setMatrixAt(nPine++, d.matrix);
      } else if (pick < 0.08 && nBoulder < CAP_BOULDER) {
        const s = 0.8 + this._srand(cx, cz, i + 1300) * 3.4;
        d.position.y -= s * 0.28; 
        d.rotation.set(
          this._srand(cx, cz, i + 1400) * Math.PI,
          this._srand(cx, cz, i + 1500) * Math.PI * 2,
          this._srand(cx, cz, i + 1600) * Math.PI
        );
        d.scale.set(s, s * (0.6 + this._srand(cx, cz, i + 1700) * 0.5), s);
        d.updateMatrix();
        boulders.setMatrixAt(nBoulder++, d.matrix);
      }
    }

    pines.count = nPine;
    cacti.count = nCactus;
    shrubs.count = nShrub;
    boulders.count = nBoulder;

    pines.instanceMatrix.needsUpdate = true;
    cacti.instanceMatrix.needsUpdate = true;
    shrubs.instanceMatrix.needsUpdate = true;
    boulders.instanceMatrix.needsUpdate = true;

    if (nPine > 0) group.add(pines);
    if (nCactus > 0) group.add(cacti);
    if (nShrub > 0) group.add(shrubs);
    if (nBoulder > 0) group.add(boulders);

    this.scene.add(group);

    return { group, geo, mesh };
  }

  // --- Far LOD Chunks ---
  _makeFarChunk(cx, cz) {
    const group = new THREE.Group();
    const lowPoly = this.styleMode === 'lowpoly';
    const sandM = lowPoly ? this.sandMatLowPoly : this.sandMat;

    const geo = new THREE.PlaneGeometry(this.FAR_CHUNK_SIZE, this.FAR_CHUNK_SIZE, this.FAR_CHUNK_RES, this.FAR_CHUNK_RES);
    geo.rotateX(-Math.PI / 2);

    const cxW = (cx + 0.5) * this.FAR_CHUNK_SIZE;
    const czW = (cz + 0.5) * this.FAR_CHUNK_SIZE;

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = cxW + lx;
      const wz = czW + lz;
      const h = this.getHeight(wx, wz);
      pos.setY(i, h);

      this._strataColor(h, tmp);

      const hN = this.getHeight(wx + 12, wz);
      const hE = this.getHeight(wx, wz + 12);
      const slope = Math.min(1, (Math.abs(hN - h) + Math.abs(hE - h)) * 0.018);
      if (slope > 0.1) {
        tmp.lerp(this.CLIFF_TINT, (slope - 0.1) * 0.65);
      }

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, sandM);
    mesh.position.set(cxW, 0, czW);
    group.add(mesh);

    this.scene.add(group);
    return { group, geo, mesh };
  }

  // --- Chunk Queue Routing ---
  _queueChunkBuild(list, set, map, cx, cz, priority) {
    const key = `${cx},${cz}`;
    if (set.has(key) || map.has(key)) return;
    set.add(key);
    list.push({ key, cx, cz, priority });
  }

  _trimPendingChunkBuilds(list, set, wanted) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (wanted.has(list[i].key)) continue;
      set.delete(list[i].key);
      list.splice(i, 1);
    }
  }

  _processChunkBuildQueues(nearBudget = 1, farBudget = 1) {
    if (this.pendingChunkBuilds.length > 1) {
      this.pendingChunkBuilds.sort((a, b) => a.priority - b.priority);
    }
    while (nearBudget-- > 0 && this.pendingChunkBuilds.length) {
      const job = this.pendingChunkBuilds.shift();
      this.pendingChunkKeys.delete(job.key);
      if (!this.chunks.has(job.key)) {
        this.chunks.set(job.key, this._makeChunk(job.cx, job.cz));
      }
    }

    if (this.pendingFarChunkBuilds.length > 1) {
      this.pendingFarChunkBuilds.sort((a, b) => a.priority - b.priority);
    }
    while (farBudget-- > 0 && this.pendingFarChunkBuilds.length) {
      const job = this.pendingFarChunkBuilds.shift();
      this.pendingFarChunkKeys.delete(job.key);
      if (!this.farChunks.has(job.key)) {
        this.farChunks.set(job.key, this._makeFarChunk(job.cx, job.cz));
      }
    }
  }

  // --- Public Interface ---

  /**
   * Sets the active biome name and re-maps all color palettes.
   * @param {string} name - 'desert', 'grassland', or 'snow'
   */
  setBiome(name) {
    if (!this.BIOMES[name]) return;
    this.currentBiomeName = name;
    this.currentBiome = { ...this.BIOMES[name] };
    this.STRATA = this.currentBiome.strata.map(s => ({ h: s.h, c: new THREE.Color(s.c) }));
    this.CLIFF_TINT = new THREE.Color(this.currentBiome.cliffTint);

    const uniforms = this.sandMat.uniforms;
    uniforms.sunColor.value.setHex(this.currentBiome.sunColor);
    uniforms.ambientColor.value.setHex(this.currentBiome.ambient);
    uniforms.skyTint.value.setHex(this.currentBiome.skyTop);
    uniforms.groundTint.value.setHex(this.currentBiome.groundTint);
    uniforms.fogColor.value.setHex(this.currentBiome.fogColor);

    const lpUniforms = this.sandMatLowPoly.uniforms;
    lpUniforms.sunColor.value.setHex(this.currentBiome.sunColor);
    lpUniforms.ambientColor.value.setHex(this.currentBiome.lowPolyAmbient);
    lpUniforms.skyTint.value.setHex(this.currentBiome.skyTop);
    lpUniforms.groundTint.value.setHex(this.currentBiome.groundTint);
    lpUniforms.fogColor.value.setHex(this.currentBiome.fogColor);

    this.waterMat.uniforms.skyTop.value.setHex(this.currentBiome.skyTop);
    this.waterMat.uniforms.skyBottom.value.setHex(this.currentBiome.skyBottom);
    this.waterMat.uniforms.fogColor.value.setHex(this.currentBiome.fogColor);

    if (this.fogColorOut) {
      this.fogColorOut.setHex(this.currentBiome.fogColor);
    }

    this.clearChunks();
  }

  /**
   * Switches visual style mode.
   * @param {string} mode - 'realistic' or 'lowpoly'
   */
  setStyleMode(mode) {
    if (mode !== 'realistic' && mode !== 'lowpoly') return;
    this.styleMode = mode;
    this.clearChunks();
  }

  /**
   * Sets a world-space AABB clip box. Fragments outside the box are discarded
   * on the XZ plane, creating clean flat faces at the boundary.
   * @param {THREE.Vector3} min - Minimum corner of the clip box
   * @param {THREE.Vector3} max - Maximum corner of the clip box
   */
  setClipBounds(min, max) {
    this._clipEnabled = true;
    this._clipMin.copy(min);
    this._clipMax.copy(max);

    // Update shader uniforms (all three share the same Vector3 refs)
    const mats = [this.sandMat, this.sandMatLowPoly, this.waterMat];
    for (const m of mats) {
      m.uniforms.clipEnabled.value = 1.0;
    }

    // Build native clipping planes for Lambert/Phong materials (rocks, flora).
    // Four planes forming an XZ box: +X, -X, +Z, -Z.
    this._clipPlanes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), max.x),  // x <= max.x
      new THREE.Plane(new THREE.Vector3( 1, 0, 0), -min.x), // x >= min.x
      new THREE.Plane(new THREE.Vector3( 0, 0,-1), max.z),  // z <= max.z
      new THREE.Plane(new THREE.Vector3( 0, 0, 1), -min.z), // z >= min.z
    ];
    const builtinMats = [this.rockMat, this.rockMatLowPoly, this.floraMat, this.floraMatLow];
    for (const m of builtinMats) {
      m.clippingPlanes = this._clipPlanes;
    }
  }

  /**
   * Clears the clip box so the terrain extends to the horizon.
   */
  clearClipBounds() {
    this._clipEnabled = false;
    this._clipMin.set(-1e6, -1e6, -1e6);
    this._clipMax.set( 1e6,  1e6,  1e6);
    const mats = [this.sandMat, this.sandMatLowPoly, this.waterMat];
    for (const m of mats) {
      m.uniforms.clipEnabled.value = 0.0;
    }
    this._clipPlanes = [];
    const builtinMats = [this.rockMat, this.rockMatLowPoly, this.floraMat, this.floraMatLow];
    for (const m of builtinMats) {
      m.clippingPlanes = null;
    }
  }

  /**
   * Clears out all loaded and pending chunks to force rebuilds.
   */
  clearChunks() {
    for (const c of this.chunks.values()) {
      this.scene.remove(c.group);
      c.geo.dispose();
    }
    this.chunks.clear();

    for (const fc of this.farChunks.values()) {
      this.scene.remove(fc.group);
      fc.geo.dispose();
    }
    this.farChunks.clear();

    this.pendingChunkBuilds = [];
    this.pendingChunkKeys.clear();
    this.pendingFarChunkBuilds = [];
    this.pendingFarChunkKeys.clear();
  }

  /**
   * Updates streaming chunks and shifts water based on the camera position.
   * Call this inside your requestAnimationFrame / physics update loop.
   * @param {THREE.Vector3} focusPos - Camera or player coordinate position
   * @param {number} dt - Delta time since last update (seconds)
   */
  update(focusPos, dt) {
    const px = focusPos.x;
    const pz = focusPos.z;

    // --- 1. Water positioning ---
    this.waterMat.uniforms.time.value += dt;
    this.waterMat.uniforms.cameraPos.value.copy(focusPos);
    const step = 40;
    this.waterMesh.position.x = Math.round(px / step) * step;
    this.waterMesh.position.z = Math.round(pz / step) * step;

    // --- 2. High-Detail Chunks Streaming ---
    const pcx = Math.floor(px / this.CHUNK_SIZE);
    const pcz = Math.floor(pz / this.CHUNK_SIZE);
    const wantedNear = new Set();

    for (let dz = -this.RENDER_RADIUS; dz <= this.RENDER_RADIUS; dz++) {
      for (let dx = -this.RENDER_RADIUS; dx <= this.RENDER_RADIUS; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = `${cx},${cz}`;
        wantedNear.add(key);
        if (!this.chunks.has(key)) {
          this._queueChunkBuild(
            this.pendingChunkBuilds,
            this.pendingChunkKeys,
            this.chunks,
            cx, cz,
            Math.abs(dx) + Math.abs(dz)
          );
        }
      }
    }

    this._trimPendingChunkBuilds(this.pendingChunkBuilds, this.pendingChunkKeys, wantedNear);

    for (const [key, c] of this.chunks) {
      if (!wantedNear.has(key)) {
        this.scene.remove(c.group);
        c.geo.dispose();
        this.chunks.delete(key);
      }
    }

    // --- 3. Far LOD Chunks Streaming ---
    const fpcx = Math.floor(px / this.FAR_CHUNK_SIZE);
    const fpcz = Math.floor(pz / this.FAR_CHUNK_SIZE);
    const wantedFar = new Set();

    for (let dz = -this.FAR_RADIUS; dz <= this.FAR_RADIUS; dz++) {
      for (let dx = -this.FAR_RADIUS; dx <= this.FAR_RADIUS; dx++) {
        const cx = fpcx + dx;
        const cz = fpcz + dz;

        const worldXMin = cx * this.FAR_CHUNK_SIZE;
        const worldXMax = (cx + 1) * this.FAR_CHUNK_SIZE;
        const worldZMin = cz * this.FAR_CHUNK_SIZE;
        const worldZMax = (cz + 1) * this.FAR_CHUNK_SIZE;

        const nearXMin = (pcx - this.RENDER_RADIUS) * this.CHUNK_SIZE - 200; 
        const nearXMax = (pcx + this.RENDER_RADIUS + 1) * this.CHUNK_SIZE + 200;
        const nearZMin = (pcz - this.RENDER_RADIUS) * this.CHUNK_SIZE - 200;
        const nearZMax = (pcz + this.RENDER_RADIUS + 1) * this.CHUNK_SIZE + 200;

        const fullyInside = (worldXMin >= nearXMin && worldXMax <= nearXMax &&
                             worldZMin >= nearZMin && worldZMax <= nearZMax);

        if (fullyInside) continue;

        const key = `${cx},${cz}`;
        wantedFar.add(key);

        if (!this.farChunks.has(key)) {
          this._queueChunkBuild(
            this.pendingFarChunkBuilds,
            this.pendingFarChunkKeys,
            this.farChunks,
            cx, cz,
            Math.abs(dx) + Math.abs(dz)
          );
        }
      }
    }

    this._trimPendingChunkBuilds(this.pendingFarChunkBuilds, this.pendingFarChunkKeys, wantedFar);

    for (const [key, fc] of this.farChunks) {
      if (!wantedFar.has(key)) {
        this.scene.remove(fc.group);
        fc.geo.dispose();
        this.farChunks.delete(key);
      }
    }

    this._processChunkBuildQueues(2, 2);
  }

  /**
   * Cleans up all materials, textures, and geometry to prevent WebGL memory leaks.
   */
  dispose() {
    this.clearChunks();
    this.scene.remove(this.waterMesh);
    this.waterGeo.dispose();
    this.waterMat.dispose();

    this.sandMat.dispose();
    this.sandMatLowPoly.dispose();
    this.rockMat.dispose();
    this.rockMatLowPoly.dispose();
    this.rockGeo.dispose();

    this.pineGeo.dispose();
    this.cactusGeo.dispose();
    this.shrubGeo.dispose();
    this.boulderGeo.dispose();

    this.floraMat.dispose();
    this.floraMatLow.dispose();
  }
}

// Export module definitions
if (typeof exports !== 'undefined') {
  exports.LandscapeEngine = LandscapeEngine;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LandscapeEngine };
} else if (typeof window !== 'undefined') {
  window.LandscapeEngine = LandscapeEngine;
}
