#!/usr/bin/env bash
# Live parity check: compare locally computed horizontal positions against the
# catalogue server's own /catalog output for the same inputs.
#
#   GET /ephemerides  -> TLEs, computed locally by this crate
#   GET /catalog      -> the server's own az/el for the same observer and date
#
# Uses whole-second dates deliberately: the server propagates to whole seconds
# while this crate keeps sub-second precision, so a fractional date would show
# a small expected divergence rather than a real error.
#
# Usage: ./scripts/parity_check.sh [base_url] [lat] [lon] [alt_m]

set -euo pipefail

BASE="${1:-https://tart.elec.ac.nz/catalog}"
LAT="${2:--45.87}"
LON="${3:-170.60}"
ALT="${4:-100}"

# Tolerances. az/el are in degrees; range is compared in metres.
AZ_EL_TOL="${AZ_EL_TOL:-0.05}"
RANGE_TOL_M="${RANGE_TOL_M:-500}"

cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# The server rejects dates more than 24 h in the future, so use "now" truncated
# to the hour.
DATE="$(date -u +%Y-%m-%dT%H:00:00Z)"
UNIX_SECS="$(date -u -d "$DATE" +%s)"

echo "base=$BASE date=$DATE unix=$UNIX_SECS lat=$LAT lon=$LON alt=$ALT"

curl -sS --max-time 30 -o "$tmp/eph.json" "$BASE/ephemerides?date=$DATE"
curl -sS --max-time 30 -o "$tmp/cat.json" "$BASE/catalog?date=$DATE&lat=$LAT&lon=$LON&alt=$ALT"

cargo build --quiet --example parity
./target/debug/examples/parity "$tmp/eph.json" "$UNIX_SECS" "$LAT" "$LON" "$ALT" > "$tmp/local.json"

AZ_EL_TOL="$AZ_EL_TOL" RANGE_TOL_M="$RANGE_TOL_M" python3 - "$tmp/local.json" "$tmp/cat.json" <<'PY'
import json, os, sys

local = {x["name"]: x for x in json.load(open(sys.argv[1]))}
server = {x["name"]: x for x in json.load(open(sys.argv[2]))}
common = set(local) & set(server)

az_tol = float(os.environ["AZ_EL_TOL"])
rng_tol = float(os.environ["RANGE_TOL_M"])

print(f"local={len(local)} server={len(server)} common={len(common)}")
print(f"local-only (below the server's horizon filter): {len(set(local) - set(server))}")

if not common:
    print("FAIL: no satellites in common")
    sys.exit(1)

def worst(key, to_server_units=lambda v: v):
    """Largest deviation, converting only the LOCAL value into server units."""
    vals = [
        (abs(to_server_units(local[n][key]) - server[n][key]), n) for n in common
    ]
    return max(vals)

daz, az_name = worst("az")
del_, el_name = worst("el")
# the server reports range in metres; this crate works in km
dr, r_name = worst("r", to_server_units=lambda v: v * 1000.0)

print(f"max |d_az|     = {daz:.4f} deg   ({az_name})")
print(f"max |d_el|     = {del_:.4f} deg   ({el_name})")
print(f"max |d_range|  = {dr:.1f} m       ({r_name})")

failures = []
if daz > az_tol:
    failures.append(f"azimuth {daz:.4f} > {az_tol}")
if del_ > az_tol:
    failures.append(f"elevation {del_:.4f} > {az_tol}")
if dr > rng_tol:
    failures.append(f"range {dr:.1f}m > {rng_tol}m")

if failures:
    print("FAIL: " + "; ".join(failures))
    sys.exit(1)

print("PASS")
PY
