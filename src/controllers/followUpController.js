const db = require('../../db/config');
const { asyncHandler, notFound, badRequest } = require('../middleware/errorHandler');

const getFollowUpList = asyncHandler(async (req, res) => {
  const { offset, limit, page, pageSize } = req.pagination;
  const {
    contract_id,
    reminder_id,
    owner_name,
    date_from,
    date_to,
    has_next,
    sort_by = 'follow_date',
    sort_order = 'desc'
  } = req.query;

  const allowedSortFields = ['follow_date', 'created_at', 'next_follow_date'];
  const actualSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'follow_date';
  const actualSortOrder = sort_order === 'desc' ? 'DESC' : 'ASC';

  const whereClauses = [];
  const paramList = [];

  if (contract_id) {
    whereClauses.push(`f.contract_id = ?`);
    paramList.push(contract_id);
  }

  if (reminder_id) {
    whereClauses.push(`f.reminder_id = ?`);
    paramList.push(reminder_id);
  }

  if (owner_name) {
    whereClauses.push(`f.owner_name = ?`);
    paramList.push(owner_name);
  }

  if (date_from) {
    whereClauses.push(`DATE(f.follow_date) >= ?`);
    paramList.push(date_from);
  }

  if (date_to) {
    whereClauses.push(`DATE(f.follow_date) <= ?`);
    paramList.push(date_to);
  }

  if (has_next === 'true') {
    whereClauses.push(`f.next_follow_date IS NOT NULL`);
  } else if (has_next === 'false') {
    whereClauses.push(`f.next_follow_date IS NULL`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const sortSql = `ORDER BY f.${actualSortBy} ${actualSortOrder}`;

  const countSql = `SELECT COUNT(*) as total FROM follow_ups f ${whereSql}`;
  const countRow = await db.get(countSql, paramList);
  const total = countRow.total;

  const listSql = `
    SELECT f.*, c.customer_name, c.contract_no, c.end_date as contract_end_date,
           r.remind_date, r.priority as reminder_priority
    FROM follow_ups f
    LEFT JOIN contracts c ON c.id = f.contract_id
    LEFT JOIN renewal_reminders r ON r.id = f.reminder_id
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

const getFollowUpById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const followUp = await db.get(`
    SELECT f.*, c.customer_name, c.contract_no, c.end_date as contract_end_date,
           c.owner_name as contract_owner, r.remind_date, r.priority as reminder_priority, r.status as reminder_status
    FROM follow_ups f
    LEFT JOIN contracts c ON c.id = f.contract_id
    LEFT JOIN renewal_reminders r ON r.id = f.reminder_id
    WHERE f.id = ?
  `, [id]);

  if (!followUp) {
    return notFound('跟进记录不存在');
  }

  res.json({
    success: true,
    data: followUp
  });
});

const createFollowUp = asyncHandler(async (req, res) => {
  const { contract_id, reminder_id, owner_name, action, result, next_follow_date, follow_date } = req.body;

  const contract = await db.get('SELECT id, owner_name FROM contracts WHERE id = ?', [contract_id]);
  if (!contract) {
    return badRequest('关联合同不存在');
  }

  if (reminder_id) {
    const reminder = await db.get('SELECT id FROM renewal_reminders WHERE id = ? AND contract_id = ?', [reminder_id, contract_id]);
    if (!reminder) {
      return badRequest('关联提醒不存在或不属于该合同');
    }
  }

  const insertFields = ['contract_id', 'reminder_id', 'owner_name', 'action', 'result', 'next_follow_date'];
  const insertValues = [contract_id, reminder_id || null, owner_name || contract.owner_name, action, result || null, next_follow_date || null];
  const placeholders = ['?', '?', '?', '?', '?', '?'];

  if (follow_date) {
    insertFields.push('follow_date');
    insertValues.push(follow_date);
    placeholders.push('?');
  }

  const result0 = await db.run(`
    INSERT INTO follow_ups (${insertFields.join(', ')})
    VALUES (${placeholders.join(', ')})
  `, insertValues);

  const followUp = await db.get(`
    SELECT f.*, c.customer_name, c.contract_no
    FROM follow_ups f
    LEFT JOIN contracts c ON c.id = f.contract_id
    WHERE f.id = ?
  `, [result0.lastID]);

  if (reminder_id) {
    await db.run(`
      UPDATE renewal_reminders
      SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [reminder_id]);
  }

  res.status(201).json({
    success: true,
    message: '跟进记录创建成功',
    data: followUp
  });
});

const updateFollowUp = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  const existing = await db.get('SELECT * FROM follow_ups WHERE id = ?', [id]);
  if (!existing) {
    return notFound('跟进记录不存在');
  }

  const updateFields = [];
  const updateParams = [];

  const updatableFields = ['owner_name', 'action', 'result', 'next_follow_date', 'follow_date', 'reminder_id'];
  updatableFields.forEach(field => {
    if (data[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      updateParams.push(data[field] === '' ? null : data[field]);
    }
  });

  if (updateFields.length === 0) {
    return badRequest('没有需要更新的字段');
  }

  updateParams.push(id);
  await db.run(`UPDATE follow_ups SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);

  const followUp = await db.get(`
    SELECT f.*, c.customer_name, c.contract_no
    FROM follow_ups f
    LEFT JOIN contracts c ON c.id = f.contract_id
    WHERE f.id = ?
  `, [id]);

  res.json({
    success: true,
    message: '跟进记录更新成功',
    data: followUp
  });
});

const deleteFollowUp = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await db.get('SELECT id FROM follow_ups WHERE id = ?', [id]);
  if (!existing) {
    return notFound('跟进记录不存在');
  }

  await db.run('DELETE FROM follow_ups WHERE id = ?', [id]);

  res.json({
    success: true,
    message: '跟进记录删除成功'
  });
});

const getPendingFollowUps = asyncHandler(async (req, res) => {
  const owner_name = req.query.owner_name;
  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const whereClauses = [
    'f.next_follow_date IS NOT NULL',
    'DATE(f.next_follow_date) <= ?'
  ];
  const params = [in7Days];

  if (owner_name) {
    whereClauses.push('f.owner_name = ?');
    params.push(owner_name);
  }

  const followUps = await db.all(`
    SELECT f.*, c.customer_name, c.contract_no, c.end_date as contract_end_date,
           c.amount, r.priority as reminder_priority
    FROM follow_ups f
    LEFT JOIN contracts c ON c.id = f.contract_id
    LEFT JOIN renewal_reminders r ON r.id = f.reminder_id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY
      CASE WHEN DATE(f.next_follow_date) < ? THEN 1 ELSE 2 END,
      f.next_follow_date ASC
  `, [...params, today]);

  const overdue = followUps.filter(f => f.next_follow_date < today);
  const todayFollowUps = followUps.filter(f => f.next_follow_date === today);
  const upcoming = followUps.filter(f => f.next_follow_date > today);

  res.json({
    success: true,
    data: {
      total: followUps.length,
      overdue: overdue.length,
      today: todayFollowUps.length,
      upcoming: upcoming.length,
      grouped: {
        overdue,
        today: todayFollowUps,
        upcoming
      },
      list: followUps
    }
  });
});

module.exports = {
  getFollowUpList,
  getFollowUpById,
  createFollowUp,
  updateFollowUp,
  deleteFollowUp,
  getPendingFollowUps
};
