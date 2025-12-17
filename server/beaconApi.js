const axios = require('axios');
const { normalizePubkey } = require('./utils');

const BEACON_API_URL = process.env.BEACON_API_URL || 'https://ethereum-beacon-api.publicnode.com';

// Get validator status from beacon API
async function getValidatorStatus(pubkey) {
  try {
    const formattedPubkey = normalizePubkey(pubkey);
    
    const response = await axios.get(
      `${BEACON_API_URL}/eth/v1/beacon/states/head/validators/${formattedPubkey}`,
      {
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (response.data && response.data.data) {
      const validator = response.data.data;
      return {
        status: validator.status,
        pubkey: validator.validator.pubkey,
        effective_balance: validator.validator.effective_balance,
        slashed: validator.validator.slashed
      };
    }
    
    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) return null;
    console.error(`Error fetching validator status for ${pubkey}:`, error.message);
    throw error;
  }
}

// Get validator statuses in batch
async function getValidatorStatusesBatch(pubkeys) {
  try {
    const formattedPubkeys = pubkeys.map(pk => normalizePubkey(pk));
    const response = await axios.post(
      `${BEACON_API_URL}/eth/v1/beacon/states/head/validators`,
      { ids: formattedPubkeys },
      {
        timeout: 60000,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.data) {
      return response.data.data.map(validator => ({
        status: validator.status,
        pubkey: validator.validator.pubkey,
        effective_balance: validator.validator.effective_balance,
        slashed: validator.validator.slashed
      }));
    }
    
    return [];
  } catch (error) {
    // Fallback to individual requests
    console.warn('Batch request failed, falling back to individual requests:', error.message);
    const results = [];
    const CHUNK_SIZE = 50;
    for (let i = 0; i < pubkeys.length; i += CHUNK_SIZE) {
      const chunk = pubkeys.slice(i, i + CHUNK_SIZE);
      const chunkPromises = chunk.map(async (pubkey) => {
        try {
          return await getValidatorStatus(pubkey);
        } catch (err) {
          console.error(`Error fetching status for ${pubkey}:`, err.message);
          return null;
        }
      });
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults.filter(r => r !== null));
      if (i + CHUNK_SIZE < pubkeys.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    return results;
  }
}

// Map beacon API status to internal status
function mapBeaconStatus(beaconStatus) {
  if (beaconStatus === 'active_ongoing' || beaconStatus === 'active_exiting' || beaconStatus === 'active_slashed') {
    return 'active';
  } else if (beaconStatus === 'pending_queued' || beaconStatus === 'exited_unslashed' || beaconStatus === 'exited_slashed') {
    return 'exit_queue';
  }
  return 'inactive';
}

module.exports = {
  getValidatorStatus,
  getValidatorStatusesBatch,
  mapBeaconStatus
};

