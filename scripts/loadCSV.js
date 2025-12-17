require('dotenv').config();
const { initDatabase, getDatabase } = require('../server/db');
const { parseCSV } = require('../server/csvParser');
const path = require('path');

/**
 * Load CSV file into database
 */
async function loadCSV(csvFilePath) {
  try {
    console.log('Initializing database...');
    await initDatabase();
    
    console.log(`Parsing CSV file: ${csvFilePath}`);
    const validators = await parseCSV(csvFilePath);
    
    if (validators.length === 0) {
      console.error('No valid data found in CSV file');
      process.exit(1);
    }
    
    console.log(`Found ${validators.length} validators`);
    
    const db = getDatabase();
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    
    // Process validators in batches
    const batchSize = 100;
    for (let i = 0; i < validators.length; i += batchSize) {
      const batch = validators.slice(i, i + batchSize);
      
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO validators (pubkey, provider, status, json_filename, bucket_no, updated_at)
            VALUES (?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)
          `);
          
          batch.forEach(validator => {
            stmt.run(
              validator.pubkey,
              validator.provider,
              validator.json_filename,
              validator.bucket_no || null,
              (err) => {
                if (err) {
                  console.error(`Error inserting validator ${validator.pubkey}:`, err.message);
                  errors++;
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
      
      // Progress indicator
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= validators.length) {
        console.log(`Processed ${Math.min(i + batchSize, validators.length)}/${validators.length} validators...`);
      }
    }
    
    console.log('\n=== Load Complete ===');
    console.log(`Total validators: ${validators.length}`);
    console.log(`Inserted/Updated: ${inserted}`);
    console.log(`Errors: ${errors}`);
    
    // Get statistics
    const stats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          provider,
          COUNT(*) as count
        FROM validators
        GROUP BY provider
        ORDER BY provider
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
    
    console.log('\n=== Database Statistics ===');
    stats.forEach(stat => {
      console.log(`${stat.provider}: ${stat.count} validators`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error loading CSV:', error);
    process.exit(1);
  }
}

// Get CSV file path from command line argument or use default
const csvFilePath = process.argv[2] || path.join(__dirname, '../Lido_keystore_full.csv');

if (!require('fs').existsSync(csvFilePath)) {
  console.error(`CSV file not found: ${csvFilePath}`);
  console.log('Usage: node scripts/loadCSV.js [path/to/csv/file]');
  process.exit(1);
}

loadCSV(csvFilePath);

