/* Upcoming Launches — front-end
 * 1. Load bundled data/launches.json (refreshed by GitHub Actions).
 * 2. If that data is a little old, try Launch Library 2 with a short timeout; on success, use it and cache it.
 * 3. If the live call fails, keep the bundled or cached data so the page is never blank.
 * All launch facts come from the API; this file only arranges and displays them.
 */
(() => {
  "use strict";

  const BUNDLED_URL = "./data/launches.json";
  const LIVE_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=40&mode=normal";
  const LIVE_TIMEOUT_MS = 8000;
  const STALE_AFTER_MS = 30 * 60 * 1000;     // try a live refresh only after 30 minutes
  const RETRY_AFTER_MS = 15 * 60 * 1000;     // after a failed live try, wait 15 minutes (API rate limit)
  const CACHE_KEY = "seagle-launches-v1";
  const ATTEMPT_KEY = "seagle-launches-attempt-v1";
  const MAX_LAUNCHES = 30;
  const PAST_GRACE_MS = 60 * 60 * 1000;
  const DONE_STATUS = new Set([3, 4, 7]);
  const IN_FLIGHT = 6;

  const STATUS = {
    1: { label: "Go", tone: "go" },
    2: { label: "TBD", tone: "tbd" },
    3: { label: "Success", tone: "go" },
    4: { label: "Failure", tone: "hold" },
    5: { label: "On Hold", tone: "hold" },
    6: { label: "In Flight", tone: "flight" },
    7: { label: "Partial Failure", tone: "hold" },
    8: { label: "TBC", tone: "tbc" },
  };
  const STATUS_BY_ABBREV = {
    Go: 1, TBD: 2, Success: 3, Failure: 4, Hold: 5,
    "In Flight": 6, "Partial Failure": 7, TBC: 8,
  };

  const $ = (sel) => document.querySelector(sel);
  const timeline = $("#timeline");
  const track = $("#timeline-track");
  const overlay = $("#overlay");
  const overlayPanel = $("#overlay-panel");
  const overlayLive = $("#overlay-live");
  const logMeta = $("#log-meta");

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmtFull = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const fmtDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
  const fmtAxisDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  const fmtMonthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const fmtTime = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const fmtHour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23" });
  const fmtStamp = new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });

  // Fine pointers hover. Headless checks report pointer: none; treat that as hover-capable
  // so a mouse-driven session still previews. Coarse touch pointers tap instead.
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    || window.matchMedia("(pointer: none)").matches;

  let state = { launches: [], updated: null, source: "bundled" };
  let tickTimer = null;
  let activeLaunch = null;
  let activeId = null;
  let restoringFocus = false;

  /* ---------- Data ---------- */

  const get = (obj, ...keys) =>
    keys.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);

  function pickWebcasts(raw) {
    const vids = (Array.isArray(raw.vid_urls) && raw.vid_urls.length
      ? raw.vid_urls
      : get(raw, "mission", "vid_urls")) || [];
    return vids
      .filter((v) => v && typeof v.url === "string")
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, 3)
      .map((v) => ({
        url: v.url,
        title: v.title || null,
        publisher: v.publisher || null,
        type: get(v, "type", "name") || null,
        live: Boolean(v.live),
      }));
  }

  // Same fields as slim() in scripts/fetch_launches.py
  function slimLive(raw) {
    const config = get(raw, "rocket", "configuration") || {};
    const mission = raw.mission || null;
    const image = raw.image || {};
    return {
      id: raw.id,
      slug: raw.slug,
      name: raw.name,
      net: raw.net,
      net_precision: get(raw, "net_precision", "abbrev") || null,
      window_start: raw.window_start || null,
      window_end: raw.window_end || null,
      status: {
        id: get(raw, "status", "id"),
        name: get(raw, "status", "name"),
        abbrev: get(raw, "status", "abbrev"),
      },
      provider: {
        name: get(raw, "launch_service_provider", "name") || null,
        abbrev: get(raw, "launch_service_provider", "abbrev") || null,
      },
      rocket: config.full_name || config.name || null,
      mission: mission ? {
        name: mission.name || null,
        type: mission.type || null,
        description: mission.description || null,
        orbit: get(mission, "orbit", "name") || null,
        orbit_abbrev: get(mission, "orbit", "abbrev") || null,
      } : null,
      pad: {
        name: get(raw, "pad", "name") || null,
        location: get(raw, "pad", "location", "name") || null,
        country: get(raw, "pad", "country", "name") || null,
      },
      webcast_live: Boolean(raw.webcast_live),
      webcasts: pickWebcasts(raw),
      image: image.thumbnail_url || image.image_url || null,
      image_credit: image.credit || null,
    };
  }

  function statusId(l) {
    const id = get(l, "status", "id");
    if (typeof id === "number") return id;
    return STATUS_BY_ABBREV[get(l, "status", "abbrev")] || null;
  }

  function isUpcoming(l, now) {
    const id = statusId(l);
    if (id === IN_FLIGHT) return true;
    if (DONE_STATUS.has(id)) return false;
    const t = Date.parse(l.net);
    if (Number.isNaN(t)) return false;
    return t >= now - PAST_GRACE_MS;
  }

  function prepare(launches) {
    const now = Date.now();
    return (Array.isArray(launches) ? launches : [])
      .filter((l) => l && l.name && l.net && isUpcoming(l, now))
      .sort((a, b) => Date.parse(a.net) - Date.parse(b.net))
      .slice(0, MAX_LAUNCHES);
  }

  function isValidData(d) {
    return d && typeof d === "object" && Array.isArray(d.launches);
  }

  /* ---------- Load ---------- */

  async function loadBundled() {
    try {
      const res = await fetch(`${BUNDLED_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isValidData(data)) throw new Error("Unexpected data shape");
      return data;
    } catch (err) {
      console.warn("Failed to load bundled data:", err);
      return null;
    }
  }

  function readStore(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }
  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Skip if private browsing or storage is full */
    }
  }

  async function loadLive(previous) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT_MS);
    try {
      const res = await fetch(LIVE_URL, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (!raw || !Array.isArray(raw.results)) throw new Error("Unexpected data shape");
      const launches = raw.results.filter((r) => r && typeof r === "object").map(slimLive);
      // mode=normal may omit launch-level webcast links; fill gaps from earlier data
      const prevById = new Map((previous || []).map((l) => [l.id, l]));
      for (const l of launches) {
        const prev = prevById.get(l.id);
        if (!l.webcasts.length && prev && Array.isArray(prev.webcasts)) l.webcasts = prev.webcasts;
      }
      return { updated: new Date().toISOString(), launches };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- Time ---------- */

  function utcParts(d) {
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  }

  // How precise to write the NET. Coarse precision uses UTC so a timezone cannot shift the month.
  function describeNet(l) {
    const d = new Date(l.net);
    const p = l.net_precision;
    const { y, m } = utcParts(d);
    switch (p) {
      case "HR":
        return { text: `${fmtDate.format(d)} around ${fmtHour.format(d)}:00`, precise: true, approx: "Time is accurate to the hour" };
      case "DAY":
        return { text: `${fmtDate.format(d)} (time TBD)`, precise: false, dayKnown: true };
      case "W":
        return { text: `The week of ${fmtDate.format(d)} (date TBD)`, precise: false, dayKnown: false };
      case "M":
        return { text: `${new Date(Date.UTC(y, m - 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} (date TBD)`, precise: false };
      case "Q1": case "Q2": case "Q3": case "Q4":
        return { text: `Q${p[1]} ${y} (date TBD)`, precise: false };
      case "H1": case "H2":
        return { text: `${p === "H1" ? "First" : "Second"} half of ${y} (date TBD)`, precise: false };
      case "Y":
        return { text: `${y} (date TBD)`, precise: false };
      default:
        return { text: fmtFull.format(d), precise: true };
    }
  }

  // Short pair for the axis. Date and time are separate lines; both use the visitor's zone
  // when the day is known, and UTC when only a month or coarser bin is known.
  function axisWhen(l) {
    const d = new Date(l.net);
    const p = l.net_precision;
    const { y, m } = utcParts(d);
    switch (p) {
      case "HR":
        return { date: fmtAxisDate.format(d), time: `around ${fmtHour.format(d)}:00` };
      case "DAY":
        return { date: fmtAxisDate.format(d), time: "time TBD" };
      case "W":
        return { date: `Week of ${fmtMonthDay.format(d)}`, time: "date TBD" };
      case "M":
        return {
          date: new Date(Date.UTC(y, m - 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
          time: "date TBD",
        };
      case "Q1": case "Q2": case "Q3": case "Q4":
        return { date: `Q${p[1]} ${y}`, time: "date TBD" };
      case "H1": case "H2":
        return { date: `${p} ${y}`, time: "date TBD" };
      case "Y":
        return { date: String(y), time: "date TBD" };
      default:
        return { date: fmtAxisDate.format(d), time: fmtTime.format(d) };
    }
  }

  function windowText(l) {
    if (!l.window_start || !l.window_end || l.window_start === l.window_end) return null;
    const s = new Date(l.window_start);
    const e = new Date(l.window_end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    const sameDay = s.toDateString() === e.toDateString();
    return sameDay
      ? `${fmtTime.format(s)} – ${fmtTime.format(e)}`
      : `${fmtFull.format(s)} – ${fmtFull.format(e)}`;
  }

  /* ---------- Silhouettes ----------
   * Icons share one height so the axis stays straight. Each drawing is in meters,
   * so the aspect ratio matches the real vehicle. Falcon 9 Block 5 is the strict one:
   * 70 m × 3.7 m body (about 19:1), 13.1 m × 5.2 m fairing, black interstage,
   * four grid fins, four folded legs, flat nine-engine base.
   */

  const SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null) node.setAttribute(k, String(v));
    }
    return node;
  }
  function r2(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }
  function pathEl(pts, cls = "rk-body") {
    const d = pts.map((p, i) => `${i ? "L" : "M"}${r2(p[0])},${r2(p[1])}`).join("") + "Z";
    return svgEl("path", { class: cls, d });
  }
  function outline(right) {
    const pts = right.slice();
    for (let i = right.length - 1; i >= 0; i--) pts.push([-right[i][0], right[i][1]]);
    return pts;
  }
  function ogive(y0, y1, r0, r1, power = 1, steps = 16) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const s = Math.pow(Math.sin((t * Math.PI) / 2), power);
      pts.push([r0 + (r1 - r0) * s, y0 + (y1 - y0) * t]);
    }
    return pts;
  }
  function makeSvg(halfW, height) {
    const top = 0.45;
    return svgEl("svg", {
      class: "rocket-svg",
      viewBox: `${r2(-halfW)} ${r2(-top)} ${r2(halfW * 2)} ${r2(height + top)}`,
      focusable: "false",
      "aria-hidden": "true",
    });
  }
  function inkRect(x, y, w, h, cls = "rk-ink") {
    return svgEl("rect", {
      class: cls,
      x: r2(x), y: r2(y),
      width: r2(Math.max(0.04, w)),
      height: r2(Math.max(0.04, h)),
    });
  }

  function gridFin(x, y, w, h, face) {
    const g = svgEl("g", {});
    g.append(svgEl("rect", {
      class: face ? "rk-ink" : "rk-body",
      x: r2(x), y: r2(y), width: r2(w), height: r2(h), rx: "0.05",
    }));
    const stroke = face ? "rk-grid-light" : "rk-grid";
    for (let i = 1; i <= 3; i++) {
      const xx = x + (w * i) / 4;
      const yy = y + (h * i) / 4;
      g.append(svgEl("line", {
        class: stroke, x1: r2(xx), x2: r2(xx), y1: r2(y + 0.08), y2: r2(y + h - 0.08),
      }));
      g.append(svgEl("line", {
        class: stroke, x1: r2(x + 0.08), x2: r2(x + w - 0.08), y1: r2(yy), y2: r2(yy),
      }));
    }
    return g;
  }

  // Four folded leg covers lying on the body, so the tube stays constant-diameter.
  function addLegs(parent, y0, y1, bodyR) {
    const h = Math.max(0.2, y1 - y0);
    const w = bodyR * 0.3;
    const xs = [
      -bodyR + bodyR * 0.08,
      -bodyR * 0.36,
      bodyR * 0.06,
      bodyR - w - bodyR * 0.08,
    ];
    for (const x of xs) {
      const leg = inkRect(x, y0, w, h);
      leg.setAttribute("rx", r2(Math.min(0.2, w * 0.45)));
      parent.append(leg);
    }
  }

  // Side view of the octaweb: nine Merlin bells, mouths aligned on a flat base.
  function addOctaweb(parent, y0, y1, bodyR) {
    const h = y1 - y0;
    parent.append(inkRect(-bodyR, y0, bodyR * 2, h * 0.28));
    const bot = y1 - 0.04;
    // Back row of the ring, then the three bells that face the camera, center longest.
    const bells = [
      [-1.48, 0.46, 0.42],
      [-0.92, 0.4, 0.5],
      [-0.42, 0.36, 0.55],
      [0.08, 0.36, 0.55],
      [0.52, 0.4, 0.5],
      [1.02, 0.46, 0.42],
      [-1.12, 0.64, 0.22],
      [-0.34, 0.72, 0.08],
      [0.5, 0.64, 0.22],
    ];
    for (const [x, w, inset] of bells) {
      const top = y0 + inset * h;
      const flare = w * 0.06;
      const left = Math.max(-bodyR + 0.05, x - flare);
      const right = Math.min(bodyR - 0.05, x + w + flare);
      const d = `M${r2(x)},${r2(top)} L${r2(x + w)},${r2(top)} L${r2(right)},${r2(bot)} L${r2(left)},${r2(bot)} Z`;
      parent.append(svgEl("path", { class: "rk-bell", d }));
    }
  }

  function addFalconFins(parent, y, bodyR, mode) {
    const fh = 1.48;
    const fw = 1.22;
    // Outboard fins are the left/right pair in side view. Face fins are the pair aimed
    // at the camera, drawn on the body. A single stick shows all four. A Heavy side
    // booster omits the inboard fin so it does not intersect its neighbor.
    if (mode === "all" || mode === "left") parent.append(gridFin(-bodyR - fw, y + 0.06, fw, fh, false));
    if (mode === "all" || mode === "right") parent.append(gridFin(bodyR, y + 0.06, fw, fh, false));
    if (mode !== "left" && mode !== "right") {
      parent.append(gridFin(-1.22, y + 0.22, 1.12, 1.32, true));
      parent.append(gridFin(0.1, y + 0.22, 1.12, 1.32, true));
    } else {
      parent.append(gridFin(-0.58, y + 0.2, 1.16, 1.3, true));
    }
  }

  // Block 5 in meters. nose-left / nose-right are Falcon Heavy side boosters:
  // same core and engines, pointed nose cone, no upper stage and no wide fairing.
  function appendFalcon(parent, cx, mode) {
    const bodyR = 1.85;
    const g = svgEl("g", { transform: `translate(${r2(cx)} 0)` });
    const dragon = mode === "dragon";
    const side = mode === "nose-left" || mode === "nose-right";
    const H = dragon ? 65.7 : 70;
    const fairingH = 13.1;
    const s2 = 12.6;
    const isH = 5.6;
    const fairingR = 2.6;

    let right;
    let finY;
    if (side) {
      const yTip = 16.2;
      const yNoseEnd = 24.6;
      right = ogive(yTip, yNoseEnd, 0, bodyR, 1.08);
      right.push([bodyR, H]);
      g.append(pathEl(outline(right)));
      g.append(inkRect(-bodyR, yNoseEnd, bodyR * 2, 0.65));
      finY = yNoseEnd + 0.85;
    } else if (dragon) {
      // Crew/Cargo Dragon: blunt capsule, 4 m heat shield, black trunk, then the same booster.
      right = ogive(0, 1.7, 0, 1.2, 0.5);
      right.push([1.55, 2.55], [1.9, 3.55], [2.02, 4.35], [2.02, 4.75], [bodyR, 5.1], [bodyR, H]);
      g.append(pathEl(outline(right)));
      g.append(inkRect(-bodyR, 5.1, bodyR * 2, 8.1 - 5.1));
      const yIS = 8.1 + s2;
      g.append(inkRect(-bodyR, yIS, bodyR * 2, isH));
      finY = yIS + isH + 0.4;
    } else {
      const ogiveH = 7.6;
      const boat = 1.45;
      right = ogive(0, ogiveH, 0, fairingR, 0.9);
      right.push([fairingR, fairingH - boat]);
      right.push([bodyR, fairingH]);
      right.push([bodyR, H]);
      g.append(pathEl(outline(right)));
      const yIS = fairingH + s2;
      g.append(inkRect(-bodyR, yIS, bodyR * 2, isH));
      finY = yIS + isH + 0.4;
    }

    const finMode = mode === "nose-left" ? "left" : mode === "nose-right" ? "right" : mode === "face" ? "face" : "all";
    addFalconFins(g, finY, bodyR, finMode);

    const yOcta = H - 1.65;
    addLegs(g, yOcta - 8.05, yOcta, bodyR);
    addOctaweb(g, yOcta, H, bodyR);
    parent.append(g);
    return H;
  }

  function drawFalcon9(mode) {
    const H = mode === "dragon" ? 65.7 : 70;
    const half = 1.85 + 1.25 + 0.4;
    const svg = makeSvg(half, H);
    appendFalcon(svg, 0, mode === "dragon" ? "dragon" : "fairing");
    return svg;
  }

  function drawFalconHeavy() {
    const H = 70;
    const dx = 4.2;
    const half = dx + 1.85 + 1.25 + 0.35;
    const svg = makeSvg(half, H);
    appendFalcon(svg, -dx, "nose-left");
    appendFalcon(svg, dx, "nose-right");
    appendFalcon(svg, 0, "face");
    return svg;
  }

  function drawStarship() {
    const H = 121;
    const r = 4.5;
    const reach = 3.3;
    const svg = makeSvg(r + reach + 0.4, H);
    const right = ogive(0, 18, 0, r, 1.2);
    right.push([r, H]);
    svg.append(pathEl(outline(right)));
    const flap = (xInner, xOuter, y, h) => {
      const d = [
        `M${r2(xInner)},${r2(y + h * 0.1)}`,
        `L${r2(xOuter)},${r2(y)}`,
        `L${r2(xOuter)},${r2(y + h)}`,
        `L${r2(xInner)},${r2(y + h * 0.92)}`,
        "Z",
      ].join("");
      return svgEl("path", { class: "rk-body", d });
    };
    svg.append(flap(-r, -r - reach, 22, 15));
    svg.append(flap(r, r + reach, 22, 15));
    svg.append(flap(-r, -r - reach * 0.82, 40, 11));
    svg.append(flap(r, r + reach * 0.82, 40, 11));
    svg.append(inkRect(-r, 49.75, r * 2, 0.5));
    svg.append(gridFin(-r - 1.7, 51.1, 1.7, 2.4, false));
    svg.append(gridFin(r, 51.1, 1.7, 2.4, false));
    svg.append(gridFin(-1.35, 51.35, 1.2, 2.05, true));
    svg.append(gridFin(0.15, 51.35, 1.2, 2.05, true));
    svg.append(inkRect(-r, H - 3.1, r * 2, 3.1));
    return svg;
  }

  function drawSoyuz() {
    const H = 46.3;
    const svg = makeSvg(5.45, H);
    const right = [
      [0, 0.15],
      [0.5, 1.3],
      [1.2, 3.4],
      [1.72, 6.5],
      [1.85, 8.8],
      [1.45, 11.2],
      [1.48, 14.5],
      [1.48, 26.7],
      [2.2, 29.4],
      [3.35, 34.6],
      [4.6, 40.4],
      [5.15, 43.8],
      [4.72, H],
    ];
    svg.append(pathEl(outline(right)));
    const seam = (sign) => svgEl("path", {
      class: "rk-seam",
      d: `M${r2(sign * 1.5)},27.3 L${r2(sign * 1.62)},34 L${r2(sign * 1.85)},41 L${r2(sign * 2.05)},45.2`,
    });
    const cone = (sign) => svgEl("path", {
      class: "rk-seam",
      d: `M${r2(sign * 1.55)},27.6 Q${r2(sign * 3.2)},31 ${r2(sign * 4.45)},37.2`,
    });
    svg.append(seam(1), seam(-1), cone(1), cone(-1));
    return svg;
  }

  function drawStepped(H, steps) {
    let maxR = 0.4;
    for (const [x] of steps) maxR = Math.max(maxR, x);
    const svg = makeSvg(maxR + 0.35, H);
    svg.append(pathEl(outline(steps)));
    return svg;
  }

  function boosterCenters(spec) {
    const b = spec.boosters;
    const outer = spec.bodyR + (b.gap ?? 0.16) + b.radius;
    if (b.count <= 2) {
      return [
        { x: -outer, scale: 1, shift: 0 },
        { x: outer, scale: 1, shift: 0 },
      ];
    }
    if (b.count === 4) {
      return [
        { x: -(outer + b.radius * 0.42), scale: 0.94, shift: 0.7 },
        { x: -outer + b.radius * 0.05, scale: 1, shift: 0 },
        { x: outer - b.radius * 0.05, scale: 1, shift: 0 },
        { x: outer + b.radius * 0.42, scale: 0.94, shift: 0.7 },
      ];
    }
    const places = [];
    for (const sign of [-1, 1]) {
      places.push(
        { x: sign * outer, scale: 1, shift: 0 },
        { x: sign * (outer - b.radius * 0.65), scale: 0.88, shift: 0.85 },
        { x: sign * (spec.bodyR * 0.15 + b.radius * 0.2), scale: 0.8, shift: 1.5 },
      );
    }
    return places;
  }

  function paintBooster(svg, spec, item) {
    const b = spec.boosters;
    const rad = b.radius * item.scale;
    const yTip = spec.H - b.length + item.shift;
    const yBase = spec.H;
    const nose = Math.min((yBase - yTip) * 0.34, rad * 2.6);
    const right = ogive(yTip, yTip + nose, 0, rad, 0.88);
    right.push([rad, yBase - Math.min(0.7, rad * 0.4)]);
    right.push([rad * 0.8, yBase]);
    const g = svgEl("g", { transform: `translate(${r2(item.x)} 0)` });
    g.append(pathEl(outline(right)));
    svg.append(g);
  }

  function addSpire(svg, h) {
    const right = [
      [0, 0],
      [0.14, h * 0.5],
      [0.34, h * 0.78],
      [0.62, h],
    ];
    svg.append(pathEl(outline(right)));
    svg.append(inkRect(-1.05, h * 0.58, 0.62, 0.16, "rk-body"));
    svg.append(inkRect(0.43, h * 0.58, 0.62, 0.16, "rk-body"));
  }

  function noseProfile(y0, H, noseR, bodyR, noseH, power) {
    const wider = noseR > bodyR + 0.04;
    const boat = wider ? Math.min(1.5, noseH * 0.12) : 0;
    const cyl = Math.max(noseH * (wider ? 0.24 : 0.3), 0.45);
    let ogH = noseH - boat - cyl;
    if (ogH < noseH * 0.4) ogH = noseH * 0.58;
    const pts = ogive(y0, y0 + ogH, 0, noseR, power);
    const yJoin = y0 + noseH - boat;
    if (yJoin > y0 + ogH + 0.08) pts.push([noseR, yJoin]);
    if (boat > 0) pts.push([bodyR, y0 + noseH]);
    pts.push([bodyR, H]);
    return pts;
  }

  function drawVehicle(spec) {
    const fairingR = spec.fairingR ?? spec.bodyR;
    const fairingH = spec.fairingH ?? Math.min(spec.H * 0.22, 12);
    let half = Math.max(spec.bodyR, fairingR);
    if (spec.boosters) {
      for (const c of boosterCenters(spec)) {
        half = Math.max(half, Math.abs(c.x) + spec.boosters.radius * c.scale);
      }
    }
    const svg = makeSvg(half + 0.4, spec.H);
    if (spec.boosters) {
      const items = boosterCenters(spec).slice().sort((a, b) => b.shift - a.shift);
      for (const item of items) paintBooster(svg, spec, item);
    }
    const y0 = spec.spire || 0;
    svg.append(pathEl(outline(noseProfile(y0, spec.H, fairingR, spec.bodyR, fairingH, spec.nosePower ?? 1))));
    if (spec.spire) addSpire(svg, spec.spire);
    if (spec.stageYs) {
      for (const y of spec.stageYs) svg.append(inkRect(-spec.bodyR, y, spec.bodyR * 2, 0.16));
    }
    if (spec.legs) {
      const cap = spec.baseCap || 1;
      addLegs(svg, spec.H - spec.legs - cap, spec.H - cap, spec.bodyR);
    }
    if (spec.baseCap) svg.append(inkRect(-spec.bodyR, spec.H - spec.baseCap, spec.bodyR * 2, spec.baseCap));
    return svg;
  }

  // Published (or, for Mir, approximate) dimensions. Heights are meters.
  const SPECS = {
    electron: { H: 18, bodyR: 0.6, fairingH: 2.6, nosePower: 1.35, baseCap: 0.32, stageYs: [7.4] },
    spectrum: { H: 28, bodyR: 1, fairingR: 1.08, fairingH: 5.2, baseCap: 0.5, stageYs: [12.2] },
    neutron: { H: 40, bodyR: 3.5, fairingH: 11, nosePower: 0.62, legs: 7.5, baseCap: 1.2 },
    lm2d: { H: 41.06, bodyR: 1.675, fairingR: 1.8, fairingH: 7.6, baseCap: 0.65, stageYs: [24] },
    lm12: { H: 62, bodyR: 1.9, fairingR: 2.15, fairingH: 13, baseCap: 0.75, stageYs: [38] },
    lm8: {
      H: 50.5, bodyR: 1.675, fairingR: 2.6, fairingH: 12.5, nosePower: 0.9, baseCap: 0.65,
      boosters: { count: 2, length: 26, radius: 1.13, gap: 0.18 },
    },
    lm2f: {
      H: 62, bodyR: 1.675, fairingR: 2.0, fairingH: 9.5, nosePower: 0.85, spire: 9.2, baseCap: 0.55,
      boosters: { count: 4, length: 15.6, radius: 1.13, gap: 0.15 },
    },
    lm5: {
      H: 57, bodyR: 2.5, fairingR: 2.7, fairingH: 12.5, baseCap: 0.8,
      boosters: { count: 4, length: 27, radius: 1.7, gap: 0.2 },
    },
    ariane62: {
      H: 63, bodyR: 2.7, fairingH: 20, nosePower: 0.95, baseCap: 0.75,
      boosters: { count: 2, length: 16, radius: 1.7, gap: 0.2 },
    },
    ariane64: {
      H: 63, bodyR: 2.7, fairingH: 20, nosePower: 0.95, baseCap: 0.75,
      boosters: { count: 4, length: 16, radius: 1.7, gap: 0.2 },
    },
    h3: {
      H: 63, bodyR: 2.6, fairingH: 13, nosePower: 1.15, baseCap: 0.7,
      boosters: { count: 2, length: 15, radius: 1.25, gap: 0.18 },
    },
    "h3-4": {
      H: 63, bodyR: 2.6, fairingH: 13, nosePower: 1.15, baseCap: 0.7,
      boosters: { count: 4, length: 15, radius: 1.25, gap: 0.18 },
    },
    "h3-0": { H: 63, bodyR: 2.6, fairingH: 13, nosePower: 1.15, baseCap: 0.7 },
    pslv: {
      H: 44, bodyR: 1.4, fairingR: 1.6, fairingH: 8.5, nosePower: 0.9, baseCap: 0.4, stageYs: [21, 31],
      boosters: { count: 6, length: 13.5, radius: 0.5, gap: 0.1 },
    },
    lvm3: {
      H: 43.5, bodyR: 2.0, fairingR: 2.5, fairingH: 11.5, nosePower: 0.72, baseCap: 0.65,
      boosters: { count: 2, length: 22, radius: 1.6, gap: 0.16 },
    },
    "new-glenn": { H: 98, bodyR: 3.5, fairingH: 21, nosePower: 1, legs: 11, baseCap: 1.4 },
    vulcan: {
      H: 61.6, bodyR: 2.7, fairingH: 16, baseCap: 0.75,
      boosters: { count: 2, length: 14, radius: 1.0, gap: 0.2 },
    },
    // Provisional small solid. Public dimensions are not settled; kept narrow and staged.
    mir: { H: 22, bodyR: 0.78, fairingH: 3.6, nosePower: 1.1, stageYs: [8.2, 14.6], baseCap: 0.3 },
    generic: { H: 46, bodyR: 1.9, fairingR: 2.15, fairingH: 9.5, baseCap: 0.65, stageYs: [26] },
  };

  const VEGA_STEPS = [
    [0, 0], [0.85, 2.4], [1.5, 6.2], [1.5, 8.6],
    [1.15, 9.5], [1.15, 14.2],
    [1.35, 15.2], [1.35, 22.4],
    [1.7, 23.4], [1.7, 34.8],
  ];
  const KZ_STEPS = [
    [0, 0], [0.75, 2.4], [1.05, 5.2], [1.05, 8.2],
    [0.95, 8.6], [0.95, 13.2],
    [1.1, 13.6], [1.1, 19.2],
    [1.2, 19.6], [1.2, 25.2],
  ];

  function vehicleKind(launch) {
    const rocket = String(launch.rocket || "").toLowerCase();
    if (rocket.includes("falcon heavy")) return "falcon-heavy";
    if (rocket.includes("falcon 9") || rocket.includes("falcon9")) {
      const mission = `${launch.name || ""} ${get(launch, "mission", "name") || ""} ${get(launch, "mission", "type") || ""}`.toLowerCase();
      if (/\bdragon\b|\bcrew[-\s]?\d|\baxiom\b|\bax[-\s]?\d/.test(mission)) return "falcon-dragon";
      return "falcon9";
    }
    if (rocket.includes("starship") || rocket.includes("super heavy")) return "starship";
    if (rocket.includes("electron")) return "electron";
    if (rocket.includes("neutron")) return "neutron";
    if (rocket.includes("soyuz")) return "soyuz";
    if (rocket.includes("vega")) return "vega";
    if (rocket.includes("ariane")) return /64/.test(rocket) ? "ariane64" : "ariane62";
    if (/\bh-?3\b/.test(rocket)) {
      const m = rocket.match(/h-?3[-\s]?(\d)(\d)/);
      const n = m ? Number(m[2]) : 2;
      if (n >= 4) return "h3-4";
      if (n === 0) return "h3-0";
      return "h3";
    }
    if (rocket.includes("pslv")) return "pslv";
    if (/gslv|lvm3|lvm-3|mark-3|mk\s?iii|mk\s?3/.test(rocket)) return "lvm3";
    if (/long march|chang zheng|\bcz[-\s]?\d/.test(rocket)) {
      if (/2f/.test(rocket)) return "lm2f";
      if (/8a|\b8\b/.test(rocket)) return "lm8";
      if (/\b12\b/.test(rocket)) return "lm12";
      if (/\b11\b/.test(rocket)) return "kuaizhou";
      if (/(?:^|[^0-9])(5b|5|7a|7)(?:[^0-9]|$)/.test(rocket)) return "lm5";
      return "lm2d";
    }
    if (rocket.includes("spectrum")) return "spectrum";
    if (rocket.includes("kuaizhou") || rocket.includes("kuai zhou")) return "kuaizhou";
    if (rocket.includes("new glenn")) return "new-glenn";
    if (rocket.includes("vulcan")) return "vulcan";
    if (rocket.trim() === "mir") return "mir";
    return "generic";
  }

  function silhouette(launch) {
    const kind = vehicleKind(launch);
    if (kind === "falcon9") return drawFalcon9("fairing");
    if (kind === "falcon-dragon") return drawFalcon9("dragon");
    if (kind === "falcon-heavy") return drawFalconHeavy();
    if (kind === "starship") return drawStarship();
    if (kind === "soyuz") return drawSoyuz();
    if (kind === "vega") return drawStepped(34.8, VEGA_STEPS);
    if (kind === "kuaizhou") return drawStepped(25.2, KZ_STEPS);
    return drawVehicle(SPECS[kind] || SPECS.generic);
  }

  /* ---------- Render ---------- */

  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null) node.setAttribute(k, v);
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function safeUrl(u) {
    try {
      const url = new URL(u);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch {
      return null;
    }
  }

  function missionTitle(l) {
    if (l.mission && l.mission.name) return l.mission.name;
    const parts = String(l.name).split(" | ");
    return parts.length > 1 ? parts.slice(1).join(" | ") : l.name;
  }

  function badge(l) {
    const id = statusId(l);
    const s = STATUS[id] || { label: get(l, "status", "name") || "Unknown", tone: "tbd" };
    const b = el("span", { class: "badge", "data-tone": s.tone }, s.label);
    if (get(l, "status", "name")) b.title = l.status.name;
    return b;
  }

  function fillFacts(dl, l) {
    const rows = [];
    if (l.rocket) rows.push(["Rocket", l.rocket]);
    if (get(l, "provider", "name")) rows.push(["Provider", l.provider.name]);
    const pad = [get(l, "pad", "name"), get(l, "pad", "location")].filter(Boolean).join(", ");
    if (pad) rows.push(["Pad", pad]);
    const orbit = get(l, "mission", "orbit");
    if (orbit) {
      const ab = get(l, "mission", "orbit_abbrev");
      rows.push(["Orbit", ab && ab !== orbit && ab !== "N/A" ? `${orbit} (${ab})` : orbit]);
    }
    const type = get(l, "mission", "type");
    if (type) rows.push(["Mission type", type]);
    const win = describeNet(l).precise ? windowText(l) : null;
    if (win) rows.push(["Launch window", win]);
    for (const [k, v] of rows) {
      dl.append(el("dt", {}, k), el("dd", {}, v));
    }
  }

  function webcastLinks(container, l) {
    const list = Array.isArray(l.webcasts) ? l.webcasts : [];
    list.forEach((w, i) => {
      const href = safeUrl(w.url);
      if (!href) return;
      let label = i === 0 ? "Watch" : "Other webcast";
      if (w.type === "Official Webcast") label = "Official webcast";
      const a = el("a", {
        class: "watch", href, target: "_blank", rel: "noopener noreferrer",
        title: [w.publisher, w.title].filter(Boolean).join(" — ") || null,
        "data-live": String(Boolean(w.live || (i === 0 && l.webcast_live))),
      }, w.publisher ? `${label}: ${w.publisher}` : label);
      container.append(a);
    });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function updateCountdown(l) {
    const box = document.getElementById("countdown");
    if (!box || !l) return;
    const net = describeNet(l);
    const diff = Date.parse(l.net) - Date.now();
    const id = statusId(l);

    let message = null;
    if (id === IN_FLIGHT) message = "The vehicle is in flight.";
    else if (id === 5) message = "The launch is on hold, waiting for a new time.";
    else if (!net.precise) message = net.dayKnown ? "The exact time has not been announced; the countdown will start when it is." : "The date is not yet set; the countdown will start when it is.";
    else if (diff <= 0) message = "The scheduled time has arrived. Waiting for an update.";

    if (message) {
      if (box.dataset.mode !== "msg" || box.textContent !== message) {
        box.dataset.mode = "msg";
        box.replaceChildren(el("p", { class: "countdown-message" }, message));
      }
      return;
    }

    const s = Math.floor(diff / 1000);
    const parts = [
      [Math.floor(s / 86400), "days"],
      [pad2(Math.floor((s % 86400) / 3600)), "hrs"],
      [pad2(Math.floor((s % 3600) / 60)), "min"],
      [pad2(s % 60), "sec"],
    ];
    if (box.dataset.mode !== "timer") {
      box.dataset.mode = "timer";
      box.replaceChildren();
      const grid = el("div", { class: "countdown", role: "timer", "aria-label": "Countdown to launch" });
      for (const [, label] of parts) {
        const unit = el("div", { class: "countdown-unit" });
        unit.append(el("span", { class: "countdown-num" }), el("span", { class: "countdown-label" }, label));
        grid.append(unit);
      }
      box.append(grid);
      box.append(el("p", { class: "countdown-note" }, net.approx ? `${net.approx}; countdown is approximate` : "Countdown to the scheduled launch time (NET)"));
    }
    box.querySelectorAll(".countdown-num").forEach((n, i) => {
      const v = String(parts[i][0]);
      if (n.textContent !== v) n.textContent = v;
    });
  }

  function setActiveClasses(id) {
    track.querySelectorAll(".event").forEach((event) => {
      const on = event.dataset.id === id;
      event.classList.toggle("is-active", on);
      const btn = event.querySelector(".event-btn");
      if (btn) btn.setAttribute("aria-expanded", on ? "true" : "false");
    });
  }

  function setTabStop(btn) {
    track.querySelectorAll(".event-btn").forEach((b) => {
      b.tabIndex = b === btn ? 0 : -1;
    });
  }

  function renderOverlay(l) {
    const focusedInside = overlayPanel.contains(document.activeElement);
    overlayPanel.replaceChildren();
    const frame = el("div", { class: "mission-frame" });
    const card = el("article", { class: "mission-card" });
    const close = el("button", { class: "overlay-close", type: "button", "aria-label": "Close mission details" }, "×");
    close.addEventListener("click", () => closeOverlay({ focusTrigger: true }));
    frame.append(close);

    const imgUrl = safeUrl(l.image);
    if (imgUrl) {
      const fig = el("figure", { class: "mission-figure" });
      const img = el("img", { src: imgUrl, alt: "", decoding: "async" });
      img.addEventListener("error", () => {
        fig.remove();
        card.classList.add("no-photo");
      });
      fig.append(img);
      if (l.image_credit) fig.append(el("figcaption", {}, `Image: ${l.image_credit}`));
      card.append(fig);
    } else {
      card.classList.add("no-photo");
    }

    const body = el("div", { class: "mission-body" });
    const statusLine = el("p", { class: "entry-status" });
    statusLine.append(badge(l));
    if (get(l, "provider", "name")) statusLine.append(el("span", {}, l.provider.name));
    body.append(statusLine);

    const mission = missionTitle(l);
    body.append(el("h3", { class: "mission-name", id: "mission-title" }, mission));
    if (l.rocket) body.append(el("p", { class: "mission-rocket" }, l.rocket));

    body.append(el("div", { id: "countdown" }));
    const net = describeNet(l);
    const when = el("p", { class: "mission-when" });
    when.append(el("time", { datetime: l.net }, net.text));
    body.append(when);

    const dl = el("dl", { class: "facts" });
    fillFacts(dl, l);
    body.append(dl);

    const desc = get(l, "mission", "description");
    if (desc) body.append(el("p", { class: "mission-desc", lang: "en" }, desc));

    const links = el("p", { class: "featured-links" });
    webcastLinks(links, l);
    if (links.childElementCount) body.append(links);

    card.append(body);
    frame.append(card);
    overlayPanel.append(frame);
    overlayPanel.setAttribute("aria-labelledby", "mission-title");
    updateCountdown(l);
    if (focusedInside) close.focus();
  }

  function placeOverlay() {
    if (overlay.hidden) return;
    const dock = document.getElementById("timeline-dock");
    const head = document.querySelector(".masthead");
    const dockTop = dock.getBoundingClientRect().top;
    const headBottom = head.getBoundingClientRect().bottom;
    const gap = dockTop - Math.max(headBottom, 0);
    const top = gap > 280 && headBottom > 8 && headBottom < dockTop ? headBottom + 8 : 8;
    const limit = Math.min(Math.max(dockTop, top + 160), window.innerHeight);
    const bottom = Math.max(8, window.innerHeight - limit + 16);
    overlay.style.top = `${top}px`;
    overlay.style.bottom = `${bottom}px`;
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlayPanel.style.maxHeight = `${Math.max(140, window.innerHeight - top - bottom - 12)}px`;
  }

  function openOverlay(l, { force = false, announce = true } = {}) {
    if (!l) return;
    const same = activeId === l.id && !overlay.hidden;
    activeLaunch = l;
    activeId = l.id;
    setActiveClasses(l.id);
    if (same && !force) return;
    renderOverlay(l);
    overlay.hidden = false;
    overlay.classList.add("is-open");
    placeOverlay();
    if (announce) {
      const when = axisWhen(l);
      const rocket = l.rocket ? `, ${l.rocket}` : "";
      overlayLive.textContent = `${missionTitle(l)}${rocket}. ${when.date} ${when.time}.`;
    }
  }

  function closeOverlay({ focusTrigger = false } = {}) {
    const id = activeId;
    activeLaunch = null;
    activeId = null;
    overlay.hidden = true;
    overlay.classList.remove("is-open");
    overlayPanel.replaceChildren();
    overlayPanel.removeAttribute("aria-labelledby");
    setActiveClasses(null);
    overlayLive.textContent = "Mission details closed.";
    if (focusTrigger && id) {
      const btn = track.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (btn) {
        restoringFocus = true;
        btn.focus({ preventScroll: true });
        restoringFocus = false;
      }
    }
  }

  function renderTimeline() {
    const prevScroll = timeline.scrollLeft;
    const focusId = document.activeElement?.closest?.(".event-btn")?.dataset?.id || null;
    track.replaceChildren();
    const list = state.launches;
    track.style.setProperty("--count", String(Math.max(list.length, 1)));
    track.classList.toggle("is-empty", list.length === 0);

    if (!list.length) {
      track.removeAttribute("role");
      track.append(el("p", { class: "empty" }, "No launches are scheduled right now. The sky is quiet — check back later."));
      return;
    }
    track.setAttribute("role", "list");

    list.forEach((l, index) => {
      const when = axisWhen(l);
      const mission = missionTitle(l);
      const rocket = l.rocket || "";
      const kind = vehicleKind(l);
      const event = el("div", { class: "event", role: "listitem", "data-id": l.id });
      const btn = el("button", {
        class: "event-btn",
        type: "button",
        "data-id": l.id,
        "data-family": kind,
        "aria-expanded": "false",
        "aria-controls": "overlay-panel",
      });
      btn.tabIndex = index === 0 ? 0 : -1;

      const whenBox = el("span", { class: "event-when" });
      whenBox.append(el("span", { class: "event-date" }, when.date));
      whenBox.append(el("span", { class: "event-time" }, when.time));
      btn.append(whenBox);

      const rocketBox = el("span", { class: "event-rocket", "data-family": kind });
      rocketBox.append(silhouette(l));
      btn.append(rocketBox);
      btn.append(el("span", { class: "event-marker", "aria-hidden": "true" }));

      const caption = el("span", { class: "event-caption" });
      const missionEl = el("span", { class: "event-mission", title: mission }, mission);
      caption.append(missionEl);
      if (rocket) caption.append(el("span", { class: "event-vehicle", title: rocket }, rocket));
      btn.append(caption);

      btn.addEventListener("click", () => {
        setTabStop(btn);
        openOverlay(l);
      });
      btn.addEventListener("focus", () => {
        setTabStop(btn);
        if (!restoringFocus && btn.matches(":focus-visible")) openOverlay(l);
      });
      if (canHover) btn.addEventListener("pointerenter", () => openOverlay(l, { announce: false }));

      event.append(btn);
      track.append(event);
    });

    timeline.scrollLeft = prevScroll;
    if (focusId) {
      const again = track.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
      if (again) {
        restoringFocus = true;
        again.focus({ preventScroll: true });
        restoringFocus = false;
      }
    }
    setActiveClasses(activeId);
  }

  function renderMeta() {
    const parts = [];
    if (state.updated) {
      const d = new Date(state.updated);
      if (!Number.isNaN(d.getTime())) {
        parts.push(`Updated ${fmtStamp.format(d)} (${state.source === "live" ? "live from the API" : state.source === "cache" ? "browser cache" : "bundled data"})`);
      }
    }
    parts.push(`${state.launches.length} upcoming launches`);
    logMeta.textContent = parts.join(" · ");
  }

  function render() {
    state.launches = prepare(state.launches);
    renderTimeline();
    renderMeta();
    if (activeId) {
      const still = state.launches.find((l) => l.id === activeId);
      if (still) openOverlay(still, { force: true });
      else closeOverlay();
    }
    startTick();
  }

  function renderError() {
    track.classList.add("is-empty");
    track.style.setProperty("--count", "1");
    track.removeAttribute("role");
    track.replaceChildren(el("p", { class: "empty" }, "Launch data could not be loaded. Check your connection and refresh the page."));
    logMeta.textContent = "";
    closeOverlay();
  }

  function startTick() {
    clearInterval(tickTimer);
    let seconds = 0;
    tickTimer = setInterval(() => {
      const first = state.launches[0];
      // Re-filter once a minute so past launches drop out
      if (++seconds % 60 === 0 && first && !isUpcoming(first, Date.now())) {
        render();
        return;
      }
      if (activeLaunch) updateCountdown(activeLaunch);
    }, 1000);
  }

  timeline.addEventListener("keydown", (e) => {
    const btn = e.target.closest?.(".event-btn");
    if (!btn || !track.contains(btn)) return;
    const buttons = [...track.querySelectorAll(".event-btn")];
    const i = buttons.indexOf(btn);
    if (i < 0) return;
    let next = null;
    if (e.key === "ArrowRight") next = buttons[Math.min(buttons.length - 1, i + 1)];
    else if (e.key === "ArrowLeft") next = buttons[Math.max(0, i - 1)];
    else if (e.key === "Home") next = buttons[0];
    else if (e.key === "End") next = buttons[buttons.length - 1];
    else return;
    e.preventDefault();
    if (next && next !== btn) {
      setTabStop(next);
      next.focus();
      next.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "auto" });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || overlay.hidden) return;
    e.preventDefault();
    closeOverlay({ focusTrigger: true });
  });

  document.addEventListener("pointerdown", (e) => {
    if (overlay.hidden) return;
    if (e.target.closest(".overlay-panel, .event-btn")) return;
    closeOverlay();
  });

  timeline.addEventListener("wheel", (e) => {
    if (timeline.scrollWidth <= timeline.clientWidth + 1) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    timeline.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });

  window.addEventListener("resize", placeOverlay);
  window.addEventListener("scroll", placeOverlay, { passive: true });

  /* ---------- Start ---------- */

  async function init() {
    $("#tz-note").textContent = timeZone
      ? `All times are shown in your local timezone (${timeZone}).`
      : "All times are shown in your local timezone.";

    const bundled = await loadBundled();
    const cached = readStore(CACHE_KEY);
    const candidates = [];
    if (bundled) candidates.push({ data: bundled, source: "bundled" });
    if (cached && isValidData(cached)) candidates.push({ data: cached, source: "cache" });
    candidates.sort((a, b) => (Date.parse(b.data.updated) || 0) - (Date.parse(a.data.updated) || 0));
    const best = candidates[0];

    if (best) {
      state = { launches: best.data.launches, updated: best.data.updated, source: best.source };
      render();
    }

    const age = best ? Date.now() - (Date.parse(best.data.updated) || 0) : Infinity;
    const lastAttempt = Number(readStore(ATTEMPT_KEY)) || 0;
    if (age < STALE_AFTER_MS || Date.now() - lastAttempt < RETRY_AFTER_MS) {
      if (!best) renderError();
      return;
    }

    writeStore(ATTEMPT_KEY, Date.now());
    try {
      const live = await loadLive(best ? best.data.launches : []);
      writeStore(CACHE_KEY, live);
      state = { launches: live.launches, updated: live.updated, source: "live" };
      render();
    } catch (err) {
      console.warn("Live refresh failed; keeping existing data:", err);
      if (!best) renderError();
    }
  }

  init();
})();
