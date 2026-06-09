#!/usr/bin/env node
/**
 * make-api-setup.js
 *
 * Make.com「ゴリ受付AI」シナリオの
 * Google Sheets Add a Row モジュール C〜H 列を Phase2 用に更新します。
 *
 * 使い方:
 *   DRY_RUN=true  node make-api-setup.js   # DRY-RUN（デフォルト・変更なし）
 *   DRY_RUN=false node make-api-setup.js   # 本番反映
 *
 * 必須環境変数:
 *   MAKE_API_TOKEN       : Make.com API トークン
 *   MAKE_API_BASE_URL    : 例) https://eu1.make.com/api/v2
 *   MAKE_SCENARIO_KEYWORD: シナリオ名キーワード（例: ゴリ受付AI）
 *
 * オプション:
 *   WEBHOOK_TEXT_FIELD   : Webhookテキストフィールド参照（自動検出できない場合に指定）
 *                          例: 1.text, 1.Body, 2.events[].message.text
 */
'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── 設定 ──────────────────────────────────────────────────────────────────────
const TOKEN   = (process.env.MAKE_API_TOKEN || '').trim();
const BASE    = (process.env.MAKE_API_BASE_URL || 'https://eu1.make.com/api/v2').replace(/\/$/, '');
const KEYWORD = process.env.MAKE_SCENARIO_KEYWORD || 'ゴリ受付AI';
const DRY_RUN = process.env.DRY_RUN !== 'false';
const WEBHOOK_FIELD_OVERRIDE = process.env.WEBHOOK_TEXT_FIELD || null;

if (!TOKEN) {
  console.error('ERROR: MAKE_API_TOKEN が設定されていません');
  process.exit(1);
}

// ── HTTP ヘルパー ─────────────────────────────────────────────────────────────
function apiRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u    = new URL(BASE + endpoint);
    const opts = {
      hostname: u.hostname,
      port    : u.port || (u.protocol === 'https:' ? 443 : 80),
      path    : u.pathname + u.search,
      method,
      headers : {
        Authorization  : `Token ${TOKEN}`,
        'Content-Type' : 'application/json',
        Accept         : 'application/json',
      },
    };
    const payload = body != null ? JSON.stringify(body) : null;
    if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload);

    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(opts, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} [${method} ${endpoint}]: ${JSON.stringify(parsed)}`));
        } else {
          resolve(parsed);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── C〜H 列フォーミュラ生成 ───────────────────────────────────────────────────
function buildCols(ref) {
  return {
    C: `{{if(or(contains(${ref}; "ヤフオク"); contains(${ref}; "オークション"); contains(${ref}; "落札"); contains(${ref}; "出品"); contains(${ref}; "入札")); "オークション系"; if(or(contains(${ref}; "入金"); contains(${ref}; "売上"); contains(${ref}; "円"); contains(${ref}; "支払"); contains(${ref}; "返済"); contains(${ref}; "経費"); contains(${ref}; "出金")); "収支"; if(or(contains(${ref}; "予定"); contains(${ref}; "集荷"); contains(${ref}; "現場"); contains(${ref}; "今日"); contains(${ref}; "明日"); contains(${ref}; "時")); "予定"; if(or(contains(${ref}; "買う"); contains(${ref}; "確認"); contains(${ref}; "連絡"); contains(${ref}; "やる"); contains(${ref}; "まで"); contains(${ref}; "期限"); contains(${ref}; "締切")); "タスク"; "その他"))))}}`,
    D: `{{replace(replace(ifempty(first(match(${ref}; "[0-9,]+円")); ""); "円"; ""); ","; "")}}`,
    E: `{{if(contains(${ref}; "今日"); "今日"; if(contains(${ref}; "明日"); "明日"; if(contains(${ref}; "明後日"); "明後日"; ifempty(first(match(${ref}; "[0-9]{1,2}/[0-9]{1,2}")); ""))))}}`,
    F: `{{if(contains(${ref}; "今日中"); "今日"; if(contains(${ref}; "明日まで"); "明日"; if(contains(${ref}; "明後日まで"); "明後日"; ifempty(first(match(${ref}; "(今日|明日|明後日|[0-9]{1,2}/[0-9]{1,2})まで")); ""))))}}`,
    G: `未処理`,
    H: `{{if(or(contains(${ref}; "ヤフオク"); contains(${ref}; "オークション"); contains(${ref}; "落札"); contains(${ref}; "出品")); "オークション確認候補"; if(or(contains(${ref}; "円"); contains(${ref}; "売上"); contains(${ref}; "入金"); contains(${ref}; "支払"); contains(${ref}; "経費")); "金額確認"; if(or(contains(${ref}; "予定"); contains(${ref}; "集荷"); contains(${ref}; "現場"); contains(${ref}; "時")); "カレンダー登録候補"; if(or(contains(${ref}; "買う"); contains(${ref}; "確認"); contains(${ref}; "連絡"); contains(${ref}; "期限"); contains(${ref}; "まで")); "タスク化候補"; "確認不要"))))}}`,
  };
}

// ── Webhook テキストフィールド自動検出 ───────────────────────────────────────
function detectRef(flow) {
  if (WEBHOOK_FIELD_OVERRIDE) {
    console.log(`  → Webhookフィールド（手動指定）: ${WEBHOOK_FIELD_OVERRIDE}`);
    return WEBHOOK_FIELD_OVERRIDE;
  }
  const wh = flow.find(m => {
    const n = (m.module || '').toLowerCase();
    return n.includes('webhook') || n.includes('customwebhook') ||
           n.includes('gateway') || n.includes('instant') || n.includes('trigger');
  });
  const ref = wh ? `${wh.id}.text` : '1.text';
  console.log(`  → Webhookフィールド（自動検出）: ${ref}${wh ? ` (module: ${wh.module})` : ' (フォールバック)'}`);
  return ref;
}

// ── モジュール values の更新（配列・オブジェクト両対応） ─────────────────────
function applyNewCols(mod, newCols) {
  const clone     = JSON.parse(JSON.stringify(mod));
  const TARGET    = new Set(['C','D','E','F','G','H']);

  const updateArr = (arr) => {
    // 既存 C〜H を除去
    const kept = arr.filter(item => {
      if (typeof item !== 'object' || Array.isArray(item)) return true;
      if ('key' in item) return !TARGET.has(item.key);
      return !Object.keys(item).some(k => TARGET.has(k));
    });
    // 新規追加（{列: 値} 形式）
    const added = Object.entries(newCols).map(([k, v]) => ({ [k]: v }));
    return [...kept, ...added];
  };

  const updateObj = (obj) => {
    const out = { ...obj };
    for (const [k, v] of Object.entries(newCols)) out[k] = v;
    return out;
  };

  if (clone.mapper?.values !== undefined) {
    clone.mapper.values = Array.isArray(clone.mapper.values)
      ? updateArr(clone.mapper.values)
      : updateObj(clone.mapper.values);
  } else if (clone.parameters?.values !== undefined) {
    clone.parameters.values = Array.isArray(clone.parameters.values)
      ? updateArr(clone.parameters.values)
      : updateObj(clone.parameters.values);
  } else {
    console.warn('  ⚠️  values の場所が特定できません。mapper/parameters 全体を表示:');
    console.warn(JSON.stringify({ mapper: clone.mapper, parameters: clone.parameters }, null, 2).slice(0, 600));
  }
  return clone;
}

// ── 現在値の取得（表示用） ────────────────────────────────────────────────────
function getCurrentVal(mod, col) {
  const vals = mod.mapper?.values ?? mod.parameters?.values;
  if (!vals) return '(values未検出)';
  if (Array.isArray(vals)) {
    const item = vals.find(v => v[col] !== undefined || v.key === col);
    if (!item) return '(未設定)';
    return item[col] ?? item.value ?? '(未設定)';
  }
  return vals[col] ?? '(未設定)';
}

// ── DRY-RUN 差分表示 ─────────────────────────────────────────────────────────
function showDiff(sheetsModule, newCols) {
  const LABELS = {
    C: '処理区分',
    D: '金額（抽出）',
    E: '予定日',
    F: '期限',
    G: 'ステータス',
    H: '対応メモ',
  };
  console.log('\n  列  | 変更 | Before → After');
  console.log('  ' + '─'.repeat(76));
  for (const [col, label] of Object.entries(LABELS)) {
    const before  = String(getCurrentVal(sheetsModule, col));
    const after   = String(newCols[col]);
    const changed = before !== after;
    console.log(`\n  [${col}] ${label}  ${changed ? '← 変更あり' : '（変更なし）'}`);
    if (changed) {
      const b = before.length > 120 ? before.slice(0, 117) + '...' : before;
      const a = after.length  > 120 ? after.slice(0, 117)  + '...' : after;
      console.log(`       Before: ${b}`);
      console.log(`       After : ${a}`);
    } else {
      const v = after.length > 120 ? after.slice(0, 117) + '...' : after;
      console.log(`       値    : ${v}`);
    }
  }
}

// ── LINE テスト（フォーミュラロジックのローカル検証） ────────────────────────
const LINE_TESTS = [
  {
    label : 'T1: オークション系',
    text  : 'ヤフオクで3500円で落札しました',
    expect: { C: 'オークション系', D: '3500', H: 'オークション確認候補' },
  },
  {
    label : 'T2: 収支',
    text  : '今月の経費5,000円支払済',
    expect: { C: '収支', D: '5000', H: '金額確認' },
  },
  {
    label : 'T3: 予定',
    text  : '明日10時に現場集荷の予定あり',
    expect: { C: '予定', E: '明日', H: 'カレンダー登録候補' },
  },
  {
    label : 'T4: タスク',
    text  : '明日までに書類を確認してください',
    expect: { C: 'タスク', F: '明日', H: 'タスク化候補' },
  },
];

function evalC(t) {
  if (['ヤフオク','オークション','落札','出品','入札'].some(k => t.includes(k))) return 'オークション系';
  if (['入金','売上','円','支払','返済','経費','出金'].some(k => t.includes(k)))  return '収支';
  if (['予定','集荷','現場','今日','明日','時'].some(k => t.includes(k)))         return '予定';
  if (['買う','確認','連絡','やる','まで','期限','締切'].some(k => t.includes(k))) return 'タスク';
  return 'その他';
}
function evalD(t) {
  const m = t.match(/([0-9,]+)円/);
  return m ? m[1].replace(/,/g, '') : '';
}
function evalE(t) {
  if (t.includes('今日'))   return '今日';
  if (t.includes('明日'))   return '明日';
  if (t.includes('明後日')) return '明後日';
  const m = t.match(/[0-9]{1,2}\/[0-9]{1,2}/);
  return m ? m[0] : '';
}
function evalF(t) {
  if (t.includes('今日中'))   return '今日';
  if (t.includes('明日まで')) return '明日';
  if (t.includes('明後日まで')) return '明後日';
  const m = t.match(/(今日|明日|明後日|[0-9]{1,2}\/[0-9]{1,2})まで/);
  return m ? m[1] : '';
}
function evalH(t) {
  if (['ヤフオク','オークション','落札','出品'].some(k => t.includes(k)))    return 'オークション確認候補';
  if (['円','売上','入金','支払','経費'].some(k => t.includes(k)))           return '金額確認';
  if (['予定','集荷','現場','時'].some(k => t.includes(k)))                  return 'カレンダー登録候補';
  if (['買う','確認','連絡','期限','まで'].some(k => t.includes(k)))         return 'タスク化候補';
  return '確認不要';
}

function runLineTests() {
  console.log('\n' + '─'.repeat(60));
  console.log('[LINE テスト - フォーミュラロジック検証（ローカルシミュレーション）]');
  console.log('─'.repeat(60));
  let pass = 0, fail = 0;
  for (const tc of LINE_TESTS) {
    const pred = {
      C: evalC(tc.text), D: evalD(tc.text), E: evalE(tc.text),
      F: evalF(tc.text), G: '未処理',       H: evalH(tc.text),
    };
    const errors = [];
    for (const [col, exp] of Object.entries(tc.expect)) {
      if (pred[col] !== exp) errors.push(`${col}: 期待="${exp}", 実際="${pred[col]}"`);
    }
    const ok = errors.length === 0;
    console.log(`\n${tc.label}  ${ok ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  入力 : "${tc.text}"`);
    console.log(`  C=${pred.C}  D=${pred.D||'(なし)'}  E=${pred.E||'(なし)'}  F=${pred.F||'(なし)'}  G=${pred.G}  H=${pred.H}`);
    errors.forEach(e => console.log(`  ⚠️  ${e}`));
    ok ? pass++ : fail++;
  }
  console.log(`\n→ テスト結果: ${pass}/${LINE_TESTS.length} PASS`);
  if (fail > 0) {
    console.log('  ⚠️  フォーミュラロジックを確認してください。');
  } else {
    console.log('  ✅ 全フォーミュラ正常。本番反映後、LINEで実際に4件送って確認してください。');
  }
}

// ── メイン ───────────────────────────────────────────────────────────────────
async function main() {
  const SEP = '═'.repeat(60);
  console.log(SEP);
  console.log('Make.com シナリオ Phase2 更新スクリプト');
  console.log(`キーワード : ${KEYWORD}`);
  console.log(`モード     : ${DRY_RUN ? '🔍 DRY-RUN（変更なし）' : '🚀 LIVE（本番反映）'}`);
  console.log(SEP);

  // ─ Step 1: Organizations / Teams ─────────────────────────────────────────
  console.log('\n[1] Organizations / Teams を取得');
  const orgsRes = await apiRequest('/organizations');
  const orgs    = orgsRes.organizations ?? [];
  let   teamId  = null;

  for (const org of orgs) {
    console.log(`  Org [${org.id}] ${org.name}`);
    const teamsRes = await apiRequest(`/teams?organizationId=${org.id}`);
    const teams    = teamsRes.teams ?? [];
    for (const t of teams) {
      console.log(`    Team [${t.id}] ${t.name}`);
      if (!teamId) teamId = t.id;
    }
  }
  if (!teamId) throw new Error('チームが見つかりません');

  // ─ Step 2: シナリオ特定 ───────────────────────────────────────────────────
  console.log(`\n[2] シナリオ検索 (keyword: "${KEYWORD}")`);
  const scenRes  = await apiRequest(`/scenarios?teamId=${teamId}&pg[limit]=200`);
  const scenarios = scenRes.scenarios ?? [];
  const scenario  = scenarios.find(s => (s.name || '').includes(KEYWORD));

  if (!scenario) {
    console.log('  利用可能なシナリオ一覧:');
    scenarios.forEach(s => console.log(`    [${s.id}] ${s.name}`));
    throw new Error(`シナリオ "${KEYWORD}" が見つかりません`);
  }
  console.log(`  ✅ [${scenario.id}] ${scenario.name}`);

  // ─ Step 3: Blueprint バックアップ ────────────────────────────────────────
  console.log('\n[3] Blueprint 取得・バックアップ');
  const bpRes   = await apiRequest(`/scenarios/${scenario.id}/blueprint`);
  const blueprint = bpRes.blueprint ?? bpRes.response?.blueprint ?? bpRes;

  const backDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backDir, { recursive: true });
  const ts      = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_');
  const bpFile  = path.join(backDir, `bp_${scenario.id}_${ts}.json`);
  fs.writeFileSync(bpFile, JSON.stringify(blueprint, null, 2), 'utf8');
  console.log(`  ✅ バックアップ: ${bpFile}`);

  // ─ Step 4: モジュール分析 ─────────────────────────────────────────────────
  console.log('\n[4] モジュール一覧');
  const flow = blueprint.flow ?? blueprint.modules ?? [];
  flow.forEach(m => console.log(`  [${m.id}] ${m.module}`));

  const ref = detectRef(flow);

  // Google Sheets Add a Row モジュールを特定
  const sheetsMod = flow.find(m => {
    const n = (m.module || '').toLowerCase();
    return (n.includes('sheet') || (n.includes('google') && n.includes('row'))) &&
           (n.includes('addrow') || n.includes('add_row') || n.includes('appendrow') || n.includes('append'));
  });

  if (!sheetsMod) {
    console.log('\n  ⚠️  Google Sheets Add a Row モジュールが見つかりません。全モジュール詳細:');
    flow.forEach(m => {
      console.log(`\n  [${m.id}] ${m.module}`);
      const vals = m.mapper?.values ?? m.parameters?.values;
      if (vals) console.log(`    values: ${JSON.stringify(vals).slice(0, 300)}`);
    });
    throw new Error('Google Sheets Add a Row モジュールが見つかりません');
  }
  console.log(`\n  ✅ Sheets モジュール: [${sheetsMod.id}] ${sheetsMod.module}`);
  console.log('  現在の values:');
  const curVals = sheetsMod.mapper?.values ?? sheetsMod.parameters?.values ?? '(未検出)';
  console.log('  ' + JSON.stringify(curVals, null, 2).replace(/\n/g, '\n  ').slice(0, 800));

  // ─ Step 5: DRY-RUN 差分表示 ──────────────────────────────────────────────
  const newCols = buildCols(ref);
  console.log('\n[5] DRY-RUN — C〜H 変更プレビュー');
  showDiff(sheetsMod, newCols);

  // ─ LINE テスト（ローカル検証） ────────────────────────────────────────────
  runLineTests();

  if (DRY_RUN) {
    console.log('\n' + SEP);
    console.log('🔍 DRY-RUN 完了。変更は行っていません。');
    console.log('\n本番反映コマンド:');
    console.log('  DRY_RUN=false node make-api-setup.js');
    console.log(SEP);
    return;
  }

  // ─ Step 6: 本番反映 ───────────────────────────────────────────────────────
  console.log('\n[6] 本番反映中...');
  const newBlueprint = JSON.parse(JSON.stringify(blueprint));
  const flowArr      = newBlueprint.flow ?? newBlueprint.modules;
  const idx          = flowArr.findIndex(m => m.id === sheetsMod.id);
  if (idx === -1) throw new Error('更新対象モジュールが Blueprint コピー内に見つかりません');

  flowArr[idx] = applyNewCols(sheetsMod, newCols);

  // PUT → 失敗なら PATCH を試みる
  let result;
  try {
    result = await apiRequest(`/scenarios/${scenario.id}/blueprint`, 'PUT', { blueprint: newBlueprint });
    console.log('  ✅ PUT 成功');
  } catch (putErr) {
    console.log(`  PUT 失敗 (${putErr.message.split('\n')[0]})`);
    console.log('  PATCH を試みます...');
    result = await apiRequest(`/scenarios/${scenario.id}`, 'PATCH', { blueprint: newBlueprint });
    console.log('  ✅ PATCH 成功');
  }
  console.log('  レスポンス:', JSON.stringify(result).slice(0, 400));

  // ─ 完了サマリー ──────────────────────────────────────────────────────────
  console.log('\n' + SEP);
  console.log('✅ 本番反映完了');
  console.log(`  シナリオ     : [${scenario.id}] ${scenario.name}`);
  console.log(`  Blueprint BP : ${bpFile}`);
  console.log(`  更新モジュール: [${sheetsMod.id}] ${sheetsMod.module}`);
  console.log('\nLINE 実機テスト（4件）を送信してスプレッドシートの C〜H を確認してください:');
  LINE_TESTS.forEach((tc, i) => console.log(`  ${i+1}. ${tc.text}`));
  console.log(SEP);
}

main().catch(e => {
  console.error('\n❌ ERROR:', e.message);
  process.exit(1);
});
