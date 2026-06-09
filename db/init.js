require('dotenv').config();
const { exec, close } = require('./config');

(async () => {
  try {
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

    console.log('✅ 数据库初始化完成！');
    await close();
    process.exit(0);
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    process.exit(1);
  }
})();
