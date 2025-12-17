// Normalize pubkey: ensure 0x prefix and lowercase
function normalizePubkey(pubkey) {
  if (!pubkey) return pubkey;
  let normalized = pubkey.trim();
  if (!normalized.startsWith('0x')) normalized = '0x' + normalized;
  return normalized.toLowerCase();
}

module.exports = {
  normalizePubkey
};


