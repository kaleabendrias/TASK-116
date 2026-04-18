#!/usr/bin/env bash
# Single-command containerized test runner.
# - Boots the test container (dependencies pre-installed in the Docker image via npm ci)
# - Runs unit, API, HTTP, and frontend suites
# - Each suite enforces >=90% coverage on its own scope
# - Prints all coverage summaries
# - Exits non-zero on any failure or threshold miss
set -u

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

COMPOSE="docker compose -f docker-compose.test.yml"

cleanup() {
  $COMPOSE down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "============================================================"
echo "  task-09 — containerized test runner"
echo "============================================================"

# Remove stale node_modules volume so the rebuilt image's packages are always used.
$COMPOSE down --volumes --remove-orphans >/dev/null 2>&1 || true

$COMPOSE run --rm --build \
  --entrypoint sh \
  tests -lc '
    set -u
    echo
    echo "::::: UNIT SUITE :::::"
    npm run --silent test:unit
    UNIT_RC=$?
    echo
    echo "::::: API SUITE :::::"
    npm run --silent test:api
    API_RC=$?
    echo
    echo "::::: HTTP SUITE :::::"
    npm run --silent test:http
    HTTP_RC=$?
    echo
    echo "::::: FRONTEND SUITE :::::"
    npm run --silent test:frontend
    FRONT_RC=$?
    echo
    echo "::::: E2E SUITE :::::"
    npm run --silent test:e2e
    E2E_RC=$?
    if [ "$UNIT_RC" -ne 0 ] || [ "$API_RC" -ne 0 ] || [ "$HTTP_RC" -ne 0 ] || [ "$FRONT_RC" -ne 0 ] || [ "$E2E_RC" -ne 0 ]; then
      echo
      echo "Suite failed: unit=$UNIT_RC api=$API_RC http=$HTTP_RC frontend=$FRONT_RC e2e=$E2E_RC"
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

print_summary "unit"     "coverage/unit/coverage-summary.json"
print_summary "api"      "coverage/api/coverage-summary.json"
print_summary "http"     "coverage/http/coverage-summary.json"
print_summary "frontend" "coverage/frontend/coverage-summary.json"

if [ ! -f coverage/unit/coverage-summary.json ] || [ ! -f coverage/api/coverage-summary.json ] || \
   [ ! -f coverage/http/coverage-summary.json ] || [ ! -f coverage/frontend/coverage-summary.json ]; then
  echo
  echo "RESULT: FAIL — one or more coverage summary files missing."
  exit 1
fi

echo
if [ "$RC" -ne 0 ]; then
  echo "RESULT: FAIL (exit $RC) — see failures and/or coverage thresholds above."
  exit "$RC"
fi
echo "RESULT: PASS — all suites met the >=90% coverage threshold."
exit 0
