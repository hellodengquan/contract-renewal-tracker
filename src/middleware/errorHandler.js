function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function notFound(message = '资源不存在') {
  throw new AppError(message, 404, 'NOT_FOUND');
}

function badRequest(message = '请求参数错误') {
  throw new AppError(message, 400, 'BAD_REQUEST');
}

module.exports = {
  asyncHandler,
  AppError,
  notFound,
  badRequest
};
