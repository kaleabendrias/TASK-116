#!/usr/bin/env bash
# Single-command containerized test runner.
# - Boots the test container
# - Runs the unit suite, then the API/integration suite
# - Each suite enforces >=90% coverage on its own scope
# - Prints both coverage summaries
# - Exits non-zero on any failure or threshold miss
set -u

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

COMPOSE="docker compose -f docker-compose.test.yml"

cleanup() {
  $COMPOSE down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "============================================================"
echo "  task-09 — containerized test runner"
echo "============================================================"

$COMPOSE run --rm \
  --entrypoint sh \
  tests -lc '
    set -u
    if [ -f package-lock.json ]; then
      npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1
    else
      npm install --no-audit --no-fund >/dev/null 2>&1
    fi
    echo
    echo "::::: UNIT SUITE :::::"
    npm run --silent test:unit
    UNIT_RC=$?
    echo
    echo "::::: API SUITE :::::"
    npm run --silent test:api
    API_RC=$?
    if [ "$UNIT_RC" -ne 0 ] || [ "$API_RC" -ne 0 ]; then
      echo
      echo "Suite failed: unit=$UNIT_RC api=$API_RC"
      exit 1
    fi
    exit 0
  '
RC=$?

echo
echo "============================================================"
echo "  Coverage summary"
echo "============================================================"

print_summary() {
  local label="$1" path="$2"
  if [ -f "$path" ]; then
    echo "[$label]"
    node -e '
      const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const t = j.total;
      for (const k of ["lines","statements","functions","branches"]) {
        const m = t[k];
        console.log("  " + k.padEnd(11) + ": " + m.pct.toFixed(2) + "% (" + m.covered + "/" + m.total + ")");
      }
    ' "$path"
  else
    echo "[$label] coverage summary not found at $path"
  fi
}

print_summary "unit" "coverage/unit/coverage-summary.json"
print_summary "api"  "coverage/api/coverage-summary.json"

if [ ! -f coverage/unit/coverage-summary.json ] || [ ! -f coverage/api/coverage-summary.json ]; then
  echo
  echo "RESULT: FAIL — coverage summary files missing; tests did not produce coverage output."
  exit 1
fi

echo
if [ "$RC" -ne 0 ]; then
  echo "RESULT: FAIL (exit $RC) — see failures and/or coverage thresholds above."
  exit "$RC"
fi
echo "RESULT: PASS — both suites met the >=90% coverage threshold."
exit 0
