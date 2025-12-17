require('dotenv').config();
const { initDatabase, getDatabase } = require('../server/db');
const { parseCSV } = require('../server/csvParser');
const path = require('path');
const fs = require('fs');

/**
 * Load all CSV files into database
 */
async function loadAllCSV() {
  try {
    console.log('Initializing database...');
    await initDatabase();
    
    const csvFiles = [
      'Lido_keystore_full.csv',
      'Etherfi_keystore_full.csv',
      'Mantle_keystore_full.csv'
    ];
    
    const db = getDatabase();
    let totalInserted = 0;
    let totalErrors = 0;
    
    for (const csvFile of csvFiles) {
      const csvFilePath = path.join(__dirname, '..', csvFile);
      
      if (!fs.existsSync(csvFilePath)) {
        console.warn(`\n⚠️  CSV file not found: ${csvFile}, skipping...`);
        continue;
      }
      
      console.log(`\n📄 Processing: ${csvFile}`);
      console.log('='.repeat(60));
      
      let validators;
      try {
        validators = await parseCSV(csvFilePath);
        console.log(`Found ${validators.length} validators`);
      } catch (error) {
        console.error(`Error parsing CSV ${csvFile}:`, error.message);
        continue;
      }
      
      if (validators.length === 0) {
        console.warn(`No valid data found in ${csvFile}`);
        continue;
      }
      
      let inserted = 0;
      let errors = 0;
      
      // Process validators in batches
      const batchSize = 100;
      for (let i = 0; i < validators.length; i += batchSize) {
        const batch = validators.slice(i, i + batchSize);
        
        await new Promise((resolve, reject) => {
          db.serialize(() => {
            db.run('BEGIN TRANSACTION;');
            
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
                db.run('ROLLBACK;');
                reject(err);
              } else {
                db.run('COMMIT;', (commitErr) => {
                  if (commitErr) {
                    console.error('Error committing transaction:', commitErr);
                    reject(commitErr);
                  } else {
                    resolve();
                  }
                });
              }
            });
          });
        });
        
        // Progress indicator
        if ((i + batchSize) % 1000 === 0 || i + batchSize >= validators.length) {
          console.log(`  Processed ${Math.min(i + batchSize, validators.length)}/${validators.length} validators...`);
        }
      }
      
      console.log(`✅ ${csvFile}: ${inserted} inserted/updated, ${errors} errors`);
      totalInserted += inserted;
      totalErrors += errors;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Final Summary');
    console.log('='.repeat(60));
    console.log(`Total Inserted/Updated: ${totalInserted}`);
    console.log(`Total Errors: ${totalErrors}`);
    
    // Get final statistics
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
    
    console.log('\n📈 Database Statistics by Provider:');
    stats.forEach(stat => {
      console.log(`  ${stat.provider}: ${stat.count.toLocaleString()} validators`);
    });
    
    // Get status statistics
    const statusStats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          status,
          COUNT(*) as count
        FROM validators
        GROUP BY status
        ORDER BY status
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
    
    console.log('\n📊 Database Statistics by Status:');
    statusStats.forEach(stat => {
      console.log(`  ${stat.status}: ${stat.count.toLocaleString()} validators`);
    });
    
    db.close();
    process.exit(0);
  } catch (error) {
    console.error('Error loading CSV files:', error);
    process.exit(1);
  }
}

loadAllCSV();




