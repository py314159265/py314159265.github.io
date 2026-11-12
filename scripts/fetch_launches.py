#!/usr/bin/env python3
"""Fetch upcoming orbital launches from The Space Devs Launch Library 2, slim them, and write data/launches.json.

Uses only the standard library so it can run on GitHub Actions and locally:
    python3 scripts/fetch_launches.py
On failure, exits non-zero and does not overwrite the existing data/launches.json.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=40&mode=detailed"
USER_AGENT = "seagle-launch-tracker/1.0 (https://github.com/py314159265)"
MAX_LAUNCHES = 30
# Finished statuses: 3 = Success, 4 = Failure, 7 = Partial Failure
DONE_STATUS_IDS = {3, 4, 7}
IN_FLIGHT_STATUS_ID = 6
# If NET is older than this and the launch is not in flight, it is not "upcoming"
PAST_GRACE = timedelta(hours=1)

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "launches.json"


def get(d, *keys):
    """Walk nested fields safely; return None if any level is missing."""
    for key in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(key)
    return d


def parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def pick_webcasts(launch):
    # detailed mode has launch-level vid_urls; otherwise fall back to the mission
    vids = launch.get("vid_urls") or get(launch, "mission", "vid_urls") or []
    vids = [v for v in vids if isinstance(v, dict) and v.get("url")]
    vids.sort(key=lambda v: v.get("priority") or 0, reverse=True)
    out = []
    for v in vids[:3]:
        out.append({
            "url": v.get("url"),
            "title": v.get("title"),
            "publisher": v.get("publisher"),
            "type": get(v, "type", "name"),
            "live": bool(v.get("live")),
        })
    return out


def slim(launch):
    status = launch.get("status") or {}
    config = get(launch, "rocket", "configuration") or {}
    lsp = launch.get("launch_service_provider") or {}
    mission = launch.get("mission") or {}
    pad = launch.get("pad") or {}
    image = launch.get("image") or {}
    return {
        "id": launch.get("id"),
        "slug": launch.get("slug"),
        "name": launch.get("name"),
        "net": launch.get("net"),
        "net_precision": get(launch, "net_precision", "abbrev"),
        "window_start": launch.get("window_start"),
        "window_end": launch.get("window_end"),
        "status": {
            "id": status.get("id"),
            "name": status.get("name"),
            "abbrev": status.get("abbrev"),
        },
        "provider": {"name": lsp.get("name"), "abbrev": lsp.get("abbrev")},
        "rocket": config.get("full_name") or config.get("name"),
        "mission": {
            "name": mission.get("name"),
            "type": mission.get("type"),
            "description": mission.get("description"),
            "orbit": get(mission, "orbit", "name"),
            "orbit_abbrev": get(mission, "orbit", "abbrev"),
        } if mission else None,
        "pad": {
            "name": pad.get("name"),
            "location": get(pad, "location", "name"),
            "country": get(pad, "country", "name") or get(pad, "location", "country", "name"),
        },
        "webcast_live": bool(launch.get("webcast_live")),
        "webcasts": pick_webcasts(launch),
        "image": image.get("thumbnail_url") or image.get("image_url"),
        "image_credit": image.get("credit"),
    }


def is_upcoming(launch, now):
    status_id = get(launch, "status", "id")
    if status_id == IN_FLIGHT_STATUS_ID:
        return True
    if status_id in DONE_STATUS_IDS:
        return False
    net = parse_iso(launch.get("net"))
    if net is None:
        return False
    return net >= now - PAST_GRACE


def fetch():
    req = urllib.request.Request(API_URL, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        return json.load(resp)


def main():
    try:
        payload = fetch()
    except urllib.error.HTTPError as exc:
        print(f"API error: HTTP {exc.code} {exc.reason}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
        print(f"Fetch failed: {exc}", file=sys.stderr)
        return 1

    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        print("Unexpected API response: missing results array", file=sys.stderr)
        return 1

    now = datetime.now(timezone.utc)
    launches = [slim(l) for l in results if isinstance(l, dict) and is_upcoming(l, now)]
    launches = [l for l in launches if l["name"] and l["net"]]
    launches.sort(key=lambda l: l["net"])
    launches = launches[:MAX_LAUNCHES]

    out = {
        "updated": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "https://thespacedevs.com/llapi",
        "launches": launches,
    }
    # Validate that the payload can be serialized and parsed before writing
    text = json.dumps(out, ensure_ascii=False, indent=1)
    json.loads(text)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_PATH.with_suffix(".json.tmp")
    tmp.write_text(text + "\n", encoding="utf-8")
    tmp.replace(OUT_PATH)
    print(f"Wrote {len(launches)} launches ({len(results)} from the API) → {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
