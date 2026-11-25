#!/usr/bin/env python3
"""Pull heliocentric probe states from NASA JPL Horizons into data/probes.json.

The page draws planets from orbital elements. This file is only the spacecraft:
Voyager 1 and 2, New Horizons, Parker Solar Probe, Starman, Hayabusa2, Juno,
and the James Webb Space Telescope. Samples are ecliptic J2000 cartesian
states relative to the Sun, in AU and AU/day.

If Horizons does not return a usable ephemeris, the previous JSON is left
untouched and the script exits with an error so a scheduled run does not
replace good data with a partial file.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "probes.json"
API = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Horizons COMMAND ids. Hayabusa 2 is -37 in Horizons (the name "Hayabusa2" is not).
TARGETS = [
    {"id": "voyager1", "command": "-31", "start": "1977-09-06", "step": "20 d"},
    {"id": "voyager2", "command": "-32", "start": "1977-08-21", "step": "20 d"},
    {"id": "newHorizons", "command": "-98", "start": "2006-01-20", "step": "15 d"},
    {"id": "parker", "command": "-96", "start": "2018-08-13", "step": "4 d"},
    {"id": "starman", "command": "-143205", "start": "2018-02-08", "step": "10 d"},
    {"id": "hayabusa2", "command": "-37", "start": "2014-12-04", "step": "12 d"},
    {"id": "juno", "command": "-61", "start": "2011-08-06", "step": "10 d"},
    {"id": "jwst", "command": "-170", "start": "2021-12-26", "step": "10 d"},
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


def main() -> int:
    stop = today()
    probes = {}
    for spec in TARGETS:
        print(f"Fetching {spec['id']} ({spec['command']}) {spec['start']} → {stop}", flush=True)
        start = spec["start"]
        try:
            text = fetch_text(spec["command"], start, stop, spec["step"])
        except Exception as exc:
            message = str(exc)
            print(f"  retrying {spec['id']} one day later ({message[:160]})", file=sys.stderr)
            year, month, day = (int(p) for p in start.split("-"))
            start = (date(year, month, day) + timedelta(days=2)).isoformat()
            try:
                text = fetch_text(spec["command"], start, stop, spec["step"])
            except Exception as again:
                print(f"FAILED {spec['id']}: {again}", file=sys.stderr)
                return 1
        try:
            probes[spec["id"]] = parse_states(text)
        except Exception as exc:
            print(f"FAILED {spec['id']}: {exc}", file=sys.stderr)
            return 1
        print(f"  {len(probes[spec['id']]['t'])} samples, last {probes[spec['id']]['t'][-1]}")
        time.sleep(1.0)

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
    return 0


if __name__ == "__main__":
    sys.exit(main())
