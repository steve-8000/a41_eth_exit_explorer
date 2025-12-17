const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { normalizePubkey } = require('./utils');

// Parse CSV file and extract validator information
// Supports multiple formats: full keystore, simple (pubkey,provider,json_filename), or Lido format
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    if (!fs.existsSync(filePath)) {
      reject(new Error(`CSV file not found: ${filePath}`));
      return;
    }

    // Detect provider from filename
    const filename = path.basename(filePath).toLowerCase();
    let defaultProvider = 'Lido';
    if (filename.includes('etherfi')) defaultProvider = 'Etherfi';
    else if (filename.includes('mantle')) defaultProvider = 'Mantle';

    // Detect delimiter
    const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';
    
    fs.createReadStream(filePath)
      .pipe(csv({ separator: delimiter }))
      .on('data', (data) => {
        let pubkey = (data.pubkey || data.pubKey || data.pub_key || '').trim();
        if (!pubkey) return;

        pubkey = normalizePubkey(pubkey);
        const jsonFilename = (
          data.filename || data.json_filename || data.jsonFilename || 
          data.json_file || data.keystore_id || data.keystoreId || data.keystore || ''
        ).trim();
        const bucketNo = (data.bucket_no || data.bucketNo || data.bucket || '').trim();
        const provider = (data.provider || data.Provider || '').trim();
        
        // Normalize provider
        let normalizedProvider = provider.toLowerCase();
        if (normalizedProvider.includes('lido')) normalizedProvider = 'Lido';
        else if (normalizedProvider.includes('etherfi')) normalizedProvider = 'Etherfi';
        else if (normalizedProvider.includes('mantle')) normalizedProvider = 'Mantle';
        else if (provider) normalizedProvider = provider;
        else normalizedProvider = defaultProvider;

        results.push({
          pubkey: pubkey,
          provider: normalizedProvider,
          json_filename: jsonFilename || null,
          bucket_no: bucketNo || null
        });
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

module.exports = {
  parseCSV
};

