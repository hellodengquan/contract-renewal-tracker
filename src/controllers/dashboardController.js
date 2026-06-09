const db = require('../../db/config');
const { asyncHandler } = require('../middleware/errorHandler');

const getOverview = asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const totalContractsRow = await db.get('SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount FROM contracts');
  const activeContractsRow = await db.get("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount FROM contracts WHERE status = 'active'");

  const expiring7DaysRow = await db.get(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
    FROM contracts
    WHERE status = 'active' AND end_date >= ? AND end_date <= ?
  `, [today, in7Days]);

  const expiring30DaysRow = await db.get(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
    FROM contracts
    WHERE status = 'active' AND end_date > ? AND end_date <= ?
  `, [in7Days, in30Days]);

  const expiring90DaysRow = await db.get(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
    FROM contracts
    WHERE status = 'active' AND end_date > ? AND end_date <= ?
  `, [in30Days, in90Days]);

  const expiredRow = await db.get(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
    FROM contracts
    WHERE status = 'expired' OR (status = 'active' AND end_date < ?)
  `, [today]);

  const pendingRemindersRow = await db.get(`
    SELECT COUNT(*) as count
    FROM renewal_reminders
    WHERE status IN ('pending', 'notified', 'in_progress')
  `);

  const criticalRemindersRow = await db.get(`
    SELECT COUNT(*) as count
    FROM renewal_reminders
    WHERE status IN ('pending', 'notified', 'in_progress') AND priority = 'critical'
  `);

  const pendingFollowUpsRow = await db.get(`
    SELECT COUNT(*) as count
    FROM follow_ups
    WHERE next_follow_date IS NOT NULL AND DATE(next_follow_date) <= ?
  `, [in7Days]);

  const overdueFollowUpsRow = await db.get(`
    SELECT COUNT(*) as count
    FROM follow_ups
    WHERE next_follow_date IS NOT NULL AND DATE(next_follow_date) < ?
  `, [today]);

  const renewedRow = await db.get("SELECT COUNT(*) as count FROM contracts WHERE status = 'renewed'");

  res.json({
    success: true,
    data: {
      contracts: {
        total: totalContractsRow.count,
        total_amount: totalContractsRow.amount,
        active: activeContractsRow.count,
        active_amount: activeContractsRow.amount,
        renewed: renewedRow.count,
        expired: expiredRow.count,
        expired_amount: expiredRow.amount
      },
      expiring: {
        critical_7d: expiring7DaysRow,
        warning_30d: expiring30DaysRow,
        attention_90d: expiring90DaysRow
      },
      reminders: {
        pending: pendingRemindersRow.count,
        critical: criticalRemindersRow.count
      },
      follow_ups: {
        pending: pendingFollowUpsRow.count,
        overdue: overdueFollowUpsRow.count
      }
    }
  });
});

const getExpiringList = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const contracts = await db.all(`
    SELECT c.*,
      CAST((julianday(c.end_date) - julianday(?)) AS INTEGER) as days_remaining,
      CASE
        WHEN (julianday(c.end_date) - julianday(?)) <= 7 THEN 'critical'
        WHEN (julianday(c.end_date) - julianday(?)) <= 30 THEN 'warning'
        WHEN (julianday(c.end_date) - julianday(?)) <= 90 THEN 'attention'
        ELSE 'normal'
      END as expiry_status,
      (SELECT COUNT(*) FROM follow_ups f WHERE f.contract_id = c.id) as follow_up_count,
      (SELECT COUNT(*) FROM renewal_reminders r WHERE r.contract_id = c.id AND r.status IN ('pending', 'notified', 'in_progress')) as pending_reminder_count
    FROM contracts c
    WHERE c.status = 'active'
      AND c.end_date >= ?
      AND c.end_date <= ?
    ORDER BY c.end_date ASC
  `, [today, today, today, today, today, futureDate]);

  const byPriority = {
    critical: contracts.filter(c => c.days_remaining <= 7),
    warning: contracts.filter(c => c.days_remaining > 7 && c.days_remaining <= 30),
    attention: contracts.filter(c => c.days_remaining > 30 && c.days_remaining <= 90)
  };

  res.json({
    success: true,
    data: {
      total: contracts.length,
      total_amount: contracts.reduce((sum, c) => sum + c.amount, 0),
      by_priority: {
        critical: { count: byPriority.critical.length, amount: byPriority.critical.reduce((s, c) => s + c.amount, 0) },
        warning: { count: byPriority.warning.length, amount: byPriority.warning.reduce((s, c) => s + c.amount, 0) },
        attention: { count: byPriority.attention.length, amount: byPriority.attention.reduce((s, c) => s + c.amount, 0) }
      },
      list: contracts
    }
  });
});

const getOwnerWorkload = asyncHandler(async (req, res) => {
  const owners = await db.all(`
    SELECT
      c.owner_name,
      COUNT(DISTINCT c.id) as contract_count,
      COALESCE(SUM(c.amount), 0) as contract_amount,
      COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_contracts,
      COUNT(DISTINCT CASE
        WHEN c.status = 'active' AND julianday(c.end_date) - julianday('now') <= 30
        THEN c.id END) as expiring_30d,
      COUNT(DISTINCT CASE
        WHEN c.status = 'active' AND julianday(c.end_date) - julianday('now') <= 7
        THEN c.id END) as expiring_7d,
      COUNT(DISTINCT r.id) as pending_reminders,
      COUNT(DISTINCT CASE WHEN r.priority = 'critical' THEN r.id END) as critical_reminders,
      COUNT(DISTINCT f.id) as follow_ups,
      COUNT(DISTINCT CASE WHEN f.next_follow_date IS NOT NULL AND DATE(f.next_follow_date) <= date('now', '+7 days') THEN f.id END) as pending_follow_ups
    FROM contracts c
    LEFT JOIN renewal_reminders r ON r.contract_id = c.id AND r.status IN ('pending', 'notified', 'in_progress')
    LEFT JOIN follow_ups f ON f.contract_id = c.id
    GROUP BY c.owner_name
    ORDER BY expiring_7d DESC, expiring_30d DESC, contract_count DESC
  `);

  res.json({
    success: true,
    data: owners
  });
});

const getTimeline = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  const items = await db.all(`
    SELECT * FROM (
      SELECT
        id,
        'contract' as type,
        '合同' as type_name,
        contract_no as title,
        customer_name as subtitle,
        end_date as event_date,
        created_at,
        NULL as priority
      FROM contracts
      UNION ALL
      SELECT
        r.id,
        'reminder' as type,
        '提醒' as type_name,
        r.message as title,
        c.customer_name as subtitle,
        r.remind_date as event_date,
        r.created_at,
        r.priority
      FROM renewal_reminders r
      LEFT JOIN contracts c ON c.id = r.contract_id
      UNION ALL
      SELECT
        f.id,
        'followup' as type,
        '跟进' as type_name,
        f.action as title,
        c.customer_name || ' - ' || f.owner_name as subtitle,
        DATE(f.follow_date) as event_date,
        f.created_at,
        NULL as priority
      FROM follow_ups f
      LEFT JOIN contracts c ON c.id = f.contract_id
    )
    ORDER BY event_date DESC
    LIMIT ?
  `, [limit]);

  res.json({
    success: true,
    data: {
      list: items,
      total: items.length
    }
  });
});

module.exports = {
  getOverview,
  getExpiringList,
  getOwnerWorkload,
  getTimeline
};
