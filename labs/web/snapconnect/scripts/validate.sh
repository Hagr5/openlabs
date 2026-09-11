#!/bin/sh
# Run the automated validation suite against the running deployment.
set -eu
cd "$(dirname "$0")/.."
BASE="${BASE:-http://localhost:8081}"
python3 ops/validate.py "$BASE"
