const db = require('../../db/config');
const { asyncHandler, notFound, badRequest } = require('../middleware/errorHandler');

function calculateDaysRemaining(endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diffTime = end - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getExpiryStatus(daysRemaining, contractStatus) {
  if (contractStatus === 'expired') return 'expired';
  if (contractStatus === 'terminated') return 'terminated';
  if (contractStatus === 'renewed') return 'renewed';
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= 7) return 'critical';
  if (daysRemaining <= 30) return 'warning';
  if (daysRemaining <= 90) return 'attention';
  return 'normal';
}

function enrichContract(contract) {
  if (!contract) return null;
  const daysRemaining = calculateDaysRemaining(contract.end_date);
  return {
    ...contract,
    days_remaining: daysRemaining,
    expiry_status: getExpiryStatus(daysRemaining, contract.status)
  };
}

async function generateRemindersForContract(contractId, endDate) {
  const daysBeforeList = [90, 60, 30, 14, 7];
  const deleteStmt = db.prepare('DELETE FROM renewal_reminders WHERE contract_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO renewal_reminders (contract_id, remind_date, days_before_expiry, status, priority, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  await deleteStmt.run(contractId);
  const end = new Date(endDate);
  const todayStr = new Date().toISOString().split('T')[0];

  for (const days of daysBeforeList) {
    const remindDate = new Date(end);
    remindDate.setDate(remindDate.getDate() - days);
    const remindDateStr = remindDate.toISOString().split('T')[0];

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

    await insertStmt.run(contractId, remindDateStr, days, status, priority, messages[days]);
  }
}

const getContractList = asyncHandler(async (req, res) => {
  const { offset, limit, page, pageSize } = req.pagination;
  const {
    keyword,
    status,
    owner_name,
    contract_type,
    expiry_status,
    days_from,
    days_to,
    date_from,
    date_to,
    sort_by = 'end_date',
    sort_order = 'asc'
  } = req.query;

  const allowedSortFields = ['end_date', 'start_date', 'sign_date', 'amount', 'created_at'];
  const actualSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'end_date';
  const actualSortOrder = sort_order === 'desc' ? 'DESC' : 'ASC';

  const whereClauses = [];
  const params = {};
  const paramList = [];

  if (keyword) {
    whereClauses.push(`(customer_name LIKE ? OR contract_no LIKE ? OR description LIKE ?)`);
    const kw = `%${keyword}%`;
    paramList.push(kw, kw, kw);
  }

  if (status) {
    whereClauses.push(`status = ?`);
    paramList.push(status);
  }

  if (owner_name) {
    whereClauses.push(`owner_name = ?`);
    paramList.push(owner_name);
  }

  if (contract_type) {
    whereClauses.push(`contract_type = ?`);
    paramList.push(contract_type);
  }

  let whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  let sortSql = `ORDER BY ${actualSortBy} ${actualSortOrder}`;
  if (sort_by === 'days_remaining') {
    sortSql = `ORDER BY julianday(end_date) - julianday(date('now')) ${actualSortOrder}`;
  }

  const countRow = await db.get(`SELECT COUNT(*) as total FROM contracts ${whereSql}`, paramList);
  const total = countRow.total;

  const listSql = `
    SELECT * FROM contracts
    ${whereSql}
    ${sortSql}
    LIMIT ? OFFSET ?
  `;
  const listParams = [...paramList, limit, offset];
  let contracts = await db.all(listSql, listParams);

  if (expiry_status || days_from !== undefined || days_to !== undefined || date_from || date_to) {
    contracts = contracts.map(enrichContract).filter(c => {
      if (expiry_status && c.expiry_status !== expiry_status) return false;
      if (days_from !== undefined && c.days_remaining < parseInt(days_from)) return false;
      if (days_to !== undefined && c.days_remaining > parseInt(days_to)) return false;
      if (date_from && c.end_date < date_from) return false;
      if (date_to && c.end_date > date_to) return false;
      return true;
    });
  } else {
    contracts = contracts.map(enrichContract);
  }

  res.json({
    success: true,
    data: {
      list: contracts,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize)
      }
    }
  });
});

const getContractById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const contract = await db.get('SELECT * FROM contracts WHERE id = ?', [id]);
  if (!contract) {
    return notFound('合同不存在');
  }

  const reminders = await db.all(`
    SELECT * FROM renewal_reminders
    WHERE contract_id = ?
    ORDER BY remind_date DESC
  `, [id]);

  const followUps = await db.all(`
    SELECT * FROM follow_ups
    WHERE contract_id = ?
    ORDER BY follow_date DESC
  `, [id]);

  res.json({
    success: true,
    data: {
      ...enrichContract(contract),
      reminders,
      follow_ups: followUps
    }
  });
});

const createContract = asyncHandler(async (req, res) => {
  const data = req.body;

  const existing = await db.get('SELECT id FROM contracts WHERE contract_no = ?', [data.contract_no]);
  if (existing) {
    return badRequest('合同编号已存在');
  }

  const insertSql = `
    INSERT INTO contracts (
      contract_no, customer_name, contract_type, amount, sign_date,
      start_date, end_date, owner_name, owner_email, owner_phone,
      status, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    data.contract_no,
    data.customer_name,
    data.contract_type,
    data.amount,
    data.sign_date,
    data.start_date,
    data.end_date,
    data.owner_name,
    data.owner_email || null,
    data.owner_phone || null,
    data.status || 'active',
    data.description || null
  ];

  const result = await db.run(insertSql, params);
  const contractId = result.lastID;
  await generateRemindersForContract(contractId, data.end_date);

  const contract = await db.get('SELECT * FROM contracts WHERE id = ?', [contractId]);

  res.status(201).json({
    success: true,
    message: '合同创建成功',
    data: enrichContract(contract)
  });
});

const updateContract = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  const existing = await db.get('SELECT * FROM contracts WHERE id = ?', [id]);
  if (!existing) {
    return notFound('合同不存在');
  }

  if (data.contract_no && data.contract_no !== existing.contract_no) {
    const dup = await db.get('SELECT id FROM contracts WHERE contract_no = ? AND id != ?', [data.contract_no, id]);
    if (dup) {
      return badRequest('合同编号已存在');
    }
  }

  const updateFields = [];
  const updateParams = [];

  const updatableFields = [
    'contract_no', 'customer_name', 'contract_type', 'amount', 'sign_date',
    'start_date', 'end_date', 'owner_name', 'owner_email', 'owner_phone',
    'status', 'description'
  ];

  updatableFields.forEach(field => {
    if (data[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      updateParams.push(data[field]);
    }
  });

  if (updateFields.length === 0) {
    return badRequest('没有需要更新的字段');
  }

  updateFields.push(`updated_at = datetime('now', 'localtime')`);
  updateParams.push(id);

  await db.run(`UPDATE contracts SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);

  if (data.end_date) {
    await generateRemindersForContract(id, data.end_date);
  }

  const contract = await db.get('SELECT * FROM contracts WHERE id = ?', [id]);
  res.json({
    success: true,
    message: '合同更新成功',
    data: enrichContract(contract)
  });
});

const deleteContract = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await db.get('SELECT id FROM contracts WHERE id = ?', [id]);
  if (!existing) {
    return notFound('合同不存在');
  }

  await db.run('DELETE FROM contracts WHERE id = ?', [id]);

  res.json({
    success: true,
    message: '合同删除成功'
  });
});

const getContractStats = asyncHandler(async (req, res) => {
  const totalRow = await db.get('SELECT COUNT(*) as count FROM contracts');
  const total = totalRow.count;

  const activeRow = await db.get("SELECT COUNT(*) as count FROM contracts WHERE status = 'active'");
  const activeCount = activeRow.count;

  const expiredRow = await db.get("SELECT COUNT(*) as count FROM contracts WHERE status = 'expired'");
  const expiredCount = expiredRow.count;

  const totalAmountRow = await db.get('SELECT COALESCE(SUM(amount), 0) as total FROM contracts');
  const totalAmount = totalAmountRow.total;

  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const criticalRow = await db.get(`
    SELECT COUNT(*) as count FROM contracts
    WHERE status = 'active' AND end_date >= ? AND end_date <= ?
  `, [today, in7Days]);
  const criticalCount = criticalRow.count;

  const warningRow = await db.get(`
    SELECT COUNT(*) as count FROM contracts
    WHERE status = 'active' AND end_date > ? AND end_date <= ?
  `, [in7Days, in30Days]);
  const warningCount = warningRow.count;

  const attentionRow = await db.get(`
    SELECT COUNT(*) as count FROM contracts
    WHERE status = 'active' AND end_date > ? AND end_date <= ?
  `, [in30Days, in90Days]);
  const attentionCount = attentionRow.count;

  const byOwner = await db.all(`
    SELECT owner_name as name, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
    FROM contracts
    GROUP BY owner_name
    ORDER BY count DESC
  `);

  const byType = await db.all(`
    SELECT contract_type as type, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
    FROM contracts
    GROUP BY contract_type
    ORDER BY count DESC
  `);

  res.json({
    success: true,
    data: {
      total,
      active: activeCount,
      expired: expiredCount,
      total_amount: totalAmount,
      expiring: {
        critical: criticalCount,
        warning: warningCount,
        attention: attentionCount
      },
      by_owner: byOwner,
      by_type: byType
    }
  });
});

const getOwners = asyncHandler(async (req, res) => {
  const owners = await db.all(`
    SELECT DISTINCT owner_name as name, owner_email as email, owner_phone as phone
    FROM contracts
    ORDER BY owner_name
  `);

  res.json({
    success: true,
    data: owners
  });
});

const getContractTypes = asyncHandler(async (req, res) => {
  const rows = await db.all(`
    SELECT DISTINCT contract_type as type
    FROM contracts
    ORDER BY contract_type
  `);
  const types = rows.map(r => r.type);

  res.json({
    success: true,
    data: types
  });
});

module.exports = {
  getContractList,
  getContractById,
  createContract,
  updateContract,
  deleteContract,
  getContractStats,
  getOwners,
  getContractTypes
};
