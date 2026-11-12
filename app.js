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

  // Mission types and orbits are shown in the API's English wording.

  const $ = (sel) => document.querySelector(sel);
  const featuredBody = $("#featured-body");
  const entriesEl = $("#entries");
  const logMeta = $("#log-meta");
  const tpl = $("#tpl-entry");

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmtFull = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const fmtDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
  const fmtTime = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const fmtHour = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23" });
  const fmtStamp = new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let state = { launches: [], updated: null, source: "bundled" };
  let tickTimer = null;

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

  function dateBlock(l) {
    const d = new Date(l.net);
    const p = l.net_precision;
    const { y, m } = utcParts(d);
    if (/^Q[1-4]$/.test(p)) return { day: `Q${p[1]}`, sub: `${y}`, vague: true };
    if (p === "H1" || p === "H2") return { day: p === "H1" ? "H1" : "H2", sub: `${y}`, vague: true };
    if (p === "Y") return { day: `${y}`, sub: "This year", vague: true };
    if (p === "M") return { day: new Date(Date.UTC(y, m - 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }), sub: `${y}`, vague: true };
    return { day: String(d.getDate()), sub: `${d.toLocaleString("en-US", { month: "short" })} ${WEEKDAYS[d.getDay()]}`, vague: false };
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

  function renderFeatured(l) {
    featuredBody.replaceChildren();
    if (!l) {
      featuredBody.append(el("p", { class: "empty" }, "No launches are scheduled right now. The sky is quiet — check back later."));
      return;
    }
    const card = el("article", { class: "featured-card" });

    const img = safeUrl(l.image);
    if (img) {
      const fig = el("figure", { class: "featured-figure" });
      fig.append(el("img", { src: img, alt: "", loading: "lazy", decoding: "async" }));
      if (l.image_credit) fig.append(el("figcaption", {}, `Image: ${l.image_credit}`));
      card.append(fig);
    }

    const text = el("div", { class: "featured-text" });
    const statusLine = el("p", { class: "entry-status" });
    statusLine.append(badge(l));
    if (get(l, "provider", "name")) statusLine.append(el("span", {}, l.provider.name));
    text.append(statusLine);
    text.append(el("h3", { class: "featured-name" }, missionTitle(l)));
    if (l.rocket) text.append(el("p", { class: "featured-sub" }, l.rocket));

    const net = describeNet(l);
    text.append(el("div", { id: "countdown" }));
    const when = el("p", { class: "featured-when" });
    when.append(el("time", { datetime: l.net }, net.text));
    text.append(when);

    const dl = el("dl", { class: "facts" });
    fillFacts(dl, l);
    text.append(dl);

    const desc = get(l, "mission", "description");
    if (desc) {
      const box = el("div", { class: "featured-desc" });
      box.append(el("p", { lang: "en" }, desc));
      text.append(box);
    }
    const links = el("p", { class: "featured-links" });
    webcastLinks(links, l);
    if (links.childElementCount) text.append(links);

    card.append(text);
    featuredBody.append(card);
    updateCountdown(l);
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

  function renderList(list) {
    entriesEl.replaceChildren();
    if (!list.length) {
      entriesEl.append(el("li", { class: "empty" }, "No further launches are scheduled yet."));
      return;
    }
    for (const l of list) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      const db = dateBlock(l);
      const dateBox = node.querySelector(".entry-date");
      dateBox.dataset.vague = String(db.vague);
      node.querySelector(".entry-day").textContent = db.day;
      node.querySelector(".entry-month").textContent = db.sub;

      const status = node.querySelector(".entry-status");
      status.replaceChildren(badge(l));
      status.append(el("time", { datetime: l.net, class: "entry-when" }, describeNet(l).text));

      node.querySelector(".entry-name").textContent = missionTitle(l);
      fillFacts(node.querySelector(".facts"), l);

      const desc = get(l, "mission", "description");
      if (desc) {
        const det = node.querySelector(".entry-desc");
        det.hidden = false;
        det.querySelector("p").textContent = desc;
      }
      webcastLinks(node.querySelector(".entry-links"), l);
      entriesEl.append(node);
    }
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
    const [first, ...rest] = state.launches;
    renderFeatured(first || null);
    renderList(first ? rest : []);
    renderMeta();
    startTick();
  }

  function renderError() {
    featuredBody.replaceChildren(
      el("p", { class: "empty" }, "Launch data could not be loaded. Check your connection and refresh the page.")
    );
    entriesEl.replaceChildren();
    logMeta.textContent = "";
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
      updateCountdown(first);
    }, 1000);
  }

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
