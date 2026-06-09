const db = require('../../db/config');
const { asyncHandler, notFound, badRequest } = require('../middleware/errorHandler');

const getReminderList = asyncHandler(async (req, res) => {
  const { offset, limit, page, pageSize } = req.pagination;
  const {
    status,
    priority,
    contract_id,
    owner_name,
    date_from,
    date_to,
    sort_by = 'remind_date',
    sort_order = 'asc'
  } = req.query;

  const allowedSortFields = ['remind_date', 'created_at', 'priority', 'days_before_expiry'];
  const actualSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'remind_date';
  const actualSortOrder = sort_order === 'desc' ? 'DESC' : 'ASC';

  const whereClauses = [];
  const paramList = [];

  if (status) {
    whereClauses.push(`r.status = ?`);
    paramList.push(status);
  }

  if (priority) {
    whereClauses.push(`r.priority = ?`);
    paramList.push(priority);
  }

  if (contract_id) {
    whereClauses.push(`r.contract_id = ?`);
    paramList.push(contract_id);
  }

  if (owner_name) {
    whereClauses.push(`c.owner_name = ?`);
    paramList.push(owner_name);
  }

  if (date_from) {
    whereClauses.push(`r.remind_date >= ?`);
    paramList.push(date_from);
  }

  if (date_to) {
    whereClauses.push(`r.remind_date <= ?`);
    paramList.push(date_to);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const priorityOrder = "CASE r.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'normal' THEN 4 ELSE 5 END";
  let sortSql = `ORDER BY r.${actualSortBy} ${actualSortOrder}`;
  if (actualSortBy === 'priority') {
    sortSql = `ORDER BY ${priorityOrder} ${actualSortOrder}`;
  }

  const countSql = `
    SELECT COUNT(DISTINCT r.id) as total
    FROM renewal_reminders r
    LEFT JOIN contracts c ON c.id = r.contract_id
    ${whereSql}
  `;
  const countRow = await db.get(countSql, paramList);
  const total = countRow.total;

  const listSql = `
    SELECT r.*, c.customer_name, c.contract_no, c.end_date as contract_end_date, c.owner_name
    FROM renewal_reminders r
    LEFT JOIN contracts c ON c.id = r.contract_id
    ${whereSql}
    ${sortSql}
    LIMIT ? OFFSET ?
  `;
  const listParams = [...paramList, limit, offset];
  const list = await db.all(listSql, listParams);

  res.json({
    success: true,
    data: {
      list,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize)
      }
    }
  });
});

const getReminderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const reminder = await db.get(`
    SELECT r.*, c.customer_name, c.contract_no, c.end_date as contract_end_date, c.owner_name, c.amount
    FROM renewal_reminders r
    LEFT JOIN contracts c ON c.id = r.contract_id
    WHERE r.id = ?
  `, [id]);

  if (!reminder) {
    return notFound('提醒不存在');
  }

  const followUps = await db.all(`
    SELECT * FROM follow_ups
    WHERE reminder_id = ? OR contract_id = ?
    ORDER BY follow_date DESC
  `, [id, reminder.contract_id]);

  res.json({
    success: true,
    data: {
      ...reminder,
      follow_ups: followUps
    }
  });
});

const createReminder = asyncHandler(async (req, res) => {
  const { contract_id, remind_date, days_before_expiry, priority, message } = req.body;

  if (!contract_id || !remind_date) {
    return badRequest('缺少必填字段: contract_id, remind_date');
  }

  const contract = await db.get('SELECT id FROM contracts WHERE id = ?', [contract_id]);
  if (!contract) {
    return badRequest('关联合同不存在');
  }

  const days = days_before_expiry !== undefined ? days_before_expiry : 30;
  const pr = priority || 'normal';

  if (!['critical', 'high', 'medium', 'normal', 'low'].includes(pr)) {
    return badRequest('优先级必须是: critical, high, medium, normal, low');
  }

  const result = await db.run(`
    INSERT INTO renewal_reminders (contract_id, remind_date, days_before_expiry, status, priority, message)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `, [contract_id, remind_date, days, pr, message || null]);

  const reminder = await db.get(`
    SELECT r.*, c.customer_name, c.contract_no
    FROM renewal_reminders r
    LEFT JOIN contracts c ON c.id = r.contract_id
    WHERE r.id = ?
  `, [result.lastID]);

  res.status(201).json({
    success: true,
    message: '提醒创建成功',
    data: reminder
  });
});

const updateReminder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  const existing = await db.get('SELECT * FROM renewal_reminders WHERE id = ?', [id]);
  if (!existing) {
    return notFound('提醒不存在');
  }

  const updateFields = [];
  const updateParams = [];

  const updatableFields = ['remind_date', 'days_before_expiry', 'status', 'priority', 'message'];
  updatableFields.forEach(field => {
    if (data[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      updateParams.push(data[field]);
    }
  });

  if (data.status && !['pending', 'notified', 'in_progress', 'resolved', 'ignored'].includes(data.status)) {
    return badRequest('状态必须是: pending, notified, in_progress, resolved, ignored');
  }

  if (data.priority && !['critical', 'high', 'medium', 'normal', 'low'].includes(data.priority)) {
    return badRequest('优先级必须是: critical, high, medium, normal, low');
  }

  if (updateFields.length === 0) {
    return badRequest('没有需要更新的字段');
  }

  updateFields.push(`updated_at = datetime('now', 'localtime')`);
  updateParams.push(id);

  await db.run(`UPDATE renewal_reminders SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);

  const reminder = await db.get(`
    SELECT r.*, c.customer_name, c.contract_no
    FROM renewal_reminders r
    LEFT JOIN contracts c ON c.id = r.contract_id
    WHERE r.id = ?
  `, [id]);

  res.json({
    success: true,
    message: '提醒更新成功',
    data: reminder
  });
});

const markReminderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;

  if (!status) {
    return badRequest('缺少状态参数');
  }

  if (!['pending', 'notified', 'in_progress', 'resolved', 'ignored'].includes(status)) {
    return badRequest('状态必须是: pending, notified, in_progress, resolved, ignored');
  }

  const existing = await db.get('SELECT * FROM renewal_reminders WHERE id = ?', [id]);
  if (!existing) {
    return notFound('提醒不存在');
  }

  await db.run(`
    UPDATE renewal_reminders
    SET status = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `, [status, id]);

  if (note && status === 'in_progress') {
    const contract = await db.get('SELECT owner_name FROM contracts WHERE id = ?', [existing.contract_id]);
    await db.run(`
      INSERT INTO follow_ups (contract_id, reminder_id, owner_name, action, result, follow_date)
      VALUES (?, ?, ?, '状态更新', ?, datetime('now', 'localtime'))
    `, [existing.contract_id, id, contract?.owner_name || '系统', note]);
  }

  const reminder = await db.get(`
    SELECT r.*, c.customer_name, c.contract_no
    FROM renewal_reminders r
    LEFT JOIN contracts c ON c.id = r.contract_id
    WHERE r.id = ?
  `, [id]);

  res.json({
    success: true,
    message: `提醒状态已更新为 ${status}`,
    data: reminder
  });
});

const deleteReminder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await db.get('SELECT id FROM renewal_reminders WHERE id = ?', [id]);
  if (!existing) {
    return notFound('提醒不存在');
  }

  await db.run('DELETE FROM renewal_reminders WHERE id = ?', [id]);

  res.json({
    success: true,
    message: '提醒删除成功'
  });
});

const getUpcomingReminders = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const owner_name = req.query.owner_name;

  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const whereClauses = [
    'r.remind_date >= ?',
    'r.remind_date <= ?',
    'r.status IN (\'pending\', \'notified\', \'in_progress\')'
  ];
  const params = [today, futureDate];

  if (owner_name) {
    whereClauses.push('c.owner_name = ?');
    params.push(owner_name);
  }

  const reminders = await db.all(`
    SELECT r.*, c.customer_name, c.contract_no, c.end_date as contract_end_date,
           c.owner_name, c.amount, c.contract_type
    FROM renewal_reminders r
    LEFT JOIN contracts c ON c.id = r.contract_id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY
      CASE r.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'normal' THEN 4 ELSE 5 END,
      r.remind_date ASC
  `, params);

  const grouped = {
    critical: reminders.filter(r => r.priority === 'critical'),
    high: reminders.filter(r => r.priority === 'high'),
    medium: reminders.filter(r => r.priority === 'medium'),
    normal: reminders.filter(r => r.priority === 'normal')
  };

  res.json({
    success: true,
    data: {
      total: reminders.length,
      grouped,
      list: reminders
    }
  });
});

module.exports = {
  getReminderList,
  getReminderById,
  createReminder,
  updateReminder,
  markReminderStatus,
  deleteReminder,
  getUpcomingReminders
};
