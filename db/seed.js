require('dotenv').config();
const { run, prepare, close } = require('./config');

const today = new Date();

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

const contracts = [
  {
    contract_no: 'HT-2025-001',
    customer_name: '北京科技有限公司',
    contract_type: '年度服务',
    amount: 120000,
    sign_date: '2025-01-15',
    start_date: '2025-02-01',
    end_date: addDays(today, 20),
    owner_name: '张三',
    owner_email: 'zhangsan@company.com',
    owner_phone: '13800138001',
    status: 'active',
    description: '年度技术支持服务合同'
  },
  {
    contract_no: 'HT-2025-002',
    customer_name: '上海贸易集团',
    contract_type: '采购合同',
    amount: 350000,
    sign_date: '2024-12-01',
    start_date: '2024-12-15',
    end_date: addDays(today, 45),
    owner_name: '李四',
    owner_email: 'lisi@company.com',
    owner_phone: '13800138002',
    status: 'active',
    description: '年度办公设备采购框架协议'
  },
  {
    contract_no: 'HT-2025-003',
    customer_name: '广州网络科技',
    contract_type: 'SaaS订阅',
    amount: 68000,
    sign_date: '2025-03-10',
    start_date: '2025-03-15',
    end_date: addDays(today, 90),
    owner_name: '王五',
    owner_email: 'wangwu@company.com',
    owner_phone: '13800138003',
    status: 'active',
    description: '企业版SaaS平台年度订阅'
  },
  {
    contract_no: 'HT-2024-015',
    customer_name: '深圳电子有限公司',
    contract_type: '维护服务',
    amount: 86000,
    sign_date: '2024-06-20',
    start_date: '2024-07-01',
    end_date: addDays(today, 7),
    owner_name: '张三',
    owner_email: 'zhangsan@company.com',
    owner_phone: '13800138001',
    status: 'active',
    description: '设备年度维护服务'
  },
  {
    contract_no: 'HT-2024-020',
    customer_name: '杭州数据服务',
    contract_type: '咨询服务',
    amount: 200000,
    sign_date: '2024-08-01',
    start_date: '2024-08-15',
    end_date: addDays(today, -15),
    owner_name: '李四',
    owner_email: 'lisi@company.com',
    owner_phone: '13800138002',
    status: 'expired',
    description: '数字化转型咨询项目'
  },
  {
    contract_no: 'HT-2025-004',
    customer_name: '成都软件开发',
    contract_type: '定制开发',
    amount: 580000,
    sign_date: '2025-04-01',
    start_date: '2025-04-15',
    end_date: addDays(today, 180),
    owner_name: '赵六',
    owner_email: 'zhaoliu@company.com',
    owner_phone: '13800138004',
    status: 'active',
    description: 'ERP系统定制开发项目'
  },
  {
    contract_no: 'HT-2025-005',
    customer_name: '武汉物流公司',
    contract_type: '年度服务',
    amount: 95000,
    sign_date: '2025-02-10',
    start_date: '2025-03-01',
    end_date: addDays(today, 60),
    owner_name: '王五',
    owner_email: 'wangwu@company.com',
    owner_phone: '13800138003',
    status: 'active',
    description: '物流管理系统年度运维'
  }
];

async function generateRemindersForContract(contractId, endDate) {
  const daysBeforeList = [90, 60, 30, 14, 7];
  const insertReminder = prepare(`
    INSERT INTO renewal_reminders (contract_id, remind_date, days_before_expiry, status, priority, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  await run('DELETE FROM renewal_reminders WHERE contract_id = ?', [contractId]);

  const end = new Date(endDate);
  const todayStr = formatDate(new Date());

  for (const days of daysBeforeList) {
    const remindDate = new Date(end);
    remindDate.setDate(remindDate.getDate() - days);
    const remindDateStr = formatDate(remindDate);

    let status = 'pending';
    if (remindDateStr < todayStr) {
      status = 'notified';
    }

    let priority = 'normal';
    if (days <= 7) priority = 'critical';
    else if (days <= 30) priority = 'high';
    else if (days <= 60) priority = 'medium';

    const messages = {
      90: `合同还有${days}天到期，请提前规划续约事宜`,
      60: `合同${days}天后到期，建议与客户初步沟通续约意向`,
      30: `合同即将在${days}天后到期，请启动续约谈判流程`,
      14: `紧急：合同仅剩${days}天，请加快续约进度`,
      7: `非常紧急：合同${days}天后到期，必须立即处理续约事宜`
    };

    await insertReminder.run(
      contractId,
      remindDateStr,
      days,
      status,
      priority,
      messages[days]
    );
  }
}

(async () => {
  try {
    const insertFollowUp = prepare(`
      INSERT INTO follow_ups (contract_id, reminder_id, owner_name, action, result, next_follow_date, follow_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertContractSql = `
      INSERT INTO contracts (
        contract_no, customer_name, contract_type, amount, sign_date,
        start_date, end_date, owner_name, owner_email, owner_phone, status, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (let idx = 0; idx < contracts.length; idx++) {
      const c = contracts[idx];
      const result = await run(insertContractSql, [
        c.contract_no,
        c.customer_name,
        c.contract_type,
        c.amount,
        c.sign_date,
        c.start_date,
        c.end_date,
        c.owner_name,
        c.owner_email || null,
        c.owner_phone || null,
        c.status || 'active',
        c.description || null
      ]);
      const contractId = result.lastID;

      await generateRemindersForContract(contractId, c.end_date);

      if (idx === 0) {
        await insertFollowUp.run(
          contractId,
          null,
          '张三',
          '电话沟通续约意向',
          '客户表示有续约意愿，希望适当降低费用',
          addDays(today, 3),
          formatDate(today)
        );
      } else if (idx === 3) {
        await insertFollowUp.run(
          contractId,
          null,
          '张三',
          '上门拜访',
          '客户正在内部审批，预计下周有结果',
          addDays(today, 5),
          formatDate(today)
        );
      }
    }

    console.log(`✅ 已插入 ${contracts.length} 条合同数据及对应的提醒和跟进记录`);
    await close();
    process.exit(0);
  } catch (err) {
    console.error('❌ 数据插入失败:', err.message);
    process.exit(1);
  }
})();
