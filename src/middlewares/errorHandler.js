function errorHandler(err, req, res, next) {
  const dbUnavailable = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(String(err.code || '').toUpperCase());
  const statusCode = err.statusCode || (dbUnavailable ? 503 : 500);
  const message = err.message || (dbUnavailable ? 'Banco de dados indisponivel no momento.' : 'Erro interno no servidor');

  console.error(err);

  res.status(statusCode).json({
    error: message
  });
}

module.exports = errorHandler;
