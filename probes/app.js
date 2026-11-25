/* 3D atlas. This folder, data/probes.json, and the update-probes workflow
 * are meant to move together to space.seagle.xyz.
 */
import * as THREE from "./vendor/three.module.js";
import { CRAFT, ELEMENTS, GROUPS, PLANETS } from "./catalog.js";

const DEG = Math.PI / 180;
const DAY = 86400000;
const AU_DAY = 149597870.7 / 86400;
const T0 = Date.UTC(1977, 0, 1);
const SCALE = [
  { au: 0.08, t: 0 },
  { au: 5, t: 0.22 },
  { au: 40, t: 0.50 },
  { au: 200, t: 1 },
];
const R0 = 2.2;
const R1 = 108;
const byId = Object.fromEntries(CRAFT.map((c) => [c.id, c]));

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const canvas = $("c3");
const labelsEl = $("labels");
const dockScroll = $("dock-scroll");
const slider = $("time");
const phoneQuery = window.matchMedia("(max-width: 720px)");

let tracks = {};
let T1 = Date.now();
let when = T1;
let renderer;
let camera;
let scene;
let solar;
let localGroup;
let trailGroup;
let planetGroups = {};
let craftGroups = {};
let labelEls = [];
let selected = null;
let hot = null;
let mode = "solar";
let transitioning = false;
let az = 38 * DEG;
let el = 30 * DEG;
let radius = 248;
let target = new THREE.Vector3();
let earthAz = 0.2;
let earthEl = 0.34;
let earthRadius = 26;
let earthTarget = new THREE.Vector3(-0.4, 0.15, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function scaleT(au) {
  const a = Math.max(au, SCALE[0].au);
  for (let i = 1; i < SCALE.length; i++) {
    if (a <= SCALE[i].au || i === SCALE.length - 1) {
      const a0 = SCALE[i - 1].au;
      const a1 = SCALE[i].au;
      const u = Math.log(Math.min(a, a1 * 1.08) / a0) / Math.log(a1 / a0);
      return SCALE[i - 1].t + (SCALE[i].t - SCALE[i - 1].t) * u;
    }
  }
  return 1;
}
function toR(au) { return R0 + (R1 - R0) * scaleT(au); }
function project(x, y, z) {
  const dist = Math.hypot(x, y, z) || 1e-8;
  const s = toR(dist) / dist;
  return new THREE.Vector3(x * s, z * s, y * s);
}
function centuries(ms) {
  return (ms / DAY + 2440587.5 - 2451545) / 36525;
}
function kepler(M, e) {
  let E = M;
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}
function planetXYZ(name, ms) {
  const eln = ELEMENTS[name];
  const T = centuries(ms);
  const a = eln.a[0] + eln.a[1] * T;
  const e = Math.min(0.95, Math.max(0, eln.e[0] + eln.e[1] * T));
  const I = (eln.I[0] + eln.I[1] * T) * DEG;
  const L = (eln.L[0] + eln.L[1] * T) * DEG;
  const wbar = (eln.w[0] + eln.w[1] * T) * DEG;
  const Om = (eln.O[0] + eln.O[1] * T) * DEG;
  const M = Math.atan2(Math.sin(L - wbar), Math.cos(L - wbar));
  const E = kepler(M, e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = a * (1 - e * Math.cos(E));
  const w = wbar - Om;
  const c = Math.cos(nu + w);
  const s = Math.sin(nu + w);
  return {
    x: r * (Math.cos(Om) * c - Math.sin(Om) * s * Math.cos(I)),
    y: r * (Math.sin(Om) * c + Math.cos(Om) * s * Math.cos(I)),
    z: r * s * Math.sin(I),
    dist: r,
  };
}
function orbitLoop(name, n) {
  const eln = ELEMENTS[name];
  const a = eln.a[0];
  const e = Math.min(0.9, Math.max(0, eln.e[0]));
  const I = eln.I[0] * DEG;
  const arg = (eln.w[0] - eln.O[0]) * DEG;
  const Om = eln.O[0] * DEG;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const nu = (i / n) * Math.PI * 2;
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
    const c = Math.cos(nu + arg);
    const s = Math.sin(nu + arg);
    pts.push(project(
      r * (Math.cos(Om) * c - Math.sin(Om) * s * Math.cos(I)),
      r * (Math.sin(Om) * c + Math.cos(Om) * s * Math.cos(I)),
      r * s * Math.sin(I),
    ));
  }
  return pts;
}

function prepTracks(data) {
  tracks = data && data.probes ? data.probes : {};
  let latest = 0;
  for (const tr of Object.values(tracks)) {
    tr.ms = tr.t.map((d) => Date.parse(d + "T00:00:00Z"));
    if (tr.ms.length) latest = Math.max(latest, tr.ms[tr.ms.length - 1]);
  }
  if (latest > Date.UTC(2020, 0, 1)) T1 = Math.max(T1, latest);
  when = Math.min(when, T1);
}
function sample(id, ms) {
  const tr = tracks[id];
  if (!tr || !tr.ms || !tr.ms.length || ms < tr.ms[0]) return null;
  const times = tr.ms;
  let hi = 1;
  while (hi < times.length && times[hi] < ms) hi++;
  if (hi >= times.length) hi = times.length - 1;
  const lo = Math.max(0, hi - 1);
  const span = times[hi] - times[lo] || 1;
  const u = Math.min(1, Math.max(0, (ms - times[lo]) / span));
  const mix = (k) => tr[k][lo] + (tr[k][hi] - tr[k][lo]) * u;
  const x = mix("x");
  const y = mix("y");
  const z = mix("z");
  const vx = mix("vx");
  const vy = mix("vy");
  const vz = mix("vz");
  return { x, y, z, dist: Math.hypot(x, y, z), speed: Math.hypot(vx, vy, vz) * AU_DAY };
}
function msOf(iso) { return iso ? Date.parse(iso + "T00:00:00Z") : NaN; }

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,250,240,1)");
  grd.addColorStop(0.22, "rgba(236,228,212,0.7)");
  grd.addColorStop(0.55, "rgba(0,0,0,0.08)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function lineOf(points, color, opacity) {
  if (!points || points.length < 2) return null;
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return line;
}
function smoothTrail(pts) {
  if (pts.length < 4) return pts;
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.4);
  return curve.getPoints(Math.min(160, pts.length * 3));
}
function trailVectors(meta, ms) {
  const tr = tracks[meta.id];
  if (!tr || meta.trail === "none") return [];
  const launch = msOf(meta.launched);
  const raw = [];
  for (let i = 0; i < tr.ms.length; i++) {
    if (tr.ms[i] < launch || tr.ms[i] > ms) continue;
    const d = Math.hypot(tr.x[i], tr.y[i], tr.z[i]);
    raw.push({ ms: tr.ms[i], x: tr.x[i], y: tr.y[i], z: tr.z[i], d });
  }
  if (raw.length < 2) return [];
  let slice = raw;
  if (meta.trail === "recent") {
    const win = (meta.recentDays || 80) * DAY;
    slice = raw.filter((p) => ms - p.ms <= win);
  } else if (meta.trail === "outbound") {
    let start = 0;
    let prev = raw[0].d;
    raw.forEach((p, i) => {
      if (p.d + 0.8 < prev) start = i;
      prev = p.d;
    });
    slice = raw.slice(start).filter((p) => p.d > 5);
  }
  if (slice.length > 64) {
    const step = Math.ceil(slice.length / 56);
    slice = slice.filter((_, i) => i % step === 0 || i === slice.length - 1);
  }
  return smoothTrail(slice.map((p) => project(p.x, p.y, p.z)));
}

function makeProbeSprite(dim) {
  const g = new THREE.Group();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: dim ? 0.45 : 0.95,
  }));
  sprite.scale.setScalar(dim ? 2.2 : 3.4);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshBasicMaterial({ color: dim ? 0xb3ab9c : 0xf7f1e4 }),
  );
  g.add(sprite, core);
  return g;
}
function makeDiamond() {
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.34, 0),
    new THREE.MeshPhongMaterial({ color: 0xb3947a, emissive: 0x5a4336, emissiveIntensity: 0.45, shininess: 8 }),
  );
  mesh.rotation.z = Math.PI / 4;
  return mesh;
}
function paintPlanet(kind) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  if (kind === "earth") {
    g.fillStyle = "#2c5a86";
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = "#3f6e4e";
    [[70, 70, 90, 55], [150, 50, 70, 40], [200, 90, 110, 60], [340, 40, 120, 70], [90, 180, 60, 25]].forEach(([x, y, w, h]) => {
      g.beginPath(); g.ellipse(x, y, w, h, 0.2, 0, Math.PI * 2); g.fill();
    });
    g.fillStyle = "#d5d0c4";
    g.fillRect(0, 0, 512, 18);
    g.fillRect(0, 238, 512, 18);
  } else {
    g.fillStyle = "#b7ab97";
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = "#8e8474";
    [[140, 90, 70, 40], [280, 130, 55, 30], [80, 160, 40, 25], [360, 70, 50, 28]].forEach(([x, y, w, h]) => {
      g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill();
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addLabel(text, cls, minor, getPos, space = "solar", extra = {}) {
  const el = document.createElement("div");
  el.className = "label" + (cls ? " " + cls : "");
  el.textContent = text;
  el.dataset.minor = minor ? "1" : "0";
  labelsEl.appendChild(el);
  labelEls.push({
    el, getPos, minor, text, space,
    id: extra.id || null,
    anchor: extra.anchor || null,
    leader: Boolean(extra.leader),
  });
}

function buildScene() {
  const phone = phoneQuery.matches;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !phone, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.6));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2000);
  solar = new THREE.Group();
  localGroup = new THREE.Group();
  localGroup.visible = false;
  trailGroup = new THREE.Group();
  solar.add(trailGroup);
  scene.add(solar, localGroup);

  const starN = phone ? 500 : 900;
  const starPos = new Float32Array(starN * 3);
  const rnd = (() => { let s = 314159; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
  for (let i = 0; i < starN; i++) {
    const r = 420 + rnd() * 700;
    const lo = rnd() * Math.PI * 2;
    const la = Math.asin(rnd() * 2 - 1);
    starPos[i * 3] = r * Math.cos(la) * Math.cos(lo);
    starPos[i * 3 + 1] = r * Math.sin(la);
    starPos[i * 3 + 2] = r * Math.cos(la) * Math.sin(lo);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0xe7e0d2, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  stars.frustumCulled = false;
  scene.add(stars);

  solar.add(new THREE.AmbientLight(0x8890a8, 0.6));
  const sunLight = new THREE.PointLight(0xffe6b0, 2.4, 400, 0.7);
  solar.add(sunLight);
  const sun = new THREE.Group();
  sun.add(new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 18), new THREE.MeshBasicMaterial({ color: 0xffe9b0 })));
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffe0a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sunGlow.scale.set(16, 16, 1);
  sun.add(sunGlow);
  solar.add(sun);
  addLabel("Sun", "gold", false, () => tmp2.set(0, -2.4, 0));

  const segs = phone ? 96 : 160;
  for (const planet of PLANETS) {
    const loop = orbitLoop(planet.name, segs);
    const ring = lineOf(loop, planet.name === "Pluto" ? 0xc9b89a : 0xece4d4, planet.name === "Earth" ? 0.38 : 0.2);
    if (ring) solar.add(ring);
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(planet.r, 20, 16),
      new THREE.MeshPhongMaterial({ color: planet.color, emissive: planet.color, emissiveIntensity: 0.16, shininess: 14 }),
    );
    g.add(mesh);
    if (planet.ring) {
      const sat = new THREE.Mesh(
        new THREE.RingGeometry(planet.r * 1.4, planet.r * 2.2, 48),
        new THREE.MeshBasicMaterial({ color: 0xd4c39a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      );
      sat.rotation.x = Math.PI / 2.2;
      g.add(sat);
    }
    solar.add(g);
    planetGroups[planet.name] = g;
    const major = ["Earth", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"].includes(planet.name);
    addLabel(planet.name, "planet", !major, () => (mode === "solar" ? g.getWorldPosition(tmp2) : null));
  }
  for (const au of [1, 10, 100]) {
    const p = project(au, 0, 0);
    p.applyAxisAngle(new THREE.Vector3(0, 1, 0), 200 * DEG);
    addLabel(au === 1 ? "1 AU" : `${au} AU`, "ring", false, () => p);
  }
  const helioR = toR(120);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(helioR, phone ? 32 : 48, phone ? 24 : 32),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-p.xyz);
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
          gl_FragColor = vec4(0.62, 0.76, 0.88, rim * 0.07);
        }`,
    }),
  );
  solar.add(shell);
  const eq = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    eq.push(new THREE.Vector3(Math.cos(a) * helioR, 0, Math.sin(a) * helioR));
  }
  const eqLine = lineOf(eq, 0x9cc0e0, 0.28);
  if (eqLine) solar.add(eqLine);
  const hp = new THREE.Vector3(-helioR * 0.15, helioR * 0.72, -helioR * 0.55);
  addLabel("heliopause ~120 AU", "ring", false, () => hp);

  const kuiperN = phone ? 700 : 1800;
  const kPos = new Float32Array(kuiperN * 3);
  const kr = (() => { let s = 271828; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
  for (let i = 0; i < kuiperN; i++) {
    const au = 30 + Math.pow(kr(), 0.8) * 22;
    const lon = kr() * Math.PI * 2;
    const lat = (kr() - 0.5) * 12 * DEG;
    const R = toR(au);
    kPos[i * 3] = R * Math.cos(lat) * Math.cos(lon);
    kPos[i * 3 + 1] = R * Math.sin(lat);
    kPos[i * 3 + 2] = R * Math.cos(lat) * Math.sin(lon);
  }
  const kuiper = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(kPos, 3)),
    new THREE.PointsMaterial({ color: 0x9cc0e0, size: 1.15, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  kuiper.frustumCulled = false;
  solar.add(kuiper);

  for (const meta of CRAFT) {
    const g = new THREE.Group();
    g.userData.craftId = meta.id;
    g.add(makeProbeSprite(meta.inactive));
    g.add(makeDiamond());
    g.children[0].visible = meta.group !== "ended";
    g.children[1].visible = meta.group === "ended";
    g.traverse((obj) => { obj.userData.craftId = meta.id; });
    solar.add(g);
    craftGroups[meta.id] = g;
    if (!meta.earth || meta.group !== "planned") {
      addLabel(meta.label || meta.name, meta.group === "ended" ? "ended" : "", !meta.major, () => {
        if (!g.visible) return null;
        return g.getWorldPosition(tmp2);
      }, "solar", { id: meta.id });
    }
  }
  buildEarthScene(phone);
}

function buildEarthScene() {
  localGroup.add(new THREE.AmbientLight(0x6a7388, 0.45));
  const sun = new THREE.DirectionalLight(0xffe6b8, 2.2);
  sun.position.set(-30, 8, 6);
  localGroup.add(sun);
  const sunG = new THREE.Group();
  sunG.position.set(-11, 1.2, 0);
  sunG.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 18), new THREE.MeshBasicMaterial({ color: 0xffe9b0 })));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.set(7, 7, 1);
  sunG.add(glow);
  localGroup.add(sunG);
  addLabel("Sun", "gold", false, () => sunG.getWorldPosition(tmp2), "earth");
  const arrow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8),
    new THREE.MeshBasicMaterial({ color: 0xc9a86a }),
  );
  arrow.rotation.z = Math.PI / 2;
  arrow.position.set(-6.2, 1.8, 0);
  localGroup.add(arrow);
  addLabel("to the Sun", "gold", false, () => tmp2.set(-6.2, 2.7, 0), "earth");

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 40, 28),
    new THREE.MeshPhongMaterial({ map: paintPlanet("earth"), emissive: 0x102036, emissiveIntensity: 0.25, shininess: 24 }),
  );
  localGroup.add(earth);
  addLabel("Earth", "planet", false, () => tmp2.set(-2.4, -0.4, 0.6), "earth");

  const moonR = 4.7;
  const moonPts = [];
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * Math.PI * 2;
    moonPts.push(new THREE.Vector3(Math.cos(a) * moonR, Math.sin(a) * 0.35, Math.sin(a) * moonR));
  }
  const moonLine = lineOf(moonPts, 0xece4d4, 0.4);
  if (moonLine) localGroup.add(moonLine);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 24, 18),
    new THREE.MeshPhongMaterial({ map: paintPlanet("moon"), shininess: 4 }),
  );
  moon.position.set(Math.cos(0.8) * moonR, 0.3, Math.sin(0.8) * moonR);
  localGroup.add(moon);
  addLabel("Moon", "planet", false, () => moon.getWorldPosition(tmp2), "earth");
  const sites = [[-0.15, 0.2, 0.66], [-0.3, -0.1, 0.6], [-0.05, 0.4, 0.58], [-0.22, -0.28, 0.6]];
  sites.forEach((v, i) => {
    const m = makeDiamond();
    m.scale.setScalar(0.22);
    m.position.copy(new THREE.Vector3(...v).normalize().multiplyScalar(0.74)).add(moon.position);
    localGroup.add(m);
    if (i === 0) addLabel("Apollo 11", "minor", true, () => m.getWorldPosition(tmp2), "earth");
  });
  addLabel("Apollo landing sites", "minor", true, () => moon.getWorldPosition(tmp2).add(new THREE.Vector3(0, -1.3, 0)), "earth");

  const l2 = new THREE.Vector3(6.2, 0.15, 0);
  const halo = [];
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    halo.push(new THREE.Vector3(l2.x + Math.sin(a) * 0.55, Math.sin(a) * 1.15, Math.cos(a) * 1.45));
  }
  const haloLine = lineOf(halo, 0x9cc0e0, 0.7);
  if (haloLine) localGroup.add(haloLine);
  const l2Mark = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x9cc0e0 }),
  );
  l2Mark.position.copy(l2);
  localGroup.add(l2Mark);
  addLabel("Earth L2", "gold", false, () => l2.clone().add(new THREE.Vector3(-1.7, -0.15, 0)), "earth", {
    leader: true,
    anchor: () => l2.clone(),
  });
  const placeL2 = (id, spot, labelAt, hollow) => {
    const meta = byId[id];
    const p = l2.clone().add(new THREE.Vector3(...spot));
    const g = new THREE.Group();
    g.userData.craftId = id;
    g.position.copy(p);
    if (hollow) {
      g.add(new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.36, 24),
        new THREE.MeshBasicMaterial({ color: 0xc9a86a, side: THREE.DoubleSide, depthWrite: false }),
      ));
    } else {
      g.add(makeProbeSprite(false));
    }
    g.traverse((obj) => { obj.userData.craftId = id; });
    localGroup.add(g);
    const textAt = l2.clone().add(new THREE.Vector3(...labelAt));
    addLabel(hollow ? "Roman" : (meta.label || meta.name), hollow ? "gold" : "", false, () => {
      if (!meta.planned && phaseOf(meta, when) === "hidden") return null;
      return textAt;
    }, "earth", { leader: true, anchor: () => g.getWorldPosition(new THREE.Vector3()) });
    g.userData.localFor = id;
  };
  placeL2("jwst", [0.15, 1.55, 0.15], [-2.4, 2.15, 0.2], false);
  placeL2("gaia", [0.15, 0.15, 1.7], [0.2, 0.35, 3.15], false);
  placeL2("euclid", [0.2, -0.15, -1.65], [0.35, -0.2, -3.2], false);
  placeL2("roman", [0.1, -1.55, -0.1], [0.15, -2.55, -0.15], true);
  if (craftGroups.apollo) craftGroups.apollo.visible = false;
}

function marsSpread() {
  const mars = planetGroups.Mars;
  if (!mars || mode !== "solar") return 0.35;
  const d = camera.position.distanceTo(mars.position);
  const t = THREE.MathUtils.clamp(1 - (d - 6) / 36, 0, 1);
  return 0.35 + t * 3.1;
}
function phaseOf(meta, ms) {
  const launch = msOf(meta.launched);
  if (meta.planned) return ms >= launch ? "flight" : "planned";
  if (!launch || ms < launch) return "hidden";
  const end = msOf(meta.ended);
  if (end && ms >= end) return "ended";
  const arrived = msOf(meta.arrived);
  if (arrived && ms < arrived && !tracks[meta.id]) return "hidden";
  return "flight";
}
function placeCraft(meta) {
  const g = craftGroups[meta.id];
  if (!g) return;
  if (meta.id === "apollo") { g.visible = false; return; }
  const phase = phaseOf(meta, when);
  g.visible = phase !== "hidden" && phase !== "planned";
  if (!g.visible) return;
  const ended = phase === "ended";
  g.children[0].visible = !ended;
  g.children[1].visible = ended;
  let pos = null;
  if (!ended && tracks[meta.id] && phase === "flight") {
    const st = sample(meta.id, Math.min(when, tracks[meta.id].ms[tracks[meta.id].ms.length - 1]));
    if (st) pos = project(st.x, st.y, st.z);
  }
  if (!pos && meta.body && planetGroups[meta.body]) {
    pos = planetGroups[meta.body].position.clone();
    const off = meta.offset || [0.6, 0.3, 0.4];
    const spread = meta.cluster === "mars" ? marsSpread() : 1;
    pos.add(new THREE.Vector3(off[0], off[1], off[2]).multiplyScalar(spread));
  } else if (!pos && meta.fixedAu) {
    const lat = meta.fixedLat * DEG;
    const lon = meta.fixedLon * DEG;
    const R = toR(meta.fixedAu);
    pos = new THREE.Vector3(R * Math.cos(lat) * Math.cos(lon), R * Math.sin(lat), R * Math.cos(lat) * Math.sin(lon));
  } else if (!pos && meta.cluster === "mars" && planetGroups.Mars) {
    const off = meta.offset || [0.8, 0.4, 0.5];
    pos = planetGroups.Mars.position.clone().add(new THREE.Vector3(...off).multiplyScalar(marsSpread()));
  } else if (pos && meta.cluster === "mars" && planetGroups.Mars) {
    const off = meta.offset || [0.8, 0.2, 0.4];
    pos.add(new THREE.Vector3(...off).multiplyScalar(marsSpread() * 0.85));
  }
  if (pos) g.position.copy(pos);
  const hotOne = hot === meta.id || selected === meta.id;
  g.scale.setScalar(hotOne ? 1.45 : 1);
}

function updateWorld() {
  for (const planet of PLANETS) {
    const st = planetXYZ(planet.name, when);
    planetGroups[planet.name].position.copy(project(st.x, st.y, st.z));
  }
  trailGroup.clear();
  if (mode === "solar") {
    for (const meta of CRAFT) {
      if (meta.trail === "none" || meta.trail == null) continue;
      if (phaseOf(meta, when) !== "flight") continue;
      const pts = trailVectors(meta, when);
      const line = lineOf(pts, meta.color || (meta.inactive ? 0xb3ab9c : 0xece4d4), meta.inactive ? 0.28 : 0.5);
      if (line) trailGroup.add(line);
    }
  }
  for (const meta of CRAFT) placeCraft(meta);
  localGroup.traverse((obj) => {
    if (!obj.userData.localFor) return;
    const meta = byId[obj.userData.localFor];
    obj.visible = Boolean(meta.planned) || phaseOf(meta, when) !== "hidden";
  });
}

function statusOf(meta, st) {
  if (meta.planned) return { label: "Planned", tone: "planned" };
  if (meta.ended && when >= msOf(meta.ended)) return { label: "Mission ended", tone: "ended" };
  if (meta.inactive) return { label: "Inactive", tone: "quiet" };
  if (meta.id === "voyager1" || meta.id === "voyager2") {
    return st && st.dist > 120
      ? { label: "Interstellar space", tone: "" }
      : { label: "Outer solar system", tone: "quiet" };
  }
  if (meta.earth) return { label: "Sun–Earth L2", tone: "" };
  if (meta.cluster === "mars") return { label: "At Mars", tone: "" };
  if (meta.id === "juno") return { label: "Orbiting Jupiter", tone: "" };
  if (meta.id === "parker" || meta.id === "solarOrbiter") return { label: "Solar orbit", tone: "" };
  return { label: "In flight", tone: "" };
}
function fmtAU(au) {
  if (au == null || Number.isNaN(au)) return "—";
  if (au < 0.01) return `${Math.round(au * 149597870.7).toLocaleString("en-US")} km`;
  if (au < 10) return `${au.toFixed(2)} AU`;
  return `${au.toFixed(1)} AU`;
}
function openCard(id) {
  const meta = byId[id];
  if (!meta) return;
  selected = id;
  hot = id;
  if (meta.earth && mode !== "earth") enterEarth(true);
  if (!meta.earth && mode === "earth") leaveEarth(true);
  document.body.classList.add("card-open");
  $("card").hidden = false;
  const st = tracks[id] ? sample(id, Math.min(when, tracks[id].ms.at(-1))) : null;
  const earth = planetXYZ("Earth", when);
  let sunDist = "—";
  let earthDist = "—";
  let speed = "—";
  if (st && phaseOf(meta, when) === "flight") {
    sunDist = `${fmtAU(st.dist)} from the Sun`;
    earthDist = fmtAU(Math.hypot(st.x - earth.x, st.y - earth.y, st.z - earth.z));
    speed = `${st.speed.toFixed(1)} km/s`;
  } else if (meta.planned) {
    sunDist = "Not yet launched";
    earthDist = "Not yet launched";
  } else if (meta.body) {
    const body = planetXYZ(meta.body, when);
    sunDist = `${fmtAU(body.dist)} (${meta.body})`;
    earthDist = fmtAU(Math.hypot(body.x - earth.x, body.y - earth.y, body.z - earth.z));
  } else if (meta.fixedAu) {
    sunDist = `about ${fmtAU(meta.fixedAu)}`;
  }
  const badge = statusOf(meta, st);
  const badgeEl = $("card-badge");
  badgeEl.textContent = badge.label;
  badgeEl.className = "badge" + (badge.tone ? " " + badge.tone : "");
  $("card-name").textContent = meta.name;
  $("card-sub").textContent = meta.sub;
  const rows = [
    ["Launched", meta.planned ? "About 2027" : meta.launched],
    ["Agency", meta.agency],
    ["Rocket", meta.rocket],
  ];
  if (meta.ended) rows.push(["Ended", meta.ended], ["Fate", meta.fate]);
  rows.push(["From the Sun", sunDist], ["From Earth", earthDist], ["Speed", speed], ["Status", badge.label]);
  const facts = $("card-facts");
  facts.replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    facts.append(dt, dd);
  }
  $("card-fact").textContent = meta.fact;
  dockScroll.querySelectorAll(".row").forEach((row) => {
    row.classList.toggle("is-active", row.dataset.id === id);
    row.setAttribute("aria-pressed", row.dataset.id === id ? "true" : "false");
  });
  dockScroll.querySelector(`.row[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  placeCraft(meta);
}
function closeCard() {
  if (!selected) return;
  const prev = selected;
  selected = null;
  document.body.classList.remove("card-open");
  $("card").hidden = true;
  dockScroll.querySelectorAll(".row").forEach((row) => {
    row.classList.remove("is-active");
    row.setAttribute("aria-pressed", "false");
  });
  if (craftGroups[prev]) craftGroups[prev].scale.setScalar(1);
  $("hover-lines").replaceChildren();
}

function dockIcon(group) {
  if (group === "ended") return `<svg class="row-icon" viewBox="0 0 16 12" aria-hidden="true"><rect x="5" y="3" width="6" height="6" fill="#8a7360" transform="rotate(45 8 6)"/></svg>`;
  if (group === "planned") return `<svg class="row-icon" viewBox="0 0 16 12" aria-hidden="true"><circle cx="8" cy="6" r="3" fill="none" stroke="#c9a86a" stroke-width="1.2"/></svg>`;
  const fill = group === "inactive" ? "#8f8a80" : "#ece4d4";
  return `<svg class="row-icon" viewBox="0 0 16 12" aria-hidden="true"><circle cx="8" cy="6" r="2.5" fill="${fill}"/></svg>`;
}
function buildDock() {
  for (const group of GROUPS) {
    const h = document.createElement("h3");
    h.className = "dock-heading";
    h.textContent = group.title;
    h.id = "group-" + group.id;
    dockScroll.appendChild(h);
    for (const meta of CRAFT.filter((c) => c.group === group.id)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "row";
      btn.dataset.id = meta.id;
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML = `${dockIcon(group.id)}<span class="row-text"><span class="row-name">${meta.name}</span><span class="row-agency">${meta.agency}</span></span>`;
      btn.addEventListener("mouseenter", () => { hot = meta.id; placeCraft(meta); });
      btn.addEventListener("mouseleave", () => { if (hot === meta.id) hot = null; placeCraft(meta); });
      btn.addEventListener("focus", () => { hot = meta.id; placeCraft(meta); });
      btn.addEventListener("click", () => openCard(meta.id));
      dockScroll.appendChild(btn);
    }
  }
}

function formatWhen(ms) {
  return new Date(ms).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function setWhenFromSlider() {
  when = T0 + (Number(slider.value) / 1000) * (T1 - T0);
  const atEnd = Number(slider.value) >= 999;
  $("slider-date").textContent = formatWhen(when);
  $("slider-tag").textContent = atEnd ? "Today" : "";
  slider.setAttribute("aria-valuetext", formatWhen(when));
  updateWorld();
  if (selected) openCard(selected);
}
function buildTicks() {
  const box = $("slider-years");
  box.replaceChildren();
  const endYear = new Date(T1).getUTCFullYear();
  const step = phoneQuery.matches ? 10 : 5;
  const years = [];
  for (let y = 1977; y <= endYear; y += step) years.push(y);
  if (endYear - years[years.length - 1] >= 3) years.push(endYear);
  years.forEach((y, i) => {
    const span = document.createElement("span");
    span.style.left = `${((Date.UTC(y, 0, 1) - T0) / (T1 - T0)) * 100}%`;
    if (i === 0) span.style.transform = "none";
    span.textContent = String(y);
    box.appendChild(span);
  });
}

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const dock = phoneQuery.matches ? 0 : ($("dock").getBoundingClientRect().width || 0);
  camera.setViewOffset(w, h, mode === "solar" ? -dock * 0.42 : -dock * 0.15, 0, w, h);
  camera.updateProjectionMatrix();
  const svg = $("hover-lines");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
}
function applyCamera() {
  if (mode === "earth") {
    camera.position.set(
      earthTarget.x + earthRadius * Math.cos(earthEl) * Math.sin(earthAz),
      earthTarget.y + earthRadius * Math.sin(earthEl),
      earthTarget.z + earthRadius * Math.cos(earthEl) * Math.cos(earthAz),
    );
    camera.lookAt(earthTarget);
  } else {
    camera.position.set(
      target.x + radius * Math.cos(el) * Math.cos(az),
      target.y + radius * Math.sin(el),
      target.z + radius * Math.cos(el) * Math.sin(az),
    );
    camera.lookAt(target);
  }
  resize();
}
function enterEarth(instant) {
  if (mode === "earth" || transitioning) return;
  transitioning = true;
  const veil = $("veil");
  const run = () => {
    solar.visible = false;
    localGroup.visible = true;
    mode = "earth";
    document.body.classList.add("earth");
    trailGroup.visible = false;
    applyCamera();
    for (const meta of CRAFT) if (meta.earth) placeCraft(meta);
    transitioning = false;
  };
  if (instant) { run(); return; }
  veil.style.opacity = "0.45";
  setTimeout(() => { run(); veil.style.opacity = "0"; }, 220);
}
function leaveEarth(instant) {
  if (mode !== "earth" || transitioning) return;
  transitioning = true;
  const run = () => {
    localGroup.visible = false;
    solar.visible = true;
    mode = "solar";
    document.body.classList.remove("earth");
    trailGroup.visible = true;
    radius = Math.max(radius, 55);
    applyCamera();
    updateWorld();
    transitioning = false;
  };
  if (instant) { run(); return; }
  $("veil").style.opacity = "0.45";
  setTimeout(() => { run(); $("veil").style.opacity = "0"; }, 220);
}
function maybeEarth() {
  if (transitioning || !planetGroups.Earth || mode !== "solar") return;
  const earth = planetGroups.Earth.position;
  if (radius < 34 && (target.distanceTo(earth) < 24 || camera.position.distanceTo(earth) < 30)) enterEarth(false);
}

function projectToScreen(vec) {
  tmp.copy(vec).project(camera);
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, z: tmp.z };
}
function labelCandidates(scr) {
  const sun = projectToScreen(new THREE.Vector3(0, 0, 0));
  let ox = scr.x - sun.x;
  let oy = scr.y - sun.y;
  const len = Math.hypot(ox, oy) || 1;
  ox /= len;
  oy /= len;
  const px = -oy;
  const py = ox;
  const out = [];
  for (const dist of [28, 46, 64, 84]) {
    for (const side of [0, 0.85, -0.85, 1.4, -1.4]) {
      out.push([ox * dist + px * side * 16, oy * dist + py * side * 16]);
    }
  }
  return out;
}

function sceneName(id) {
  const meta = byId[id];
  return meta ? (meta.label || meta.name) : "";
}

function layoutLabels() {
  const zoomed = mode === "earth" || radius < 110;
  const boxes = [];
  const dockLeft = phoneQuery.matches ? stage.clientWidth : $("dock").getBoundingClientRect().left;
  const edge = Math.min(dockLeft, stage.clientWidth) - 8;
  const tryPlace = (item, scr, dx, dy, force) => {
    const w = Math.max(42, item.el.offsetWidth || item.text.length * 6.4);
    const rect = { x: scr.x + dx, y: scr.y + dy - 12, w: w + 8, h: 18 };
    const inside = rect.x > 6 && rect.y > 48 && rect.y + rect.h < stage.clientHeight - 62 && rect.x + rect.w < edge;
    const hit = boxes.some((b) => rect.x < b.x + b.w && rect.x + rect.w > b.x && rect.y < b.y + b.h && rect.y + rect.h > b.y);
    if ((!inside || hit) && !force) return false;
    item.el.hidden = false;
    item.el.style.left = `${scr.x}px`;
    item.el.style.top = `${scr.y}px`;
    item.el.style.transform = `translate(${dx}px, ${dy}px)`;
    item.screen = { x: rect.x, y: scr.y + dy };
    boxes.push(rect);
    return true;
  };
  const queue = [];
  for (const item of labelEls) {
    if (item.space === "solar" && mode !== "solar") { item.el.hidden = true; continue; }
    if (item.space === "earth" && mode !== "earth") { item.el.hidden = true; continue; }
    const named = selected && item.text === sceneName(selected);
    const hovered = hot && item.text === sceneName(hot);
    if (item.minor && !(zoomed || named || hovered)) { item.el.hidden = true; continue; }
    const pos = item.getPos();
    if (!pos) { item.el.hidden = true; continue; }
    const scr = projectToScreen(pos);
    if (scr.z < -1 || scr.z > 1) { item.el.hidden = true; continue; }
    queue.push({ item, scr });
  }
  queue.sort((a, b) => (a.item.id ? 1 : 0) - (b.item.id ? 1 : 0));
  for (const { item, scr } of queue) {
    const prefs = item.leader
      ? [[0, -2], [8, -12], [-6, 10]]
      : (item.id ? labelCandidates(scr) : [[10, -14], [12, 12], [-8, -16], [14, 4]]);
    let placed = false;
    for (const [dx, dy] of prefs) {
      if (tryPlace(item, scr, dx, dy, false)) { placed = true; break; }
    }
    if (!placed && !item.minor) {
      let best = prefs[0];
      let bestOverflow = Infinity;
      const w = Math.max(42, item.el.offsetWidth || item.text.length * 6.4);
      for (const [dx, dy] of prefs) {
        const rect = { x: scr.x + dx, y: scr.y + dy - 12, w: w + 8, h: 18 };
        const overflow =
          Math.max(0, 8 - rect.x) +
          Math.max(0, rect.x + rect.w - edge) +
          Math.max(0, 50 - rect.y) +
          Math.max(0, rect.y + rect.h - (stage.clientHeight - 64));
        if (overflow < bestOverflow) { bestOverflow = overflow; best = [dx, dy]; }
      }
      tryPlace(item, scr, best[0], best[1], true);
    } else if (!placed) item.el.hidden = true;
  }
}

function frameSolar() {
  let maxR = toR(128);
  for (const g of Object.values(craftGroups)) {
    if (!g.visible || g.parent !== solar) continue;
    maxR = Math.max(maxR, g.position.length());
  }
  resize();
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const dock = phoneQuery.matches ? 0 : 260;
  const vHalf = (camera.fov * Math.PI) / 360;
  const usableAspect = Math.max(0.4, (w - dock) / Math.max(h, 1));
  const hHalf = Math.atan(Math.tan(vHalf) * usableAspect);
  const dist = Math.max(maxR / Math.tan(vHalf), maxR / Math.tan(hHalf));
  radius = dist * (phoneQuery.matches ? 1.38 : 1.26);
}
function drawConnector() {
  const svg = $("hover-lines");
  svg.replaceChildren();
  drawLeaders(svg);
  if (!selected || !craftGroups[selected] || !craftGroups[selected].visible) return;
  const scr = projectToScreen(craftGroups[selected].getWorldPosition(tmp2));
  stage.style.setProperty("--spot-x", `${scr.x}px`);
  stage.style.setProperty("--spot-y", `${scr.y}px`);
  const card = $("card").getBoundingClientRect();
  const stageBox = stage.getBoundingClientRect();
  const x2 = card.left - stageBox.left;
  const y2 = card.top - stageBox.top + 36;
  const ns = "http://www.w3.org/2000/svg";
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", `M ${scr.x + 10} ${scr.y} C ${(scr.x + x2) / 2} ${scr.y}, ${x2 - 30} ${y2}, ${x2} ${y2}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "rgba(201,168,106,0.75)");
  path.setAttribute("stroke-width", "1");
  svg.appendChild(path);
}

function drawLeaders(svg) {
  if (mode !== "earth") return;
  const ns = "http://www.w3.org/2000/svg";
  for (const item of labelEls) {
    if (!item.leader || item.el.hidden || !item.anchor || !item.screen) continue;
    const a = projectToScreen(item.anchor());
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", a.x.toFixed(1));
    line.setAttribute("y1", a.y.toFixed(1));
    line.setAttribute("x2", item.screen.x.toFixed(1));
    line.setAttribute("y2", item.screen.y.toFixed(1));
    line.setAttribute("stroke", "rgba(201,168,106,0.65)");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);
  }
}

function frame() {
  applyCamera();
  renderer.render(scene, camera);
  layoutLabels();
  drawConnector();
  requestAnimationFrame(frame);
}

function bind() {
  $("zoom-in").addEventListener("click", () => zoomBy(0.82));
  $("zoom-out").addEventListener("click", () => zoomBy(1.22));
  $("today").addEventListener("click", () => { slider.value = "1000"; setWhenFromSlider(); });
  $("card-close").addEventListener("click", closeCard);
  slider.addEventListener("input", setWhenFromSlider);
  $("list-toggle").addEventListener("click", () => {
    const open = document.body.classList.toggle("list-open");
    $("list-toggle").setAttribute("aria-expanded", open ? "true" : "false");
  });
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCard();
      document.body.classList.remove("list-open");
    } else if (event.key === "+" || event.key === "=") zoomBy(0.85);
    else if (event.key === "-" || event.key === "_") zoomBy(1.18);
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? 1.08 : 0.92);
  }, { passive: false });

  const pointers = new Map();
  let drag = null;
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    drag = { x: event.clientX, y: event.clientY, moved: false, button: event.button, az, el, radius, target: target.clone(), earthAz, earthEl, earthTarget: earthTarget.clone() };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (drag.pinch) zoomBy(drag.pinch / dist);
      drag.pinch = dist;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (drag.mid) pan(mx - drag.mid.x, my - drag.mid.y);
      drag.mid = { x: mx, y: my };
      drag.moved = true;
      return;
    }
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (dx * dx + dy * dy > 16) drag.moved = true;
    const panMode = drag.button === 2 || event.shiftKey;
    if (panMode) pan(dx, dy);
    else if (mode === "earth") {
      earthAz = drag.earthAz - dx * 0.005;
      earthEl = THREE.MathUtils.clamp(drag.earthEl + dy * 0.004, -0.6, 1.1);
    } else {
      az = drag.az - dx * 0.005;
      el = THREE.MathUtils.clamp(drag.el + dy * 0.004, -0.2, 1.25);
    }
  });
  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size === 0 && drag && !drag.moved) {
      const picked = pickCraft(event);
      if (picked) openCard(picked);
      else closeCard();
    }
    if (pointers.size === 0) drag = null;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".card, .dock, .controls, .toolbar")) return;
    if (event.target === canvas) return;
    closeCard();
  });
}
function zoomBy(factor) {
  if (mode === "earth") {
    earthRadius = THREE.MathUtils.clamp(earthRadius * factor, 8, 70);
    if (earthRadius > 58) leaveEarth(false);
  } else {
    radius = THREE.MathUtils.clamp(radius * factor, 12, 520);
    maybeEarth();
  }
}
function pan(dx, dy) {
  const dist = mode === "earth" ? earthRadius : radius;
  const scale = dist * 0.0016;
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  camera.updateMatrixWorld();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  const shift = right.multiplyScalar(-dx * scale).add(up.multiplyScalar(dy * scale));
  if (mode === "earth") earthTarget.add(shift);
  else target.add(shift);
}
function pickCraft(event) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  ray.params.Sprite = { threshold: 1.2 };
  const root = mode === "earth" ? localGroup : solar;
  const hits = ray.intersectObjects(root.children, true);
  for (const hit of hits) {
    let obj = hit.object;
    while (obj) {
      if (obj.userData && obj.userData.craftId) return obj.userData.craftId;
      obj = obj.parent;
    }
  }
  return null;
}

async function init() {
  const params = new URLSearchParams(location.search);
  try {
    const res = await fetch(`../data/probes.json?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) prepTracks(await res.json());
  } catch (err) {
    console.warn("No probe ephemeris yet.", err);
  }
  try {
    buildScene();
  } catch (err) {
    console.error(err);
    $("webgl-fail").hidden = false;
    return;
  }
  buildDock();
  buildTicks();
  bind();
  if (params.get("date")) {
    const t = Date.parse(params.get("date") + "T00:00:00Z");
    if (!Number.isNaN(t)) slider.value = String(Math.round(((t - T0) / (T1 - T0)) * 1000));
  } else slider.value = "1000";
  setWhenFromSlider();
  frameSolar();
  if (params.get("view") === "earth") enterEarth(true);
  const open = params.get("open");
  if (open && byId[open]) openCard(open);
  resize();
  document.body.dataset.ready = "1";
  requestAnimationFrame(frame);
}
init();
