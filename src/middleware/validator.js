const { badRequest } = require('../middleware/errorHandler');

function validateContract(req, res, next) {
  const data = req.method === 'POST' ? req.body : (req.body || {});
  const isCreate = req.method === 'POST';

  if (isCreate) {
    const required = ['contract_no', 'customer_name', 'contract_type', 'amount', 'sign_date', 'start_date', 'end_date', 'owner_name'];
    const missing = required.filter(f => !data[f] && data[f] !== 0);
    if (missing.length > 0) {
      return badRequest(`缺少必填字段: ${missing.join(', ')}`);
    }
  }

  if (data.amount !== undefined && (typeof data.amount !== 'number' || data.amount < 0)) {
    return badRequest('合同金额必须为非负数字');
  }

  const dateFields = ['sign_date', 'start_date', 'end_date'];
  for (const field of dateFields) {
    if (data[field]) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(data[field])) {
        return badRequest(`日期格式错误 (${field})，请使用 YYYY-MM-DD 格式`);
      }
    }
  }

  if (data.start_date && data.end_date) {
    if (new Date(data.start_date) > new Date(data.end_date)) {
      return badRequest('合同开始日期不能晚于结束日期');
    }
  }

  if (data.status && !['active', 'expired', 'terminated', 'renewed'].includes(data.status)) {
    return badRequest('合同状态必须是: active, expired, terminated, renewed');
  }

  next();
}

function validateFollowUp(req, res, next) {
  const data = req.body;
  const required = ['contract_id', 'owner_name', 'action'];
  const missing = required.filter(f => !data[f]);
  if (missing.length > 0) {
    return badRequest(`缺少必填字段: ${missing.join(', ')}`);
  }
  next();
}

function validatePagination(req, res, next) {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.page_size) || 20;

  if (page < 1) return badRequest('页码必须大于0');
  if (pageSize < 1 || pageSize > 100) return badRequest('每页数量必须在1-100之间');

  req.pagination = {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    limit: pageSize
  };

  next();
}

module.exports = {
  validateContract,
  validateFollowUp,
  validatePagination
};
