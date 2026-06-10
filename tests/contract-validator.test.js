const dayjs = require('dayjs');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const createdContractIds = new Set();
const createdFollowUpIds = new Set();

function makeContract(overrides = {}) {
  return {
    contract_no: 'HT-TEST-' + Math.random().toString(36).slice(2, 8).toUpperCase() + Math.floor(Date.now() % 10000),
    customer_name: '测试客户有限公司',
    contract_type: '年度服务',
    contract_amount: 100000,
    sign_date: '2025-01-15',
    start_date: '2025-02-01',
    end_date: '2026-01-31',
    owner_name: '测试负责人',
    status: 'active',
    description: 'API测试合同',
    ...overrides
  };
}

function makeFollowUp(overrides = {}) {
  return {
    contract_id: 1,
    owner_name: '测试负责人',
    action: 'call',
    result: '测试跟进结果',
    next_follow_date: null,
    ...overrides
  };
}

async function postCreate(body, description) {
  const res = await fetch(`${BASE_URL}/api/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (res.ok && json && json.data && json.data.id) {
    createdContractIds.add(json.data.id);
  }
  return { status: res.status, ok: res.ok, json, description };
}

async function putUpdate(id, body, description) {
  const res = await fetch(`${BASE_URL}/api/contracts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  return { status: res.status, ok: res.ok, json, description };
}

async function postFollowUp(body, description) {
  const res = await fetch(`${BASE_URL}/api/followups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (res.ok && json && json.data && json.data.id) {
    createdFollowUpIds.add(json.data.id);
  }
  return { status: res.status, ok: res.ok, json, description };
}

async function cleanup() {
  console.log('🧹 开始清理测试数据...');
  let deletedContracts = 0;
  let deletedFollowUps = 0;
  let errors = 0;

  for (const id of createdFollowUpIds) {
    try {
      const res = await fetch(`${BASE_URL}/api/followups/${id}`, { method: 'DELETE' });
      if (res.ok) deletedFollowUps++;
      else errors++;
    } catch (e) {
      errors++;
    }
  }

  for (const id of createdContractIds) {
    try {
      const res = await fetch(`${BASE_URL}/api/contracts/${id}`, { method: 'DELETE' });
      if (res.ok) deletedContracts++;
      else errors++;
    } catch (e) {
      errors++;
    }
  }

  console.log(`   📋 删除合同: ${deletedContracts} 条`);
  console.log(`   📝 删除跟进: ${deletedFollowUps} 条`);
  if (errors > 0) console.log(`   ⚠️  失败: ${errors} 条`);
  console.log('   ✅ 清理完成\n');
}

const CASES = [
  {
    name: 'TC-01 正常值 POST: 使用 contract_amount 字段',
    run: async () => {
      const body = makeContract({ contract_amount: 250000 });
      const result = await postCreate(body, '使用 contract_amount 而非 amount');
      return {
        expect: { ok: true, status: 201, dataExists: true },
        actual: {
          ok: result.ok,
          status: result.status,
          dataExists: result.ok && result.json && result.json.data && result.json.data.amount === 250000
        }
      };
    }
  },
  {
    name: 'TC-02 边界值 POST: 合同金额 = 0.01（最小正数）',
    run: async () => {
      const body = makeContract({ contract_amount: 0.01 });
      const result = await postCreate(body, '合同金额为最小值 0.01');
      return {
        expect: { ok: true, status: 201 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-03 边界值 POST: 合同金额 = 1e12（最大值）',
    run: async () => {
      const body = makeContract({ contract_amount: 1e12 });
      const result = await postCreate(body, '合同金额为最大值 1e12');
      return {
        expect: { ok: true, status: 201 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-04 非法值 POST: 合同金额 = 0（必须为正数）',
    run: async () => {
      const body = makeContract({ contract_amount: 0 });
      const result = await postCreate(body, '合同金额为0，应失败');
      return {
        expect: { ok: false, status: 400, messageContains: '正数' },
        actual: {
          ok: result.ok,
          status: result.status,
          messageContains: result.json && result.json.message && result.json.message.includes('正数')
        }
      };
    }
  },
  {
    name: 'TC-05 非法值 POST: 合同金额 = 1e12 + 1（超过上限）',
    run: async () => {
      const body = makeContract({ contract_amount: 1e12 + 1 });
      const result = await postCreate(body, '合同金额超过上限，应失败');
      return {
        expect: { ok: false, status: 400, messageContains: '不能超过' },
        actual: {
          ok: result.ok,
          status: result.status,
          messageContains: result.json && result.json.message && /不能超过|超过/.test(result.json.message)
        }
      };
    }
  },
  {
    name: 'TC-06 非法值 POST: customer_name 超长 201 字符',
    run: async () => {
      const longName = 'A'.repeat(201);
      const body = makeContract({ customer_name: longName });
      const result = await postCreate(body, '客户名称超长，应失败');
      return {
        expect: { ok: false, status: 400, messageContains: '长度不能超过' },
        actual: {
          ok: result.ok,
          status: result.status,
          messageContains: result.json && result.json.message && /长度|字符/.test(result.json.message)
        }
      };
    }
  },
  {
    name: 'TC-07 非法值 POST: sign_date 格式错误（2025/01/15）',
    run: async () => {
      const body = makeContract({ sign_date: '2025/01/15' });
      const result = await postCreate(body, '日期格式错误，应失败');
      return {
        expect: { ok: false, status: 400, messageContains: 'YYYY-MM-DD' },
        actual: {
          ok: result.ok,
          status: result.status,
          messageContains: result.json && result.json.message && result.json.message.includes('YYYY-MM-DD')
        }
      };
    }
  },
  {
    name: 'TC-08 非法值 POST: 签署日期 > 到期日',
    run: async () => {
      const body = makeContract({
        sign_date: '2026-06-30',
        end_date: '2026-01-31'
      });
      const result = await postCreate(body, '签署日晚于到期日，应失败');
      return {
        expect: { ok: false, status: 400, messageContains: '签署日期不得晚于' },
        actual: {
          ok: result.ok,
          status: result.status,
          messageContains: result.json && result.json.message && /签署|到期/.test(result.json.message)
        }
      };
    }
  },
  {
    name: 'TC-09 边界值 POST: description = 200 字符（刚好等于上限）',
    run: async () => {
      const desc = '测试描述内容'.repeat(34).slice(0, 200);
      const body = makeContract({ description: desc });
      const result = await postCreate(body, '描述刚好 200 字符，应通过');
      return {
        expect: { ok: true, status: 201 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-10 非法值 POST: 日期格式正确但不存在（2025-02-30）',
    run: async () => {
      const body = makeContract({ sign_date: '2025-02-30' });
      const result = await postCreate(body, '日期存在但不合法，应失败');
      return {
        expect: { ok: false, status: 400 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-11 非法值 PUT 更新: 合同金额为负数',
    run: async () => {
      const seed = await postCreate(makeContract(), '先创建一个合同用于更新');
      if (!seed.ok) {
        return {
          expect: { setup: 'ok' },
          actual: { setup: 'failed: ' + (seed.json && seed.json.message) },
          setupFailed: true
        };
      }
      const result = await putUpdate(seed.json.data.id, {
        contract_amount: -5000
      }, '更新金额为负数，应失败');
      return {
        expect: { ok: false, status: 400 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-12 正常值 PUT 更新: 使用 dayjs 生成跨月偏移日期验证合法',
    run: async () => {
      const seed = await postCreate(makeContract(), '先创建一个合同用于更新');
      if (!seed.ok) {
        return {
          expect: { setup: 'ok' },
          actual: { setup: 'failed: ' + (seed.json && seed.json.message) },
          setupFailed: true
        };
      }
      const newEndDate = dayjs('2026-01-15').add(200, 'day').format('YYYY-MM-DD');
      const newSignDate = dayjs('2026-01-15').subtract(45, 'day').format('YYYY-MM-DD');
      const result = await putUpdate(seed.json.data.id, {
        sign_date: newSignDate,
        end_date: newEndDate
      }, `更新 sign=${newSignDate} end=${newEndDate}`);
      return {
        expect: { ok: true, status: 200, signDate: newSignDate, endDate: newEndDate },
        actual: {
          ok: result.ok,
          status: result.status,
          signDate: result.ok && result.json.data.sign_date,
          endDate: result.ok && result.json.data.end_date
        }
      };
    }
  },
  {
    name: 'TC-13 非法值 POST: owner_email = 201 字符',
    run: async () => {
      const local = 'a'.repeat(90);
      const domain = 'b'.repeat(90);
      const longEmail = `${local}@${domain}.com`.padEnd(201, 'z').slice(0, 201);
      const body = makeContract({ owner_email: longEmail });
      const result = await postCreate(body, '邮箱超长，应失败');
      return {
        expect: { ok: false, status: 400 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-14 非法值 POST: 开始日期晚于结束日期',
    run: async () => {
      const body = makeContract({
        start_date: '2026-12-01',
        end_date: '2026-06-30'
      });
      const result = await postCreate(body, '开始晚于结束，应失败');
      return {
        expect: { ok: false, status: 400, messageContains: '开始日期不能晚于结束日期' },
        actual: {
          ok: result.ok,
          status: result.status,
          messageContains: result.json && result.json.message && /开始|结束/.test(result.json.message)
        }
      };
    }
  },
  {
    name: 'TC-15 正常值 POST: owner_email 合法格式（user@domain.com）',
    run: async () => {
      const body = makeContract({ owner_email: 'valid.user+tag@example-domain.co.cn' });
      const result = await postCreate(body, '合法邮箱格式，应通过');
      return {
        expect: { ok: true, status: 201 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-16 非法值 POST: owner_email 缺少 @ 符号',
    run: async () => {
      const body = makeContract({ owner_email: 'notanemail.com' });
      const result = await postCreate(body, '邮箱缺少@，应失败');
      return {
        expect: { ok: false, status: 400, messageContains: '邮箱格式' },
        actual: {
          ok: result.ok,
          status: result.status,
          messageContains: result.json && result.json.message && /邮箱|email|格式/i.test(result.json.message)
        }
      };
    }
  },
  {
    name: 'TC-17 非法值 POST: owner_email 缺少顶级域（local@domain）',
    run: async () => {
      const body = makeContract({ owner_email: 'user@nodotdomain' });
      const result = await postCreate(body, '邮箱缺少顶级域，应失败');
      return {
        expect: { ok: false, status: 400 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-18 正常值 POST followUp: action = call（枚举合法值）',
    run: async () => {
      const seed = await postCreate(makeContract(), '先创建一个合同用于跟进测试');
      if (!seed.ok) {
        return {
          expect: { setup: 'ok' },
          actual: { setup: 'failed: ' + (seed.json && seed.json.message) },
          setupFailed: true
        };
      }
      const payload = makeFollowUp({ contract_id: seed.json.data.id, action: 'call' });
      const result = await postFollowUp(payload, 'action=call，应通过');
      return {
        expect: { ok: true, status: 201 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-19 正常值 POST followUp: action = meeting（枚举合法值）',
    run: async () => {
      const seed = await postCreate(makeContract(), '先创建一个合同用于跟进测试');
      if (!seed.ok) {
        return {
          expect: { setup: 'ok' },
          actual: { setup: 'failed: ' + (seed.json && seed.json.message) },
          setupFailed: true
        };
      }
      const payload = makeFollowUp({ contract_id: seed.json.data.id, action: 'meeting' });
      const result = await postFollowUp(payload, 'action=meeting，应通过');
      return {
        expect: { ok: true, status: 201 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-20 非法值 POST followUp: action = 任意字符串（不在枚举中）',
    run: async () => {
      const seed = await postCreate(makeContract(), '先创建一个合同用于跟进测试');
      if (!seed.ok) {
        return {
          expect: { setup: 'ok' },
          actual: { setup: 'failed: ' + (seed.json && seed.json.message) },
          setupFailed: true
        };
      }
      const payload = makeFollowUp({ contract_id: seed.json.data.id, action: 'wechat沟通' });
      const result = await postFollowUp(payload, 'action值不在枚举中，应失败');
      return {
        expect: { ok: false, status: 400, messageContains: '跟进方式|action|仅允许' },
        actual: {
          ok: result.ok,
          status: result.status,
          messageContains: result.json && result.json.message && /跟进方式|action|允许|call|email|visit|meeting|other/i.test(result.json.message)
        }
      };
    }
  },
  {
    name: 'TC-21 非法值 POST followUp: action = 空字符串（非空校验+枚举失败）',
    run: async () => {
      const seed = await postCreate(makeContract(), '先创建一个合同用于跟进测试');
      if (!seed.ok) {
        return {
          expect: { setup: 'ok' },
          actual: { setup: 'failed: ' + (seed.json && seed.json.message) },
          setupFailed: true
        };
      }
      const payload = makeFollowUp({ contract_id: seed.json.data.id, action: '' });
      const result = await postFollowUp(payload, 'action为空，应失败');
      return {
        expect: { ok: false, status: 400 },
        actual: { ok: result.ok, status: result.status }
      };
    }
  },
  {
    name: 'TC-22 正常值 POST followUp: 5 个枚举值遍历（other）',
    run: async () => {
      const seed = await postCreate(makeContract(), '先创建一个合同用于跟进测试');
      if (!seed.ok) {
        return {
          expect: { setup: 'ok' },
          actual: { setup: 'failed: ' + (seed.json && seed.json.message) },
          setupFailed: true
        };
      }
      const actions = ['call', 'email', 'visit', 'meeting', 'other'];
      let allPassed = true;
      for (const act of actions) {
        const payload = makeFollowUp({ contract_id: seed.json.data.id, action: act });
        const r = await postFollowUp(payload, `action=${act}`);
        if (!r.ok) { allPassed = false; break; }
      }
      return {
        expect: { ok: true },
        actual: { ok: allPassed }
      };
    }
  }
];

function checkEqual(expect, actual, path = '') {
  const errors = [];
  for (const key of Object.keys(expect)) {
    const e = expect[key];
    const a = actual[key];
    if (key === 'messageContains' && typeof e === 'string' && typeof a === 'boolean') {
      if (a !== true) {
        errors.push(`${path}${key}: 期望消息包含"${e}"，实际未包含 (actual=${JSON.stringify(actual.message)})`);
      }
      continue;
    }
    if (typeof e === 'boolean' || typeof e === 'number' || typeof e === 'string') {
      if (e !== a) {
        errors.push(`${path}${key}: expect=${JSON.stringify(e)} actual=${JSON.stringify(a)}`);
      }
    }
  }
  return errors;
}

(async () => {
  console.log('\n========================================');
  console.log('  合同接口校验规则 测试用例执行');
  console.log('  目标地址: ' + BASE_URL);
  console.log('  总用例数: ' + CASES.length);
  console.log('========================================\n');

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const details = [];
  const START = Date.now();

  try {
    for (let i = 0; i < CASES.length; i++) {
      const tc = CASES[i];
      console.log(`[${i + 1}/${CASES.length}] ${tc.name}`);
      try {
        const out = await tc.run();
        if (out.setupFailed) {
          console.log(`   ⏭️  SKIP (前置条件失败: ${out.actual.setup})`);
          skipCount++;
          details.push({ name: tc.name, result: 'skip', reason: out.actual.setup });
          continue;
        }
        const errors = checkEqual(out.expect, out.actual);
        if (errors.length === 0) {
          console.log(`   ✅ PASS`);
          passCount++;
          details.push({ name: tc.name, result: 'pass' });
        } else {
          console.log(`   ❌ FAIL`);
          errors.forEach(e => console.log(`      - ${e}`));
          console.log(`      expect=${JSON.stringify(out.expect)}`);
          console.log(`      actual=${JSON.stringify(out.actual)}`);
          failCount++;
          details.push({ name: tc.name, result: 'fail', errors });
        }
      } catch (err) {
        console.log(`   ❌ ERROR: ${err.message}`);
        failCount++;
        details.push({ name: tc.name, result: 'error', error: err.message });
      }
      console.log('');
    }
  } finally {
    await cleanup();
  }

  console.log('========================================');
  console.log('  测试完成');
  console.log(`  ✅ 通过: ${passCount}`);
  console.log(`  ❌ 失败: ${failCount}`);
  console.log(`  ⏭️  跳过: ${skipCount}`);
  console.log(`  📊 通过率: ${((passCount / CASES.length) * 100).toFixed(1)}%`);
  console.log(`  ⏱️  耗时: ${((Date.now() - START) / 1000).toFixed(2)}s`);
  console.log('========================================\n');

  process.exit(failCount > 0 ? 1 : 0);
})().catch(err => {
  console.error('测试运行异常:', err);
  cleanup().then(() => process.exit(2)).catch(() => process.exit(2));
});
