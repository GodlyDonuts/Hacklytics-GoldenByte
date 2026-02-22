#!/usr/bin/env bash
# Endpoint health checker for Crisis Topography API.
# Run: bash test_endpoints.sh [BASE_URL]
#
# Tests all API endpoints and reports status. Useful for verifying
# the backend is functional after deployment or notebook re-runs.

BASE="${1:-http://localhost:8000}"
PASS=0
FAIL=0

check() {
    local label="$1" method="$2" path="$3" body="${4:-}" expect="${5:-}"
    local url="${BASE}${path}"
    local resp http_code body_out

    if [ "$method" = "GET" ]; then
        resp=$(curl -s -w "\n%{http_code}" --max-time 30 "$url" 2>&1)
    else
        resp=$(curl -s -w "\n%{http_code}" --max-time 30 -X POST \
            -H "Content-Type: application/json" -d "$body" "$url" 2>&1)
    fi

    http_code=$(echo "$resp" | tail -1)
    body_out=$(echo "$resp" | sed '$d')

    if [ "$http_code" = "200" ]; then
        if [ -n "$expect" ]; then
            if echo "$body_out" | python3 -c "import sys,json; d=json.load(sys.stdin); assert $expect" 2>/dev/null; then
                PASS=$((PASS + 1))
                echo "  PASS  $label"
                return
            else
                FAIL=$((FAIL + 1))
                echo "  FAIL  $label -- 200 but assertion failed"
                return
            fi
        fi
        PASS=$((PASS + 1))
        echo "  PASS  $label"
    elif [ "$http_code" = "503" ]; then
        FAIL=$((FAIL + 1))
        echo "  WAIT  $label -- 503 warehouse starting"
    else
        FAIL=$((FAIL + 1))
        local detail
        detail=$(echo "$body_out" | python3 -c "
import sys,json
try:
    print(json.load(sys.stdin).get('detail','')[:100])
except:
    print(sys.stdin.read()[:100])
" 2>/dev/null || echo "unknown")
        echo "  FAIL  $label -- HTTP $http_code: $detail"
    fi
}

echo ""
echo "============================================="
echo "Crisis Topography API -- Endpoint Health Check"
echo "Base: $BASE"
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="

echo ""
echo "--- Globe endpoints ---"
check "GET  /globe/crises (year only)" \
    GET "/api/globe/crises?year=2024" "" \
    "'countries' in d and len(d['countries']) > 0"

check "GET  /globe/crises (year+month)" \
    GET "/api/globe/crises?year=2024&month=3" "" \
    "d['month'] == 3 and len(d['countries']) > 0"

check "GET  /globe/b2b (SDN)" \
    GET "/api/globe/b2b?iso3=SDN&year=2024" "" \
    "'projects' in d and len(d['projects']) > 0"

echo ""
echo "--- Pipeline data quality ---"
check "crises: oversight_score present" \
    GET "/api/globe/crises?year=2024" "" \
    "any(cr.get('oversight_score') is not None for c in d['countries'] for cr in c['crises'])"

check "crises: coverage_ratio present" \
    GET "/api/globe/crises?year=2024" "" \
    "any(cr.get('coverage_ratio') is not None for c in d['countries'] for cr in c['crises'])"

check "crises: target_beneficiaries present" \
    GET "/api/globe/crises?year=2024" "" \
    "any(cr.get('target_beneficiaries') is not None for c in d['countries'] for cr in c['crises'])"

check "b2b: anomaly_score present" \
    GET "/api/globe/b2b?iso3=SDN&year=2024" "" \
    "any(p.get('anomaly_score') is not None for p in d['projects'])"

check "b2b: B2B varies across clusters" \
    GET "/api/globe/b2b?iso3=SDN&year=2024" "" \
    "len(set(round(p['b2b_ratio'],4) for p in d['projects'] if p['b2b_ratio'])) > 1"

echo ""
echo "--- AI endpoints ---"
check "POST /genie (natural language SQL)" \
    POST "/api/genie" \
    '{"question":"How many crises in Sudan?"}' \
    "'description' in d or 'sql' in d"

check "POST /ask (RAG)" \
    POST "/api/ask" \
    '{"question":"Which countries are most underfunded?"}' \
    "'answer' in d"

check "POST /benchmark" \
    POST "/api/benchmark" \
    '{"project_code":"HSDN24-CSS-209320-1","num_neighbors":3}'

echo ""
echo "--- Predictive ---"
check "GET  /predictive/risks" \
    GET "/api/predictive/risks" "" \
    "'risks' in d"

echo ""
echo "--- Report ---"
check "GET  /report" \
    GET "/report"

echo ""
echo "============================================="
echo "Results: $PASS passed, $FAIL failed"
echo "============================================="
exit $FAIL
