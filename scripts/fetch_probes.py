#!/usr/bin/env python3
"""Pull heliocentric probe states from NASA JPL Horizons into data/probes.json.

Planets are drawn from orbital elements. This file is the spacecraft, in
ecliptic J2000 cartesian states relative to the Sun (AU and AU/day).

Each target keeps its previous samples if Horizons fails, so a bad response
never wipes the last good track. A target whose ephemeris ends before today
is stored through the last date Horizons will give.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "probes.json"
API = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Horizons COMMAND ids. Names that collide with planets are given as numbers.
# Tianwen-1 has no public ephemeris past 2021; the page holds it at Mars.
TARGETS = [
    {"id": "voyager1", "command": "-31", "start": "1977-09-06", "step": "25 d"},
    {"id": "voyager2", "command": "-32", "start": "1977-08-21", "step": "25 d"},
    {"id": "newHorizons", "command": "-98", "start": "2006-01-20", "step": "20 d"},
    {"id": "parker", "command": "-96", "start": "2018-08-13", "step": "5 d"},
    {"id": "solarOrbiter", "command": "-144", "start": "2020-02-11", "step": "8 d"},
    {"id": "bepiColombo", "command": "-121", "start": "2018-10-21", "step": "10 d"},
    {"id": "juno", "command": "-61", "start": "2011-08-06", "step": "12 d"},
    {"id": "europaClipper", "command": "-159", "start": "2024-10-15", "step": "8 d"},
    {"id": "juice", "command": "-28", "start": "2023-04-15", "step": "10 d"},
    {"id": "lucy", "command": "-49", "start": "2021-10-17", "step": "10 d"},
    {"id": "psyche", "command": "-255", "start": "2023-10-14", "step": "10 d"},
    {"id": "osirisApex", "command": "-64", "start": "2016-09-09", "step": "15 d"},
    {"id": "hera", "command": "-91", "start": "2024-10-08", "step": "8 d"},
    {"id": "hayabusa2", "command": "-37", "start": "2014-12-04", "step": "15 d"},
    {"id": "starman", "command": "-143205", "start": "2018-02-08", "step": "12 d"},
    {"id": "jwst", "command": "-170", "start": "2021-12-26", "step": "12 d"},
    {"id": "gaia", "command": "-139479", "start": "2013-12-20", "step": "15 d"},
    {"id": "euclid", "command": "-680", "start": "2023-07-02", "step": "12 d"},
    {"id": "pioneer10", "command": "-23", "start": "1972-03-04", "step": "40 d"},
    {"id": "pioneer11", "command": "-24", "start": "1973-04-07", "step": "40 d"},
    {"id": "perseverance", "command": "-168", "start": "2020-07-30", "step": "20 d"},
    {"id": "curiosity", "command": "-76", "start": "2011-11-26", "step": "30 d"},
    {"id": "maven", "command": "-202", "start": "2013-11-18", "step": "20 d"},
    {"id": "marsExpress", "command": "-41", "start": "2003-06-03", "step": "30 d"},
    {"id": "hope", "command": "-62", "start": "2020-07-20", "step": "20 d"},
]

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


def today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def fetch_text(command: str, start: str, stop: str, step: str) -> str:
    query = urllib.parse.urlencode({
        "format": "json",
        "COMMAND": command,
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "VECTORS",
        "CENTER": "500@10",
        "START_TIME": start,
        "STOP_TIME": stop,
        "STEP_SIZE": step,
        "REF_PLANE": "ECLIPTIC",
        "REF_SYSTEM": "J2000",
        "VEC_TABLE": "2",
        "VEC_CORR": "NONE",
        "OUT_UNITS": "AU-D",
        "CSV_FORMAT": "YES",
    })
    req = urllib.request.Request(
        API + "?" + query,
        headers={"User-Agent": "seagle-probes/1.0 (launch.seagle.xyz)"},
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        payload = json.load(res)
    result = payload.get("result")
    if not isinstance(result, str) or "$$SOE" not in result:
        snippet = (result or str(payload))[:400].replace("\n", " ")
        raise RuntimeError(f"Horizons returned no ephemeris for {command}: {snippet}")
    return result


def parse_states(result: str) -> dict:
    rows = {"t": [], "x": [], "y": [], "z": [], "vx": [], "vy": [], "vz": []}
    reading = False
    for line in result.splitlines():
        if line.startswith("$$SOE"):
            reading = True
            continue
        if line.startswith("$$EOE"):
            break
        if not reading or not line.strip():
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 8:
            continue
        # "A.D. 2026-Nov-01 00:00:00.0000"
        date = parts[1]
        token = date.split()
        stamp = next((tok for tok in token if len(tok) >= 11 and tok[4] == "-"), None)
        if not stamp:
            raise RuntimeError(f"Could not read a date from {date!r}")
        y, mon, d = stamp.split("-")
        iso = f"{int(y):04d}-{MONTHS[mon]:02d}-{int(d):02d}"
        x, yv, z, vx, vy, vz = (float(parts[i]) for i in range(2, 8))
        rows["t"].append(iso)
        rows["x"].append(round(x, 6))
        rows["y"].append(round(yv, 6))
        rows["z"].append(round(z, 6))
        rows["vx"].append(round(vx, 8))
        rows["vy"].append(round(vy, 8))
        rows["vz"].append(round(vz, 8))
    if len(rows["t"]) < 2:
        raise RuntimeError("Ephemeris parsed to fewer than two states")
    return rows


def shift_days(iso: str, days: int) -> str:
    year, month, day = (int(p) for p in iso.split("-"))
    return (date(year, month, day) + timedelta(days=days)).isoformat()


def clamp_from_message(message: str, start: str, stop: str) -> tuple[str, str] | None:
    """Horizons names the first or last instant it can actually compute."""
    months = {name.lower(): num for name, num in MONTHS.items()}
    after = re.search(r"after A\.D\. (\d{4})-([A-Za-z]{3})-(\d{2})", message)
    prior = re.search(r"prior to A\.D\. (\d{4})-([A-Za-z]{3})-(\d{2})", message)
    if after:
        year, mon, day = int(after.group(1)), months[after.group(2).lower()], int(after.group(3))
        stop = (date(year, mon, day) - timedelta(days=1)).isoformat()
    if prior:
        year, mon, day = int(prior.group(1)), months[prior.group(2).lower()], int(prior.group(3))
        start = (date(year, mon, day) + timedelta(days=1)).isoformat()
    if not after and not prior:
        return None
    if start >= stop:
        return None
    return start, stop


def fetch_target(spec: dict, stop: str) -> dict:
    start = spec["start"]
    last_error = "unknown"
    for _ in range(4):
        try:
            return parse_states(fetch_text(spec["command"], start, stop, spec["step"]))
        except Exception as exc:
            last_error = str(exc)
            adjusted = clamp_from_message(last_error, start, stop)
            if adjusted is None:
                start = shift_days(start, 2)
                if start >= stop:
                    break
                continue
            start, stop = adjusted
    raise RuntimeError(last_error)


def main() -> int:
    stop = today()
    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8")).get("probes") or {}
        except Exception:
            previous = {}
    probes = dict(previous)
    failed = []
    for spec in TARGETS:
        print(f"Fetching {spec['id']} ({spec['command']}) {spec['start']} → {stop}", flush=True)
        try:
            probes[spec["id"]] = fetch_target(spec, stop)
        except Exception as exc:
            failed.append(spec["id"])
            print(f"FAILED {spec['id']}: {exc}", file=sys.stderr)
            if spec["id"] in previous:
                print(f"  kept previous {spec['id']} track", file=sys.stderr)
            continue
        print(f"  {len(probes[spec['id']]['t'])} samples, last {probes[spec['id']]['t'][-1]}")
        time.sleep(0.6)
    missing = [spec["id"] for spec in TARGETS if spec["id"] not in probes]
    document = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "https://ssd.jpl.nasa.gov/api/horizons.api",
        "frame": "ecliptic J2000, Sun body center",
        "units": {"position": "AU", "velocity": "AU/day"},
        "probes": probes,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(document, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
    if missing:
        print(f"Missing tracks with no backup: {', '.join(missing)}", file=sys.stderr)
        return 1
    if failed:
        print(f"Kept previous tracks for: {', '.join(failed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
