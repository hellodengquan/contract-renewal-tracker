require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'contract-renewal-tracker',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/followups', require('./routes/followups'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: true,
    message: err.message || '服务器内部错误',
    code: err.code || 'INTERNAL_ERROR'
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: '接口不存在',
    path: req.path,
    method: req.method
  });
});

async function initDatabase() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'contracts.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    const { exec } = require('../db/config');
    await exec(`
      CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_no TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        contract_type TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        sign_date TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        owner_email TEXT,
        owner_phone TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS renewal_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER NOT NULL,
        remind_date TEXT NOT NULL,
        days_before_expiry INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'normal',
        message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS follow_ups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER NOT NULL,
        reminder_id INTEGER,
        owner_name TEXT NOT NULL,
        action TEXT NOT NULL,
        result TEXT,
        next_follow_date TEXT,
        follow_date TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
        FOREIGN KEY (reminder_id) REFERENCES renewal_reminders(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
      CREATE INDEX IF NOT EXISTS idx_contracts_owner ON contracts(owner_name);
      CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
      CREATE INDEX IF NOT EXISTS idx_reminders_contract ON renewal_reminders(contract_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_status ON renewal_reminders(status);
      CREATE INDEX IF NOT EXISTS idx_reminders_date ON renewal_reminders(remind_date);
      CREATE INDEX IF NOT EXISTS idx_followups_contract ON follow_ups(contract_id);
      CREATE INDEX IF NOT EXISTS idx_followups_date ON follow_ups(follow_date);
    `);
    console.log('📦 数据库表结构已初始化');
  }
}

const PORT = process.env.PORT || 3000;

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 合同续约追踪服务已启动`);
      console.log(`📍 服务地址: http://localhost:${PORT}`);
      console.log(`📊 健康检查: http://localhost:${PORT}/api/health\n`);
    });
  })
  .catch(err => {
    console.error('❌ 启动失败:', err.message);
    process.exit(1);
  });

module.exports = app;
