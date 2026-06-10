const dayjs = require('dayjs');
const { AppError } = require('../middleware/errorHandler');

const MAX_AMOUNT = 1e12;
const MAX_STRING_LENGTH = 200;
const DATE_FORMAT = 'YYYY-MM-DD';
const EMAIL_REGEX = /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const FOLLOWUP_ACTIONS = ['call', 'email', 'visit', 'meeting', 'other'];
const FOLLOWUP_ACTION_LABELS = {
  call: '电话',
  email: '邮件',
  visit: '上门拜访',
  meeting: '会议',
  other: '其他'
};

const STRING_FIELDS = [
  { key: 'contract_no', label: '合同编号' },
  { key: 'customer_name', label: '客户名称' },
  { key: 'contract_type', label: '合同类型' },
  { key: 'owner_name', label: '负责人姓名' },
  { key: 'owner_email', label: '负责人邮箱' },
  { key: 'owner_phone', label: '负责人电话' },
  { key: 'description', label: '合同描述' }
];

const DATE_FIELDS = [
  { key: 'sign_date', label: '签署日期' },
  { key: 'start_date', label: '开始日期' },
  { key: 'end_date', label: '结束日期' }
];

function isValidDateFormat(dateStr) {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  if (!dayjs(dateStr, DATE_FORMAT, true).isValid()) return false;
  if (dayjs(dateStr).format(DATE_FORMAT) !== dateStr) return false;
  return true;
}

function resolveAmount(data) {
  if (data.contract_amount !== undefined && data.contract_amount !== null) {
    return data.contract_amount;
  }
  return data.amount;
}

function validateContract(req, res, next) {
  try {
    const data = req.body || {};
    const isCreate = req.method === 'POST';

    const amount = resolveAmount(data);
    if (isCreate) {
      const required = [
        { key: 'contract_no', label: '合同编号' },
        { key: 'customer_name', label: '客户名称' },
        { key: 'contract_type', label: '合同类型' },
        { key: 'sign_date', label: '签署日期' },
        { key: 'start_date', label: '开始日期' },
        { key: 'end_date', label: '结束日期' },
        { key: 'owner_name', label: '负责人姓名' }
      ];
      const missingFields = [];
      required.forEach(({ key, label }) => {
        const val = data[key];
        if (val === undefined || val === null || val === '') {
          missingFields.push(`${key}(${label})`);
        }
      });
      if (amount === undefined || amount === null || amount === '') {
        missingFields.push('contract_amount/amount(合同金额)');
      }
      if (missingFields.length > 0) {
        throw new AppError(`缺少必填字段: ${missingFields.join(', ')}`, 400);
      }
    }

    if (amount !== undefined && amount !== null && amount !== '') {
      if (typeof amount !== 'number' && typeof amount !== 'string') {
        throw new AppError('合同金额类型错误，必须为数字', 400);
      }
      const num = Number(amount);
      if (isNaN(num)) {
        throw new AppError('合同金额必须是有效数字', 400);
      }
      if (!Number.isFinite(num)) {
        throw new AppError('合同金额必须是有限数字', 400);
      }
      if (num <= 0) {
        throw new AppError('合同金额必须为正数（不能为 0 或负数）', 400);
      }
      if (num > MAX_AMOUNT) {
        throw new AppError(`合同金额不能超过 ${MAX_AMOUNT.toExponential()}`, 400);
      }
      if (isCreate || data.amount !== undefined || data.contract_amount !== undefined) {
        req.body.amount = num;
      }
    }

    for (const { key, label } of STRING_FIELDS) {
      const val = data[key];
      if (val !== undefined && val !== null && val !== '') {
        if (typeof val !== 'string') {
          throw new AppError(`${label}(${key})必须为字符串`, 400);
        }
        if (val.length > MAX_STRING_LENGTH) {
          throw new AppError(`${label}(${key})长度不能超过 ${MAX_STRING_LENGTH} 字符`, 400);
        }
      }
    }

    const emailVal = data.owner_email;
    if (emailVal !== undefined && emailVal !== null && emailVal !== '') {
      if (typeof emailVal !== 'string' || !EMAIL_REGEX.test(emailVal)) {
        throw new AppError('负责人邮箱(owner_email)格式错误，需符合 local@domain.tld 结构', 400);
      }
    }

    for (const { key, label } of DATE_FIELDS) {
      const val = data[key];
      if (val !== undefined && val !== null && val !== '') {
        if (!isValidDateFormat(val)) {
          throw new AppError(`${label}(${key})格式错误，必须为 YYYY-MM-DD 且是合法日期`, 400);
        }
      }
    }

    const signDate = data.sign_date;
    const endDate = data.end_date;
    if (signDate && endDate) {
      if (dayjs(signDate).isAfter(dayjs(endDate), 'day')) {
        throw new AppError('签署日期不得晚于合同到期日', 400);
      }
    }

    const startDate = data.start_date;
    if (startDate && endDate) {
      if (dayjs(startDate).isAfter(dayjs(endDate), 'day')) {
        throw new AppError('合同开始日期不能晚于结束日期', 400);
      }
    }
    if (signDate && startDate) {
      if (dayjs(signDate).isAfter(dayjs(startDate), 'day')) {
        throw new AppError('签署日期不得晚于合同开始日期', 400);
      }
    }

    if (data.status !== undefined && data.status !== null && data.status !== '') {
      if (!['active', 'expired', 'terminated', 'renewed'].includes(data.status)) {
        throw new AppError('合同状态必须是: active, expired, terminated, renewed', 400);
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

function validateFollowUp(req, res, next) {
  try {
    const data = req.body || {};
    const isCreate = req.method === 'POST';

    if (isCreate) {
      const required = [
        { key: 'contract_id', label: '合同ID' },
        { key: 'owner_name', label: '负责人姓名' },
        { key: 'action', label: '跟进方式' }
      ];
      const missing = [];
      required.forEach(({ key, label }) => {
        const val = data[key];
        if (val === undefined || val === null || val === '') {
          missing.push(`${key}(${label})`);
        }
      });
      if (missing.length > 0) {
        throw new AppError(`缺少必填字段: ${missing.join(', ')}`, 400);
      }
    }

    if (data.contract_id !== undefined && data.contract_id !== null && data.contract_id !== '') {
      const cid = Number(data.contract_id);
      if (isNaN(cid) || !Number.isInteger(cid) || cid <= 0) {
        throw new AppError('合同ID(contract_id)必须为正整数', 400);
      }
    }

    if (data.reminder_id !== undefined && data.reminder_id !== null && data.reminder_id !== '') {
      const rid = Number(data.reminder_id);
      if (isNaN(rid) || !Number.isInteger(rid) || rid <= 0) {
        throw new AppError('提醒ID(reminder_id)必须为正整数', 400);
      }
    }

    if (data.owner_name !== undefined && data.owner_name !== null && data.owner_name !== '') {
      if (typeof data.owner_name !== 'string') {
        throw new AppError('负责人姓名(owner_name)必须为字符串', 400);
      }
      if (data.owner_name.length > MAX_STRING_LENGTH) {
        throw new AppError(`负责人姓名(owner_name)长度不能超过 ${MAX_STRING_LENGTH} 字符`, 400);
      }
    }

    if (data.action !== undefined && data.action !== null && data.action !== '') {
      if (typeof data.action !== 'string' || !FOLLOWUP_ACTIONS.includes(data.action)) {
        const options = FOLLOWUP_ACTIONS.map(a => `${a}(${FOLLOWUP_ACTION_LABELS[a]})`).join(', ');
        throw new AppError(`跟进方式(action)非法，仅允许: ${options}`, 400);
      }
    }

    if (data.result !== undefined && data.result !== null && data.result !== '') {
      if (typeof data.result !== 'string') {
        throw new AppError('跟进结果(result)必须为字符串', 400);
      }
      if (data.result.length > MAX_STRING_LENGTH) {
        throw new AppError(`跟进结果(result)长度不能超过 ${MAX_STRING_LENGTH} 字符`, 400);
      }
    }

    if (data.next_follow_date !== undefined && data.next_follow_date !== null && data.next_follow_date !== '') {
      if (!isValidDateFormat(data.next_follow_date)) {
        throw new AppError('下次跟进日期(next_follow_date)格式错误，必须为 YYYY-MM-DD 且是合法日期', 400);
      }
    }

    if (data.follow_date !== undefined && data.follow_date !== null && data.follow_date !== '') {
      if (!isValidDateFormat(data.follow_date)) {
        throw new AppError('跟进日期(follow_date)格式错误，必须为 YYYY-MM-DD 且是合法日期', 400);
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

function validatePagination(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.page_size) || 20;

    if (page < 1) throw new AppError('页码必须大于0', 400);
    if (pageSize < 1 || pageSize > 100) throw new AppError('每页数量必须在1-100之间', 400);

    req.pagination = {
      page,
      pageSize,
      offset: (page - 1) * pageSize,
      limit: pageSize
    };

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  validateContract,
  validateFollowUp,
  validatePagination,
  _test: {
    isValidDateFormat,
    MAX_AMOUNT,
    MAX_STRING_LENGTH
  }
};
