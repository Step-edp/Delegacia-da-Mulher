const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.resolve(process.cwd(), 'public')));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({
    message: 'API Delegacia da Mulher online',
    docs: '/api/health'
  });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'public', 'admin-login.html'));
});

app.get('/admin/cadastro', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'public', 'admin-register.html'));
});

app.get('/admin/cadastros', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'public', 'admin-registrations.html'));
});

app.get('/admin/usuarios', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'public', 'admin-users.html'));
});

app.get('/admin/painel', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'public', 'admin-dashboard.html'));
});

app.get('/admin/historico', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'public', 'admin-history.html'));
});

app.get('/admin/pendencias', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'public', 'admin-pending.html'));
});

app.use(errorHandler);

module.exports = app;
