#!/usr/bin/env bash
# ゴリ受付AI Phase2 - Make API経由でシナリオ確認スクリプト
# 使い方: MAKE_TOKEN=xxx SCENARIO_ID=yyy bash phase2_make_api.sh

set -euo pipefail

: "${MAKE_TOKEN:?MakeAPIトークンを環境変数MAKE_TOKENに設定してください}"
BASE_URL="${MAKE_BASE_URL:-https://eu1.make.com/api/v2}"

echo "=== Step 1: シナリオ一覧確認 ==="
curl -s -X GET "${BASE_URL}/scenarios" \
  -H "Authorization: Token ${MAKE_TOKEN}" \
  -H "Content-Type: application/json" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data.get('scenarios', []):
    print(f\"ID: {s['id']}  名前: {s['name']}  状態: {s.get('isPaused','?')}\")"

if [ -n "${SCENARIO_ID:-}" ]; then
  echo ""
  echo "=== Step 2: シナリオID ${SCENARIO_ID} のBlueprint取得 ==="
  curl -s -X GET "${BASE_URL}/scenarios/${SCENARIO_ID}/blueprint" \
    -H "Authorization: Token ${MAKE_TOKEN}" \
    -o "scenario_${SCENARIO_ID}_blueprint.json"
  echo "→ scenario_${SCENARIO_ID}_blueprint.json に保存しました"
  echo ""
  echo "=== Step 3: モジュール一覧 ==="
  python3 -c "
import json
with open('scenario_${SCENARIO_ID}_blueprint.json') as f:
    bp = json.load(f)
for m in bp.get('blueprint', {}).get('modules', []):
    print(f\"  [{m.get('id','?')}] {m.get('name','?')} / {m.get('type','?')}\")"
fi

echo ""
echo "次のステップ: SCENARIO_ID を指定して再実行するか、Make画面操作手順.txt を参照"
