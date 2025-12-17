const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('./db');
const { parseCSV } = require('./csvParser');
const { getValidatorStatusesBatch, mapBeaconStatus } = require('./beaconApi');
const { getExitQueueInfo } = require('./exitQueueService');
const { normalizePubkey } = require('./utils');

const router = express.Router();
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({ dest: uploadsDir });

// Upload and process CSV file
router.post('/api/upload-csv', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const filePath = req.file.path;
    const validators = await parseCSV(filePath);

    if (validators.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'No valid data found in CSV file' });
    }

    const db = getDatabase();
    let inserted = 0;

    // Process validators in batches
    const batchSize = 100;
    for (let i = 0; i < validators.length; i += batchSize) {
      const batch = validators.slice(i, i + batchSize);
      
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO validators (pubkey, provider, status, json_filename, updated_at)
            VALUES (?, ?, 'pending', ?, CURRENT_TIMESTAMP)
          `);

          batch.forEach(validator => {
            // Ensure pubkey is normalized before saving
            const normalizedPubkey = normalizePubkey(validator.pubkey);
            stmt.run(
              normalizedPubkey,
              validator.provider,
              validator.json_filename,
              (err) => {
                if (err) {
                  console.error('Error inserting validator:', err);
                } else {
                  inserted++;
                }
              }
            );
          });

          stmt.finalize((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      message: 'CSV file processed successfully',
      total: validators.length,
      inserted,
      updated
    });
  } catch (error) {
    console.error('Error processing CSV:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Upload and process Exit CSV file
router.post('/api/upload-exit-csv', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }

    const filePath = req.file.path;
    const filename = req.file.originalname || 'unknown.csv';
    const validators = await parseCSV(filePath);

    if (validators.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'No valid data found in CSV file' });
    }

    const db = getDatabase();
    
    // Create exit batch record
    const batchId = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO exit_batches (filename, total_validators)
        VALUES (?, ?)
      `, [filename, validators.length], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });

    let inserted = 0;

    // Process validators in batches
    const batchSize = 100;
    for (let i = 0; i < validators.length; i += batchSize) {
      const batch = validators.slice(i, i + batchSize);
      
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO exit_validators (batch_id, pubkey, status, updated_at)
            VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
          `);

          batch.forEach(validator => {
            const normalizedPubkey = normalizePubkey(validator.pubkey);
            stmt.run(batchId, normalizedPubkey, (err) => {
              if (err) {
                console.error('Error inserting exit validator:', err);
              } else {
                inserted++;
              }
            });
          });

          stmt.finalize((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      message: 'Exit CSV file processed successfully',
      batchId: batchId,
      total: validators.length,
      inserted
    });
  } catch (error) {
    console.error('Error processing exit CSV:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Get Exit Statistics
router.get('/api/exit-statistics', async (req, res) => {
  try {
    const db = getDatabase();
    
    // Get overall statistics
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'exit_queue' THEN 1 ELSE 0 END) as exit_queue,
          SUM(CASE WHEN status = 'inactive' OR status = 'pending' THEN 1 ELSE 0 END) as inactive
        FROM exit_validators
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Get statistics by batch
    const byBatch = await new Promise((resolve, reject) => {
      const batches = [];
      db.each(`
        SELECT 
          b.id,
          b.filename,
          b.uploaded_at,
          COUNT(e.id) as total,
          SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN e.status = 'exit_queue' THEN 1 ELSE 0 END) as exit_queue,
          SUM(CASE WHEN e.status = 'inactive' OR e.status = 'pending' THEN 1 ELSE 0 END) as inactive
        FROM exit_batches b
        LEFT JOIN exit_validators e ON b.id = e.batch_id
        GROUP BY b.id
        ORDER BY b.uploaded_at DESC
      `, (err, row) => {
        if (err) {
          reject(err);
        } else {
          batches.push(row);
        }
      }, (err) => {
        if (err) reject(err);
        else resolve(batches);
      });
    });

    // Get detailed statistics by provider and bucket for each batch
    const byBatchDetail = {};
    for (const batch of byBatch) {
      // By provider
      const byProvider = await new Promise((resolve, reject) => {
        const providers = {};
        db.each(`
          SELECT 
            COALESCE(v.provider, 'Unknown') as provider,
            COUNT(e.id) as total,
            SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN e.status = 'exit_queue' THEN 1 ELSE 0 END) as exit_queue,
            SUM(CASE WHEN e.status = 'inactive' OR e.status = 'pending' THEN 1 ELSE 0 END) as inactive
          FROM exit_validators e
          LEFT JOIN validators v ON e.pubkey = v.pubkey
          WHERE e.batch_id = ?
          GROUP BY v.provider
        `, [batch.id], (err, row) => {
          if (err) {
            reject(err);
          } else {
            providers[row.provider] = {
              total: row.total || 0,
              active: row.active || 0,
              exit_queue: row.exit_queue || 0,
              inactive: row.inactive || 0
            };
          }
        }, (err) => {
          if (err) reject(err);
          else resolve(providers);
        });
      });

      // By bucket
      const byBucket = await new Promise((resolve, reject) => {
        const buckets = {};
        db.each(`
          SELECT 
            COALESCE(v.provider, 'Unknown') as provider,
            COALESCE(v.bucket_no, 'Unknown') as bucket_no,
            COUNT(e.id) as total,
            SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN e.status = 'exit_queue' THEN 1 ELSE 0 END) as exit_queue,
            SUM(CASE WHEN e.status = 'inactive' OR e.status = 'pending' THEN 1 ELSE 0 END) as inactive
          FROM exit_validators e
          LEFT JOIN validators v ON e.pubkey = v.pubkey
          WHERE e.batch_id = ? AND v.provider IS NOT NULL AND v.bucket_no IS NOT NULL
          GROUP BY v.provider, v.bucket_no
        `, [batch.id], (err, row) => {
          if (err) {
            reject(err);
          } else {
            if (!buckets[row.provider]) {
              buckets[row.provider] = {};
            }
            buckets[row.provider][row.bucket_no] = {
              total: row.total || 0,
              active: row.active || 0,
              exit_queue: row.exit_queue || 0,
              inactive: row.inactive || 0
            };
          }
        }, (err) => {
          if (err) reject(err);
          else resolve(buckets);
        });
      });

      byBatchDetail[batch.id] = {
        byProvider,
        byBucket
      };
    }

    // Get last update time
    const lastUpdate = await new Promise((resolve, reject) => {
      db.get(`
        SELECT MAX(updated_at) as last_update 
        FROM exit_validators
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row?.last_update || null);
      });
    });

    res.json({
      totals: {
        total: stats.total || 0,
        active: stats.active || 0,
        exit_queue: stats.exit_queue || 0,
        inactive: stats.inactive || 0
      },
      byBatch: byBatch,
      byBatchDetail: byBatchDetail,
      lastUpdate: lastUpdate
    });
  } catch (error) {
    console.error('Error fetching exit statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Exit List (paginated)
router.get('/api/exit-list', async (req, res) => {
  try {
    const { provider, status, q = '', bucket_no = '', batch_id = '', limit = 100, offset = 0 } = req.query;
    const db = getDatabase();
    
    let where = 'WHERE 1=1';
    const params = [];

    if (batch_id) {
      where += ' AND e.batch_id = ?';
      params.push(batch_id);
    }

    if (provider) {
      where += ' AND v.provider = ?';
      params.push(provider);
    }

    if (status) {
      where += ' AND e.status = ?';
      params.push(status);
    }

    if (q || bucket_no) {
      const searchConditions = [];
      if (q) {
        searchConditions.push('e.pubkey LIKE ?');
        params.push(`%${q}%`);
      }
      if (bucket_no) {
        // Exact match for bucket_no
        searchConditions.push('v.bucket_no = ?');
        params.push(bucket_no);
      }
      if (searchConditions.length > 0) {
        where += ' AND (' + searchConditions.join(' OR ') + ')';
      }
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM exit_validators e ${where}`;
    const total = await new Promise((resolve, reject) => {
      db.get(countQuery, params, (err, row) => {
        if (err) reject(err);
        else resolve(row?.total || 0);
      });
    });

    // Get data with validator info from validators table
    const dataQuery = `
      SELECT 
        e.id,
        e.pubkey,
        e.status,
        e.batch_id,
        b.filename as batch_filename,
        b.uploaded_at as batch_uploaded_at,
        e.updated_at,
        v.provider,
        v.bucket_no,
        v.json_filename
      FROM exit_validators e
      LEFT JOIN exit_batches b ON e.batch_id = b.id
      LEFT JOIN validators v ON e.pubkey = v.pubkey
      ${where}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const data = await new Promise((resolve, reject) => {
      const items = [];
      db.each(dataQuery, [...params, parseInt(limit), parseInt(offset)], (err, row) => {
        if (err) {
          reject(err);
        } else {
          items.push(row);
        }
      }, (err) => {
        if (err) reject(err);
        else resolve(items);
      });
    });

    res.json({
      data: data,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching exit list:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync Exit List statuses
router.post('/api/sync-exit-statuses', async (req, res) => {
  try {
    const db = getDatabase();
    
    // Get all exit validators
    const validators = await new Promise((resolve, reject) => {
      const items = [];
      db.each(`
        SELECT pubkey FROM exit_validators
      `, (err, row) => {
        if (err) {
          reject(err);
        } else {
          items.push(row.pubkey);
        }
      }, (err) => {
        if (err) reject(err);
        else resolve(items);
      });
    });

    if (validators.length === 0) {
      return res.json({ message: 'No exit validators to sync', total: 0, status: 'completed' });
    }

    res.json({ message: 'Sync started', total: validators.length, status: 'processing' });

    // Process in background in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < validators.length; i += BATCH_SIZE) {
      const batch = validators.slice(i, i + BATCH_SIZE);
      
      try {
        // Normalize pubkeys before sending to API
        const normalizedBatch = batch.map(pk => normalizePubkey(pk));
        const statuses = await getValidatorStatusesBatch(normalizedBatch);
        
        // Convert array response to map (pubkey -> status)
        const statusMap = {};
        statuses.forEach(status => {
          const mappedStatus = mapBeaconStatus(status.status);
          const normalizedApiPubkey = normalizePubkey(status.pubkey);
          statusMap[normalizedApiPubkey] = mappedStatus;
        });
        
        // Update database in transaction
        await new Promise((resolve, reject) => {
          db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            const stmt = db.prepare(`
              UPDATE exit_validators 
              SET status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE pubkey = ?
            `);
            
            normalizedBatch.forEach(normalizedPubkey => {
              const status = statusMap[normalizedPubkey] || 'unknown';
              stmt.run(status, normalizedPubkey);
            });
            
            stmt.finalize((err) => {
              if (err) {
                db.run('ROLLBACK');
                reject(err);
              } else {
                db.run('COMMIT', (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              }
            });
          });
        });
        
        // Delay between batches
        if (i + BATCH_SIZE < validators.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err) {
        console.error(`Error processing batch ${i}-${i + BATCH_SIZE}:`, err);
      }
    }
  } catch (error) {
    console.error('Error syncing exit statuses:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete exit batch and its validators
router.delete('/api/exit-batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const db = getDatabase();

    // Delete exit validators first (foreign key constraint)
    await new Promise((resolve, reject) => {
      db.run(`
        DELETE FROM exit_validators WHERE batch_id = ?
      `, [batchId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    // Delete exit batch
    await new Promise((resolve, reject) => {
      db.run(`
        DELETE FROM exit_batches WHERE id = ?
      `, [batchId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    res.json({ message: 'Batch deleted successfully', batchId: parseInt(batchId) });
  } catch (error) {
    console.error('Error deleting exit batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Exit Queue info
router.get('/api/exit-queue', async (req, res) => {
  try {
    const data = await getExitQueueInfo();
    res.json(data);
  } catch (error) {
    console.error('Error fetching exit queue info:', error);
    res.status(500).json({ error: 'Failed to fetch exit queue info' });
  }
});

// Sync validator statuses from beacon API (batches of 500)
router.post('/api/sync-statuses', async (req, res) => {
  try {
    const db = getDatabase();
    
    // Get all validators from database
    const validators = await new Promise((resolve, reject) => {
      db.all('SELECT pubkey FROM validators ORDER BY created_at', [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    if (validators.length === 0) {
      return res.json({ message: 'No validators to sync', synced: 0, total: 0 });
    }

    // Send immediate response
    res.json({
      message: 'Sync started',
      total: validators.length,
      status: 'processing',
      batchSize: 500
    });

    // Process all validators sequentially in batches of 500
    const BATCH_SIZE = 500;
    let totalSynced = 0;
    const totalBatches = Math.ceil(validators.length / BATCH_SIZE);
    
    // Process batches sequentially
    for (let i = 0; i < validators.length; i += BATCH_SIZE) {
      const batch = validators.slice(i, i + BATCH_SIZE);
      const pubkeys = batch.map(v => normalizePubkey(v.pubkey));
      const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
      
      try {
        
        // Fetch statuses from Beacon API
        const statuses = await getValidatorStatusesBatch(pubkeys);
        const statusMap = {};
        
        statuses.forEach(status => {
          const mappedStatus = mapBeaconStatus(status.status);
          const normalizedApiPubkey = normalizePubkey(status.pubkey);
          statusMap[normalizedApiPubkey] = mappedStatus;
        });

        // Update database in batch transaction
        await new Promise((resolve, reject) => {
          db.serialize(() => {
            db.run('BEGIN TRANSACTION;');
            const stmt = db.prepare('UPDATE validators SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE pubkey = ?');
            
            let batchSynced = 0;
            let batchErrors = 0;
            
            pubkeys.forEach(pubkey => {
              const mappedStatus = statusMap[pubkey] || 'inactive';
              stmt.run([mappedStatus, pubkey], (err) => {
                if (err) {
                  console.error(`Error updating ${pubkey}:`, err.message);
                  batchErrors++;
                } else {
                  batchSynced++;
                }
              });
            });
            
            stmt.finalize((err) => {
              if (err) {
                db.run('ROLLBACK;');
                reject(err);
              } else {
                db.run('COMMIT;', (commitErr) => {
                  if (commitErr) {
                    reject(commitErr);
                  } else {
                    totalSynced += batchSynced;
                    resolve();
                  }
                });
              }
            });
          });
        });
        
        // Small delay between batches to avoid overwhelming the API
        if (i + BATCH_SIZE < validators.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`[${currentBatch}/${totalBatches}] Error processing batch:`, error.message);
        // Continue with next batch even if current batch fails
      }
    }
    
  } catch (error) {
    console.error('❌ Error syncing statuses:', error);
    // Response already sent, just log the error
  }
});

// Get statistics by provider and status
router.get('/api/statistics', async (req, res) => {
  try {
    const db = getDatabase();
    
    const stats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          provider,
          status,
          COUNT(*) as count
        FROM validators
        GROUP BY provider, status
        ORDER BY provider, status
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    // Format statistics
    const formatted = {
      Lido: { active: 0, exit_queue: 0, inactive: 0, total: 0 },
      Etherfi: { active: 0, exit_queue: 0, inactive: 0, total: 0 },
      Mantle: { active: 0, exit_queue: 0, inactive: 0, total: 0 }
    };

    stats.forEach(stat => {
      const provider = stat.provider;
      const status = stat.status;
      const count = stat.count;

      if (formatted[provider]) {
        formatted[provider][status] = count;
        formatted[provider].total += count;
      }
    });

    // Get total counts
    const totals = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'exit_queue' THEN 1 ELSE 0 END) as exit_queue,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
        FROM validators
      `, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    // Get last update time
    const lastUpdate = await new Promise((resolve, reject) => {
      db.get(`
        SELECT MAX(updated_at) as last_update
        FROM validators
      `, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row?.last_update || null);
        }
      });
    });

    // Get bucket statistics for each provider
    const bucketStats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          provider,
          bucket_no,
          status,
          COUNT(*) as count
        FROM validators
        WHERE provider IN ('Lido', 'Etherfi', 'Mantle')
          AND bucket_no IS NOT NULL
        GROUP BY provider, bucket_no, status
        ORDER BY provider, bucket_no, status
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    // Format bucket statistics by provider
    const byBucket = {};
    
    bucketStats.forEach((stat) => {
      const provider = stat.provider;
      const bucketNo = stat.bucket_no;
      const status = stat.status;
      const count = stat.count;

      if (!byBucket[provider]) {
        byBucket[provider] = {};
      }
      if (!byBucket[provider][bucketNo]) {
        byBucket[provider][bucketNo] = { active: 0, exit_queue: 0, inactive: 0, total: 0 };
      }

      byBucket[provider][bucketNo][status] = count;
      byBucket[provider][bucketNo].total += count;
    });

    res.json({
      byProvider: formatted,
      byBucket: byBucket,
      totals: {
        total: totals.total || 0,
        active: totals.active || 0,
        exit_queue: totals.exit_queue || 0,
        inactive: totals.inactive || 0
      },
      lastUpdate: lastUpdate
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get validators with filters and pagination
// Query: provider, status, q (pubkey search), bucket_no, limit, offset
router.get('/api/validators', async (req, res) => {
  try {
    const { provider, status, q = '', bucket_no = '', limit = 100, offset = 0 } = req.query;
    const db = getDatabase();
    
    let where = 'WHERE 1=1';
    const params = [];

    if (provider) {
      where += ' AND provider = ?';
      params.push(provider);
    }

    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    if (q || bucket_no) {
      const searchConditions = [];
      if (q) {
        searchConditions.push('pubkey LIKE ?');
        params.push(`%${q}%`);
      }
      if (bucket_no) {
        // Exact match for bucket_no
        searchConditions.push('bucket_no = ?');
        params.push(bucket_no);
      }
      if (searchConditions.length > 0) {
        where += ' AND (' + searchConditions.join(' OR ') + ')';
      }
    }

    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    const offsetNum = parseInt(offset, 10) || 0;

    const dataQuery = `
      SELECT * FROM validators
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const countQuery = `
      SELECT COUNT(*) as total FROM validators
      ${where}
    `;

    const validators = await new Promise((resolve, reject) => {
      db.all(dataQuery, [...params, limitNum, offsetNum], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const count = await new Promise((resolve, reject) => {
      db.get(countQuery, params, (err, row) => {
        if (err) reject(err);
        else resolve(row.total || 0);
      });
    });

    const normalizedValidators = validators.map(v => ({
      ...v,
      pubkey: normalizePubkey(v.pubkey)
    }));

    res.json({
      data: normalizedValidators,
      total: count,
      limit: limitNum,
      offset: offsetNum
    });
  } catch (error) {
    console.error('Error fetching validators:', error);
    res.status(500).json({ error: error.message });
  }
});

function setupRoutes(app) {
  app.use(router);
}

module.exports = {
  setupRoutes
};

