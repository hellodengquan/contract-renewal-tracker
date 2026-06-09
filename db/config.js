const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'contracts.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  }
});

function pragma(statement) {
  return new Promise((resolve, reject) => {
    db.run(`PRAGMA ${statement}`, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function(err, row) {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function(err, rows) {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function prepare(sql) {
  const stmt = db.prepare(sql);

  return {
    run: function(...params) {
      return new Promise((resolve, reject) => {
        stmt.run(...params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    get: function(...params) {
      return new Promise((resolve, reject) => {
        stmt.get(...params, function(err, row) {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    },
    all: function(...params) {
      return new Promise((resolve, reject) => {
        stmt.all(...params, function(err, rows) {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    },
    bind: function(...params) {
      stmt.bind(...params);
      return this;
    }
  };
}

function serialize(fn) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      Promise.resolve(fn())
        .then(resolve)
        .catch(reject);
    });
  });
}

function transaction(fn) {
  return new Promise(async (resolve, reject) => {
    try {
      await run('BEGIN TRANSACTION');
      try {
        const result = await fn();
        await run('COMMIT');
        resolve(result);
      } catch (err) {
        await run('ROLLBACK');
        reject(err);
      }
    } catch (err) {
      reject(err);
    }
  });
}

function close() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

(async () => {
  try {
    await pragma('journal_mode = WAL');
    await pragma('foreign_keys = ON');
  } catch (e) {
    console.error('PRAGMA 执行警告:', e.message);
  }
})();

module.exports = {
  db,
  pragma,
  exec,
  run,
  get,
  all,
  prepare,
  serialize,
  transaction,
  close
};
