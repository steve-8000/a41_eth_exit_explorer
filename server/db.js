const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/eth_exit.db');

// Create data directory if needed
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
    });
  }
  return db;
}

function initDatabase() {
  return new Promise((resolve, reject) => {
    const database = getDatabase();
    
    database.serialize(() => {
      // Create validators table
      database.run(`
        CREATE TABLE IF NOT EXISTS validators (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pubkey TEXT UNIQUE NOT NULL,
          provider TEXT NOT NULL,
          status TEXT NOT NULL,
          json_filename TEXT,
          bucket_no TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating validators table:', err);
          reject(err);
          return;
        }
        // Add bucket_no column for existing databases
        database.run(`ALTER TABLE validators ADD COLUMN bucket_no TEXT`, (err) => {
          // Ignore if column exists
        });
      });

      // Create indexes
      database.run(`
        CREATE INDEX IF NOT EXISTS idx_provider_status 
        ON validators(provider, status)
      `, (err) => {
        if (err) {
          console.error('Error creating index:', err);
          reject(err);
          return;
        }
      });

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_pubkey 
        ON validators(pubkey)
      `, (err) => {
        if (err) {
          console.error('Error creating index:', err);
          reject(err);
          return;
        }
      });

      // Create exit_batches table
      database.run(`
        CREATE TABLE IF NOT EXISTS exit_batches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL,
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          total_validators INTEGER DEFAULT 0
        )
      `, (err) => {
        if (err) {
          console.error('Error creating exit_batches table:', err);
          reject(err);
          return;
        }
      });

      // Create exit_validators table
      database.run(`
        CREATE TABLE IF NOT EXISTS exit_validators (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id INTEGER NOT NULL,
          pubkey TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (batch_id) REFERENCES exit_batches(id),
          UNIQUE(batch_id, pubkey)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating exit_validators table:', err);
          reject(err);
          return;
        }
      });

      // Create exit_validators indexes
      database.run(`
        CREATE INDEX IF NOT EXISTS idx_exit_batch_id 
        ON exit_validators(batch_id)
      `, (err) => {
        if (err) {
          console.error('Error creating exit_batch_id index:', err);
          reject(err);
          return;
        }
      });

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_exit_pubkey 
        ON exit_validators(pubkey)
      `, (err) => {
        if (err) {
          console.error('Error creating exit_pubkey index:', err);
          reject(err);
          return;
        }
      });

      database.run(`
        CREATE INDEX IF NOT EXISTS idx_exit_status 
        ON exit_validators(status)
      `, (err) => {
        if (err) {
          console.error('Error creating exit_status index:', err);
          reject(err);
          return;
        }
        resolve();
      });
    });
  });
}

function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }
    });
    db = null;
  }
}

module.exports = {
  getDatabase,
  initDatabase,
  closeDatabase
};

