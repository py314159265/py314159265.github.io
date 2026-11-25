/* Explorers of the Solar System.
 * Planets are Keplerian, from JPL approximate orbital elements.
 * Spacecraft states come from data/probes.json (JPL Horizons, ecliptic J2000).
 */
(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const DEG = Math.PI / 180;
  const AU_DAY_TO_KMS = 149597870.7 / 86400;
  const DAY = 86400000;
  const T0 = Date.UTC(1977, 0, 1);
  // Piecewise log so the rings, labels, planets, and probes share one radius.
  // 0.08–5 AU, 5–40 AU, and 40–200 AU each get a share of the drawing radius.
  // A single log from 0.04 to 200 piles 65 AU onto 144 AU and parks Voyager on the heliopause.
  const SCALE = [
    { au: 0.08, t: 0 },
    { au: 5, t: 0.22 },
    { au: 40, t: 0.50 },
    { au: 200, t: 1 },
  ];

  // a, e, I, L, longitude of perihelion, longitude of node — value and rate per century.
  // J2000, ecliptic. Earth is the Earth–Moon barycenter, close enough at this scale.
  const ELEMENTS = {
    Mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175], w: [77.45779628, 0.16047689], O: [48.33076593, -0.12534081] },
    Venus:   { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729], w: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
    Earth:   { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], w: [102.93768193, 0.32327364], O: [0, 0] },
    Mars:    { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
    Jupiter: { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], w: [14.72847983, 0.21252668], O: [100.47390909, 0.20469106] },
    Saturn:  { a: [9.53667594, -0.00125060], e: [0.05415060, -0.00036762], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], w: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
    Uranus:  { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], w: [170.95427630, 0.40805281], O: [74.01692503, 0.04240589] },
    Neptune: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], w: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664] },
    Pluto:   { a: [39.48211675, -0.00031596], e: [0.24882730, 0.00005170], I: [17.14001206, 0.00004818], L: [238.92903833, 145.20780515], w: [224.06891629, -0.04062942], O: [110.30393684, -0.01183482] },
  };

  const PLANETS = [
    { name: "Mercury", fill: "#c4b39a", r: 3.0 },
    { name: "Venus", fill: "#e2d0a8", r: 3.6 },
    { name: "Earth", fill: "#9cc0e0", r: 3.8 },
    { name: "Mars", fill: "#e3a283", r: 3.2 },
    { name: "Jupiter", fill: "#e0c28a", r: 6.2 },
    { name: "Saturn", fill: "#e6d5a8", r: 5.4, ring: true },
    { name: "Uranus", fill: "#9ec9c8", r: 4.2 },
    { name: "Neptune", fill: "#6f9fd0", r: 4.1 },
    { name: "Pluto", fill: "#c7bca8", r: 2.2 },
  ];

  const CRAFT = {
    voyager1: {
      name: "Voyager 1", sub: "The farthest of all.",
      launched: "1977-09-05", agency: "NASA / JPL", rocket: "Titan IIIE-Centaur",
      fact: "It is the most distant human-made object. A 23-watt transmitter still answers Earth, the reply taking more than a day to come home.",
      trail: "outbound",
    },
    voyager2: {
      name: "Voyager 2", sub: "The only visit to Uranus and Neptune.",
      launched: "1977-08-20", agency: "NASA / JPL", rocket: "Titan IIIE-Centaur",
      fact: "A grand tour that actually happened: Jupiter, Saturn, Uranus, and Neptune, and then out of the Sun’s bubble.",
      trail: "outbound",
    },
    newHorizons: {
      name: "New Horizons", sub: "Pluto, then onward.",
      launched: "2006-01-19", agency: "NASA / JHUAPL", rocket: "Atlas V 551",
      fact: "It crossed the Pluto system in July 2015 and later flew past Arrokoth, a Kuiper belt world barely 36 kilometers across.",
      trail: "outbound",
    },
    parker: {
      name: "Parker Solar Probe", sub: "Touching the corona.",
      mapName: "Parker",
      launched: "2018-08-12", agency: "NASA / JHUAPL", rocket: "Delta IV Heavy",
      fact: "It dives closer to the Sun than any spacecraft before it, flying through the corona and coming out the other side.",
      trail: "recent",
      recentDays: 48,
      color: "#e3a283",
    },
    starman: {
      name: "Starman", sub: "A car between Earth and Mars.",
      launched: "2018-02-06", agency: "SpaceX", rocket: "Falcon Heavy",
      fact: "The dummy in the driver’s seat is still on the first Falcon Heavy payload: a midnight-cherry Roadster in a long solar orbit.",
      trail: "recent",
      recentDays: 70,
    },
    hayabusa2: {
      name: "Hayabusa2", sub: "Onward to 1998 KY26.",
      launched: "2014-12-03", agency: "JAXA", rocket: "H-IIA",
      fact: "After returning pieces of Ryugu to Earth in 2020, it set off on an extended cruise toward the tiny asteroid 1998 KY26.",
      trail: "recent",
      recentDays: 90,
    },
    juno: {
      name: "Juno", sub: "Circling Jupiter.",
      launched: "2011-08-05", agency: "NASA / JPL", rocket: "Atlas V 551",
      fact: "A solar-powered orbiter mapping Jupiter’s gravity, magnetic field, and the roots of the Great Red Spot.",
      trail: "none",
    },
    jwst: {
      name: "James Webb", sub: "A cold eye at L2.",
      launched: "2021-12-25", agency: "NASA / ESA / CSA", rocket: "Ariane 5",
      fact: "It keeps station around the Sun–Earth L2 point, a million miles from Earth, with its sunshield facing the inner solar system.",
      inset: true,
    },
    roman: {
      name: "Nancy Grace Roman", sub: "Planned for about 2027.",
      mapName: "Roman",
      launched: "2027-05-01", agency: "NASA", rocket: "Falcon Heavy",
      fact: "A wide-field infrared telescope meant to share the Sun–Earth L2 neighborhood with Webb. It has not launched yet.",
      planned: true,
      inset: true,
    },
  };

  const ORDER = ["voyager1", "voyager2", "newHorizons", "parker", "starman", "hayabusa2", "juno", "jwst", "roman"];

  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const sky = $("sky");
  const starsG = $("stars");
  const mapG = $("map");
  const inset = $("inset");
  const slider = $("time");
  const yearsEl = $("slider-years");
  const card = $("card");

  let tracks = {};
  let T1 = Date.now();
  let when = T1;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let originX = 0;
  let originY = 0;
  let R0 = 20;
  let R1 = 280;
  let openId = null;
  let earthScreen = null;

  const svgEl = (name, attrs, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v != null) node.setAttribute(k, String(v));
    }
    (parent || mapG).appendChild(node);
    return node;
  };

  function centuries(ms) {
    const jd = ms / DAY + 2440587.5;
    return (jd - 2451545.0) / 36525;
  }

  function wrapPi(rad) {
    return Math.atan2(Math.sin(rad), Math.cos(rad));
  }

  function kepler(M, e) {
    let E = M;
    for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return E;
  }

  function planetState(name, ms) {
    const el = ELEMENTS[name];
    const T = centuries(ms);
    const a = el.a[0] + el.a[1] * T;
    const e = Math.min(0.95, Math.max(0, el.e[0] + el.e[1] * T));
    const I = (el.I[0] + el.I[1] * T) * DEG;
    const L = (el.L[0] + el.L[1] * T) * DEG;
    const wbar = (el.w[0] + el.w[1] * T) * DEG;
    const Om = (el.O[0] + el.O[1] * T) * DEG;
    const M = wrapPi(L - wbar);
    const E = kepler(M, e);
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    const r = a * (1 - e * Math.cos(E));
    const w = wbar - Om;
    const c = Math.cos(nu + w);
    const s = Math.sin(nu + w);
    const x = r * (Math.cos(Om) * c - Math.sin(Om) * s * Math.cos(I));
    const y = r * (Math.sin(Om) * c + Math.cos(Om) * s * Math.cos(I));
    const z = r * s * Math.sin(I);
    return { x, y, z, dist: Math.hypot(x, y, z), lon: Math.atan2(y, x) };
  }

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

  function toR(au) {
    return R0 + (R1 - R0) * scaleT(au);
  }

  function project(dist, lon) {
    const r = toR(dist);
    return [r * Math.cos(lon), -r * Math.sin(lon)];
  }

  function prepTracks(data) {
    tracks = data && data.probes ? data.probes : {};
    let latest = 0;
    for (const id of Object.keys(tracks)) {
      const tr = tracks[id];
      tr.ms = tr.t.map((d) => Date.parse(d + "T00:00:00Z"));
      if (tr.ms.length) latest = Math.max(latest, tr.ms[tr.ms.length - 1]);
    }
    if (latest > Date.UTC(2020, 0, 1)) T1 = Math.min(Date.now(), latest + 2 * DAY);
    when = T1;
  }

  function sample(id, ms) {
    const tr = tracks[id];
    if (!tr || !tr.ms || !tr.ms.length) return null;
    const launch = Date.parse(CRAFT[id].launched + "T00:00:00Z");
    if (ms < launch || ms < tr.ms[0]) return null;
    const times = tr.ms;
    let hi = 1;
    while (hi < times.length && times[hi] < ms) hi++;
    if (hi >= times.length) hi = times.length - 1;
    const lo = Math.max(0, hi - 1);
    const span = times[hi] - times[lo] || 1;
    const u = Math.min(1, Math.max(0, (ms - times[lo]) / span));
    const mix = (key) => tr[key][lo] + (tr[key][hi] - tr[key][lo]) * u;
    const x = mix("x");
    const y = mix("y");
    const z = mix("z");
    const vx = mix("vx");
    const vy = mix("vy");
    const vz = mix("vz");
    return {
      x, y, z,
      dist: Math.hypot(x, y, z),
      lon: Math.atan2(y, x),
      speed: Math.hypot(vx, vy, vz) * AU_DAY_TO_KMS,
    };
  }

  function trailPoints(id, ms) {
    const tr = tracks[id];
    const meta = CRAFT[id];
    if (!tr || !meta || meta.trail === "none") return [];
    const launch = Date.parse(meta.launched + "T00:00:00Z");
    const raw = [];
    for (let i = 0; i < tr.ms.length; i++) {
      if (tr.ms[i] < launch || tr.ms[i] > ms) continue;
      raw.push({
        ms: tr.ms[i],
        dist: Math.hypot(tr.x[i], tr.y[i], tr.z[i]),
        lon: Math.atan2(tr.y[i], tr.x[i]),
      });
    }
    if (!raw.length) return [];
    let slice = raw;
    if (meta.trail === "recent") {
      const windowMs = (meta.recentDays || 60) * DAY;
      slice = raw.filter((p) => ms - p.ms <= windowMs);
    } else {
      let start = 0;
      let prev = raw[0].dist;
      raw.forEach((p, i) => {
        if (p.dist + 0.35 < prev) start = i;
        prev = p.dist;
      });
      slice = raw.slice(start).filter((p) => p.dist >= 8);
    }
    const now = sample(id, ms);
    if (now) slice.push({ dist: now.dist, lon: now.lon });
    return slice.map((p) => project(p.dist, p.lon));
  }

  function smoothPath(points) {
    if (points.length < 2) return "";
    const fmt = (n) => n.toFixed(1);
    let d = `M ${fmt(points[0][0])} ${fmt(points[0][1])}`;
    if (points.length === 2) {
      return `${d} L ${fmt(points[1][0])} ${fmt(points[1][1])}`;
    }
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2[0])} ${fmt(p2[1])}`;
    }
    return d;
  }

  function drawFadedTrail(points, color) {
    if (points.length < 2) return;
    const parts = Math.min(7, points.length - 1);
    for (let k = 0; k < parts; k++) {
      const a = Math.floor((k * (points.length - 1)) / parts);
      const b = Math.floor(((k + 1) * (points.length - 1)) / parts);
      const slice = points.slice(a, b + 1);
      if (slice.length < 2) continue;
      svgEl("path", {
        d: smoothPath(slice),
        fill: "none",
        stroke: color,
        "stroke-width": 1.2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: (0.07 + 0.48 * ((k + 1) / parts)).toFixed(3),
      }, $("trails"));
    }
  }

  function statusOf(id, state) {
    if (id === "roman") return { label: "Planned", tone: "planned" };
    if (!state) return { label: "En route", tone: "cruise" };
    if (id === "voyager1" || id === "voyager2") {
      return state.dist > 120
        ? { label: "Interstellar space", tone: "go" }
        : { label: "Outer solar system", tone: "cruise" };
    }
    if (id === "newHorizons") {
      return state.dist > 45
        ? { label: "Kuiper Belt", tone: "cruise" }
        : { label: "Cruise", tone: "cruise" };
    }
    if (id === "juno") {
      const jup = planetState("Jupiter", when);
      const d = Math.hypot(state.x - jup.x, state.y - jup.y, state.z - jup.z);
      return d < 0.5
        ? { label: "Orbiting Jupiter", tone: "go" }
        : { label: "Cruise to Jupiter", tone: "cruise" };
    }
    if (id === "parker") return { label: "Solar orbit", tone: "go" };
    if (id === "jwst") return { label: "Sun–Earth L2", tone: "go" };
    if (id === "hayabusa2") return { label: "Cruise to 1998 KY26", tone: "cruise" };
    if (id === "starman") return { label: "Heliocentric orbit", tone: "cruise" };
    return { label: "In flight", tone: "cruise" };
  }

  function fmtAU(au) {
    if (au < 0.01) return `${(au * 149597870.7).toFixed(0)} km`;
    if (au < 1) return `${au.toFixed(3)} AU`;
    if (au < 10) return `${au.toFixed(2)} AU`;
    return `${au.toFixed(1)} AU`;
  }

  function buildStars() {
    starsG.replaceChildren();
    const w = sky.clientWidth || 1280;
    const h = sky.clientHeight || 720;
    sky.setAttribute("viewBox", `0 0 ${w} ${h}`);
    let seed = 314159;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const n = Math.round((w * h) / 4200);
    for (let i = 0; i < n; i++) {
      const r = rnd() < 0.1 ? 1.05 : rnd() < 0.35 ? 0.7 : 0.42;
      svgEl("circle", {
        cx: (rnd() * w).toFixed(1),
        cy: (rnd() * h).toFixed(1),
        r,
        fill: rnd() < 0.08 ? "#c9a86a" : "#ece4d4",
        opacity: (0.18 + rnd() * 0.5).toFixed(3),
      }, starsG);
    }
  }

  function layout() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const phone = w < 720;
    const header = phone ? 76 : 58;
    const foot = phone ? 58 : 74;
    const side = phone ? 8 : 168;
    originX = phone ? w * 0.5 : Math.min(w * 0.46, w - side - 40);
    const top = header + 4;
    const bottom = h - foot - 4;
    originY = (top + bottom) / 2;
    R1 = Math.max(90, Math.min(originX - 12, w - originX - (phone ? 10 : 28), originY - top + (phone ? 36 : 8), bottom - originY + (phone ? 28 : 6)));
    R0 = Math.max(16, R1 * 0.06);
    sky.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }

  function applyTransform() {
    mapG.setAttribute("transform", `translate(${originX + panX} ${originY + panY}) scale(${zoom})`);
  }

  function drawStatic() {
    mapG.replaceChildren();
    const rings = svgEl("g", { id: "rings" });
    const rIn = toR(30);
    const rOut = toR(50);
    svgEl("circle", {
      cx: 0, cy: 0, r: (rIn + rOut) / 2,
      fill: "none",
      stroke: "rgba(156,192,224,0.18)",
      "stroke-width": Math.max(4, rOut - rIn),
      "data-au": "kuiper",
    }, rings);
    for (const name of ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]) {
      const au = ELEMENTS[name].a[0];
      svgEl("circle", {
        cx: 0, cy: 0, r: toR(au).toFixed(2),
        "data-au": au.toFixed(3),
        fill: "none",
        stroke: name === "Earth" ? "rgba(236,228,212,0.28)" : "rgba(236,228,212,0.16)",
        "stroke-width": name === "Earth" ? 1.15 : 0.75,
      }, rings);
    }
    for (const au of [1, 10, 100]) {
      const r = toR(au);
      const ang = 198 * DEG;
      const x = r * Math.cos(ang);
      const y = -r * Math.sin(ang);
      const label = svgEl("text", {
        x, y: y - 5, class: "ring-label", "text-anchor": "middle",
        transform: `translate(${x} ${y - 5}) scale(${1 / zoom}) translate(${-x} ${-(y - 5)})`,
      }, rings);
      label.textContent = au === 1 ? "1 AU" : `${au} AU`;
    }
    svgEl("circle", {
      cx: 0, cy: 0, r: toR(120).toFixed(2),
      "data-au": "120",
      fill: "none",
      stroke: "rgba(156,192,224,0.85)",
      "stroke-width": 1.25,
      "stroke-dasharray": "5 3.5",
    }, rings);
    const hpR = toR(120);
    const hpA = 22 * DEG;
    const hx = hpR * Math.cos(hpA);
    const hy = -hpR * Math.sin(hpA) - 8;
    const hp = svgEl("text", {
      x: hx, y: hy, class: "ring-label", "text-anchor": "middle",
      transform: `translate(${hx} ${hy}) scale(${1 / zoom}) translate(${-hx} ${-hy})`,
    }, rings);
    hp.textContent = "heliopause ~120 AU";

    svgEl("g", { id: "trails" });
    svgEl("g", { id: "bodies" });
    svgEl("g", { id: "sun" });
  }

  const pendingLabels = [];

  function queueLabel(x, y, text, cls, priority) {
    pendingLabels.push({ x, y, text, cls, priority });
  }

  function flushLabels(parent) {
    const phone = stage.clientWidth < 720;
    const floor = phone && zoom < 1.6 ? 2 : 0;
    const items = pendingLabels.filter((lab) => lab.priority >= floor)
      .sort((a, b) => b.priority - a.priority);
    const boxes = [];
    const dirs = [
      [1, -0.2], [1.1, 0.75], [-1, -0.2], [-1.1, 0.75],
      [0.1, -1.3], [0.15, 1.25], [-0.1, -1.3],
      [1.4, 0.15], [-1.4, 0.15], [0.7, -1.15], [-0.75, -1.15],
      [0.7, 1.2], [-0.75, 1.2],
    ];
    for (const lab of items) {
      const font = lab.cls === "probe-label" ? 12 : 11;
      const width = (lab.text.length * font * 0.56) / zoom;
      const height = (font + 4) / zoom;
      const gap = (phone ? 13 : 11) / zoom;
      let kept = false;
      const gaps = [gap, gap * 1.8, gap * 2.6];
      for (const reach of gaps) {
        if (kept) break;
      for (const [dx, dy] of dirs) {
        const len = Math.hypot(dx, dy) || 1;
        const lx = lab.x + (dx / len) * reach;
        const ly = lab.y + (dy / len) * reach;
        const anchor = dx < -0.3 ? "end" : dx > 0.3 ? "start" : "middle";
        const left = anchor === "end" ? lx - width : anchor === "middle" ? lx - width / 2 : lx;
        const box = { left: left - 1 / zoom, top: ly - height, right: left + width + 1 / zoom, bottom: ly + 2 / zoom };
        if (boxes.some((b) => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top)) continue;
        boxes.push(box);
        const node = svgEl("text", {
          x: lx, y: ly, class: lab.cls, "text-anchor": anchor,
          transform: `translate(${lx} ${ly}) scale(${1 / zoom}) translate(${-lx} ${-ly})`,
        }, parent);
        node.textContent = lab.text;
        if (lab.text === "Sun") node.setAttribute("fill", "#c9a86a");
        kept = true;
        break;
      }
      }
      if (!kept && lab.priority >= 3) {
        const node = svgEl("text", {
          x: lab.x + gap, y: lab.y, class: lab.cls, "text-anchor": "start",
          transform: `translate(${lab.x + gap} ${lab.y}) scale(${1 / zoom}) translate(${-(lab.x + gap)} ${-lab.y})`,
        }, parent);
        node.textContent = lab.text;
      }
    }
    pendingLabels.length = 0;
  }

  function drawBodies() {
    const trails = $("trails");
    const bodies = $("bodies");
    const sun = $("sun");
    trails.replaceChildren();
    bodies.replaceChildren();
    sun.replaceChildren();
    earthScreen = null;

    for (const planet of PLANETS) {
      const st = planetState(planet.name, when);
      const [x, y] = project(st.dist, st.lon);
      if (planet.ring) {
        svgEl("ellipse", {
          cx: x, cy: y, rx: 12, ry: 4.4,
          transform: `rotate(-28 ${x} ${y})`,
          fill: "none", stroke: "rgba(230,213,168,0.75)", "stroke-width": 1.2,
        }, bodies);
      }
      svgEl("circle", { cx: x, cy: y, r: planet.r + 3.2, fill: planet.fill, opacity: 0.16 }, bodies);
      svgEl("circle", {
        cx: x, cy: y, r: planet.r, fill: planet.fill, "data-dist": st.dist.toFixed(3),
      }, bodies);
      const major = ["Earth", "Jupiter", "Saturn", "Uranus", "Neptune"].includes(planet.name);
      queueLabel(x, y, planet.name, "planet-label", major ? 2 : 1);
      if (planet.name === "Earth") earthScreen = screenOf(x, y);
    }
    updateLeader();

    for (const id of ORDER) {
      const meta = CRAFT[id];
      if (meta.planned) continue;
      const st = sample(id, when);
      if (!st || meta.inset) continue;
      drawFadedTrail(trailPoints(id, when), meta.color || "rgba(236,228,212,0.95)");
      const [x, y] = project(st.dist, st.lon);
      const g = svgEl("g", {
        class: "probe",
        tabindex: "0",
        role: "button",
        "data-id": id,
        "aria-label": meta.name,
        "aria-expanded": openId === id ? "true" : "false",
      }, bodies);
      svgEl("circle", { cx: x, cy: y, r: 16 / zoom, fill: "transparent", class: "probe-hit" }, g);
      svgEl("circle", {
        cx: x, cy: y, r: 5 / zoom, fill: "#ece4d4", opacity: 0.14, filter: "url(#probeGlow)",
      }, g);
      svgEl("circle", {
        cx: x, cy: y, r: 2.7 / zoom, fill: "#ece4d4", class: "probe-core", filter: "url(#probeGlow)",
        "data-dist": st.dist.toFixed(2),
      }, g);
      if (openId === id) {
        svgEl("circle", {
          cx: x, cy: y, r: 11 / zoom, fill: "none", stroke: "rgba(236,228,212,0.8)", "stroke-width": 1.2 / zoom, class: "probe-ring",
        }, g);
      }
      const outer = id === "voyager1" || id === "voyager2" || id === "newHorizons";
      const bias = {
        hayabusa2: [-1.3, 1.2],
        starman: [0.2, -1.4],
        parker: [1.3, 0.5],
        juno: [-1.3, -0.2],
      }[id];
      const bx = bias ? x + bias[0] * 18 / zoom : x;
      const by = bias ? y + bias[1] * 18 / zoom : y;
      queueLabel(bx, by, meta.mapName || meta.name, "probe-label", outer ? 3 : 1);
      g.addEventListener("click", (event) => {
        event.stopPropagation();
        openCard(id);
      });
      g.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCard(id);
        } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          focusProbe(1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          focusProbe(-1);
        }
      });
    }

    svgEl("circle", { cx: 0, cy: 0, r: 34, fill: "url(#sunGlow)", filter: "url(#sunBlur)", opacity: 0.9 }, sun);
    svgEl("circle", { cx: 0, cy: 0, r: 16, fill: "url(#sunGlow)" }, sun);
    svgEl("circle", { cx: 0, cy: 0, r: 9, fill: "url(#sunCore)" }, sun);
    queueLabel(0, 18 / zoom, "Sun", "planet-label", 4);
    flushLabels(bodies);
  }

  function updateLeader() {
    let leader = document.getElementById("leader");
    if (!leader) {
      leader = svgEl("path", {
        id: "leader",
        fill: "none",
        stroke: "rgba(201,168,106,0.45)",
        "stroke-width": 1,
        "stroke-dasharray": "3 3",
      }, sky);
    }
    if (!earthScreen || stage.clientWidth < 720) {
      leader.setAttribute("d", "");
      return;
    }
    const box = inset.getBoundingClientRect();
    const skyBox = sky.getBoundingClientRect();
    const x2 = box.left - skyBox.left + box.width;
    const y2 = box.top - skyBox.top + box.height * 0.45;
    const x1 = earthScreen.x;
    const y1 = earthScreen.y;
    leader.setAttribute("d", `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${((x1 + x2) / 2).toFixed(1)} ${y1.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }

  function screenOf(x, y) {
    return {
      x: originX + panX + x * zoom,
      y: originY + panY + y * zoom,
    };
  }

  function drawInset() {
    inset.replaceChildren();
    const w = 250;
    const h = 168;
    svgEl("rect", {
      width: w, height: h, rx: 4,
      fill: "rgba(11,15,23,0.9)", stroke: "#273046",
    }, inset);
    const title = svgEl("text", { x: 12, y: 16, class: "inset-title" }, inset);
    title.textContent = "EARTH  –  MOON  –  L2";
    const icy = 86;
    svgEl("circle", { cx: 28, cy: icy, r: 8, fill: "url(#sunCore)" }, inset);
    const sunT = svgEl("text", { x: 28, y: icy + 20, class: "inset-label", "text-anchor": "middle" }, inset);
    sunT.textContent = "Sun";
    svgEl("line", {
      x1: 40, y1: icy, x2: 214, y2: icy,
      stroke: "rgba(236,228,212,0.2)", "stroke-width": 1,
    }, inset);
    const icx = 92;
    svgEl("circle", { cx: icx, cy: icy, r: 8, fill: "#9cc0e0" }, inset);
    const earthT = svgEl("text", { x: icx, y: icy + 28, class: "inset-label", "text-anchor": "middle" }, inset);
    earthT.textContent = "Earth";
    svgEl("circle", {
      cx: icx, cy: icy, r: 22, fill: "none",
      stroke: "rgba(236,228,212,0.3)", "stroke-width": 0.8,
    }, inset);
    svgEl("circle", { cx: icx + 15, cy: icy - 16, r: 2.4, fill: "#ece4d4" }, inset);
    const moonT = svgEl("text", { x: icx + 20, y: icy - 18, class: "inset-label" }, inset);
    moonT.textContent = "Moon";
    const l2x = 176;
    svgEl("line", {
      x1: l2x, y1: icy - 40, x2: l2x, y2: icy + 42,
      stroke: "rgba(201,168,106,0.35)", "stroke-width": 0.8, "stroke-dasharray": "2 2",
    }, inset);
    const l2t = svgEl("text", { x: l2x - 6, y: icy + 4, class: "inset-label", "text-anchor": "end", fill: "#c9a86a" }, inset);
    l2t.textContent = "L2";

    const webb = sample("jwst", when);
    if (webb) {
      const g = svgEl("g", {
        class: "probe", tabindex: "0", role: "button", "data-id": "jwst", "aria-label": "James Webb",
      }, inset);
      svgEl("circle", { cx: l2x, cy: icy - 18, r: 8, fill: "transparent" }, g);
      svgEl("circle", { cx: l2x, cy: icy - 18, r: 2.6, fill: "#ece4d4" }, g);
      const t = svgEl("text", { x: l2x + 8, y: icy - 15, class: "inset-label", fill: "#ece4d4" }, g);
      t.textContent = "James Webb";
      g.addEventListener("click", (event) => { event.stopPropagation(); openCard("jwst"); });
      g.addEventListener("keydown", onProbeKey);
    }

    const roman = svgEl("g", {
      class: "probe", tabindex: "0", role: "button", "data-id": "roman", "aria-label": "Nancy Grace Roman, planned",
    }, inset);
    svgEl("circle", { cx: l2x, cy: icy + 20, r: 8, fill: "transparent" }, roman);
    svgEl("circle", {
      cx: l2x, cy: icy + 20, r: 3.3, fill: "none", stroke: "#c9a86a", "stroke-width": 1.2,
    }, roman);
    const rt = svgEl("text", { x: l2x + 8, y: icy + 18, class: "inset-label", fill: "#c9a86a" }, roman);
    rt.textContent = "Roman";
    const rn = svgEl("text", { x: l2x + 8, y: icy + 30, class: "inset-note" }, roman);
    rn.textContent = "launch ~2027";
    roman.addEventListener("click", (event) => { event.stopPropagation(); openCard("roman"); });
    roman.addEventListener("keydown", onProbeKey);

    const note = svgEl("text", { x: w - 10, y: h - 8, class: "inset-note", "text-anchor": "end" }, inset);
    note.textContent = "not to scale";
  }

  function onProbeKey(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCard(event.currentTarget.dataset.id);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusProbe(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusProbe(-1);
    }
  }

  function visibleProbeIds() {
    return ORDER.filter((id) => {
      const meta = CRAFT[id];
      if (meta.planned) return true;
      if (meta.inset) return Boolean(sample(id, when));
      return Boolean(sample(id, when));
    });
  }

  function focusProbe(dir) {
    const ids = visibleProbeIds();
    const cur = document.activeElement?.dataset?.id;
    let i = ids.indexOf(cur);
    if (i < 0) i = 0;
    const next = ids[(i + dir + ids.length) % ids.length];
    const node = sky.querySelector(`[data-id="${next}"]`) || inset.querySelector(`[data-id="${next}"]`);
    node?.focus();
  }

  function openCard(id) {
    const meta = CRAFT[id];
    if (!meta) return;
    openId = id;
    document.body.classList.add("card-open");
    card.hidden = false;
    const state = meta.planned ? null : sample(id, when);
    const badge = statusOf(id, state);
    const badgeEl = $("card-badge");
    badgeEl.textContent = badge.label;
    badgeEl.dataset.tone = badge.tone;
    $("card-name").textContent = meta.name;
    $("card-sub").textContent = meta.sub;
    const earth = planetState("Earth", when);
    let sunDist = "—";
    let earthDist = "—";
    let speed = "—";
    if (state) {
      sunDist = `${fmtAU(state.dist)} from the Sun`;
      earthDist = fmtAU(Math.hypot(state.x - earth.x, state.y - earth.y, state.z - earth.z));
      speed = `${state.speed.toFixed(1)} km/s`;
    } else if (meta.planned) {
      sunDist = "Not yet launched";
      earthDist = "Not yet launched";
      speed = "—";
    }
    const rows = [
      ["Launched", meta.planned ? "About 2027" : meta.launched],
      ["Agency", meta.agency],
      ["Rocket", meta.rocket],
      ["From the Sun", sunDist],
      ["From Earth", earthDist],
      ["Speed", speed],
      ["Status", badge.label],
    ];
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
    document.querySelectorAll(".probe").forEach((node) => {
      node.setAttribute("aria-expanded", node.dataset.id === id ? "true" : "false");
    });
    drawBodies();
  }

  function closeCard() {
    if (!openId) return;
    openId = null;
    document.body.classList.remove("card-open");
    card.hidden = true;
    document.querySelectorAll(".probe").forEach((node) => node.setAttribute("aria-expanded", "false"));
    drawBodies();
  }

  function formatWhen(ms) {
    return new Date(ms).toLocaleDateString("en-US", {
      month: "long", year: "numeric", timeZone: "UTC",
    });
  }

  function setWhenFromSlider() {
    const u = Number(slider.value) / 1000;
    when = T0 + u * (T1 - T0);
    const atEnd = Number(slider.value) >= 999;
    $("slider-date").textContent = formatWhen(when);
    $("slider-tag").textContent = atEnd ? "Today" : "";
    $("today").setAttribute("aria-pressed", atEnd ? "true" : "false");
    slider.setAttribute("aria-valuetext", formatWhen(when));
    drawBodies();
    drawInset();
    if (openId) openCard(openId);
  }

  function buildYearTicks() {
    yearsEl.replaceChildren();
    const endYear = new Date(T1).getUTCFullYear();
    const phone = stage.clientWidth < 720;
    const step = phone ? 10 : 5;
    const years = [];
    for (let y = 1977; y <= endYear; y += step) years.push(y);
    if (years[years.length - 1] !== endYear && endYear - years[years.length - 1] >= step / 2) {
      years.push(endYear);
    }
    years.forEach((y, i) => {
      const span = document.createElement("span");
      const u = (Date.UTC(y, 0, 1) - T0) / (T1 - T0);
      span.style.left = `${Math.min(100, Math.max(0, u * 100))}%`;
      if (i === 0) span.style.transform = "none";
      span.textContent = String(y);
      yearsEl.appendChild(span);
    });
  }

  function renderAll() {
    layout();
    buildStars();
    drawStatic();
    applyTransform();
    drawBodies();
    drawInset();
    buildYearTicks();
  }

  function zoomBy(factor, clientX, clientY) {
    const rect = sky.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const next = Math.min(14, Math.max(0.7, zoom * factor));
    const k = next / zoom;
    panX = px - originX - k * (px - originX - panX);
    panY = py - originY - k * (py - originY - panY);
    zoom = next;
    drawStatic();
    applyTransform();
    drawBodies();
  }

  function bind() {
    $("zoom-in").addEventListener("click", () => {
      const r = sky.getBoundingClientRect();
      zoomBy(1.25, r.left + r.width / 2, r.top + r.height / 2);
    });
    $("zoom-out").addEventListener("click", () => {
      const r = sky.getBoundingClientRect();
      zoomBy(1 / 1.25, r.left + r.width / 2, r.top + r.height / 2);
    });
    $("today").addEventListener("click", () => {
      slider.value = "1000";
      setWhenFromSlider();
    });
    $("card-close").addEventListener("click", closeCard);
    slider.addEventListener("input", setWhenFromSlider);

    sky.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    }, { passive: false });

    const pointers = new Map();
    let pinch = null;
    let drag = null;
    sky.addEventListener("pointerdown", (event) => {
      if (event.target.closest && event.target.closest(".probe")) return;
      sky.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        drag = { x: event.clientX, y: event.clientY, panX, panY, moved: false };
      }
    });
    sky.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        if (pinch) zoomBy(dist / pinch.dist, midX, midY);
        pinch = { dist };
        drag = null;
        return;
      }
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (dx * dx + dy * dy > 16) drag.moved = true;
        panX = drag.panX + dx;
        panY = drag.panY + dy;
        applyTransform();
      }
    });
    const endPointer = (event) => {
      const wasDrag = drag && drag.moved;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (drag && !drag.moved && !event.target.closest(".probe")) closeCard();
        drag = null;
      }
      void wasDrag;
    };
    sky.addEventListener("pointerup", endPointer);
    sky.addEventListener("pointercancel", endPointer);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeCard();
      else if (event.key === "+" || event.key === "=") {
        const r = sky.getBoundingClientRect();
        zoomBy(1.2, r.left + r.width / 2, r.top + r.height / 2);
      } else if (event.key === "-" || event.key === "_") {
        const r = sky.getBoundingClientRect();
        zoomBy(1 / 1.2, r.left + r.width / 2, r.top + r.height / 2);
      }
    });
    stage.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".card, .controls, .toolbar, .legend, .probe, #sky, .inset")) return;
      closeCard();
    });

    window.addEventListener("resize", () => {
      renderAll();
      if (openId) openCard(openId);
    });
  }

  async function init() {
    try {
      const res = await fetch(`../data/probes.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      prepTracks(await res.json());
    } catch (err) {
      console.warn("Probe ephemeris unavailable; planets only.", err);
      prepTracks(null);
    }
    slider.value = "1000";
    bind();
    renderAll();
    setWhenFromSlider();
  }

  init();
})();
