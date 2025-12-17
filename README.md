# A41 Ethereum Exit Status Dashboard

Web dashboard for monitoring Ethereum validator exit status across multiple providers (Lido, Etherfi, Mantle).

## Features

- CSV upload for validator public keys
- Beacon API integration for real-time status sync
- Statistics by provider and bucket number
- Exit list management with batch tracking
- Search and filter by pubkey, bucket number, provider, and status

## Quick Start

1. Install dependencies:
```bash
npm install && cd client && npm install && cd ..
```

2. Configure environment (`.env`):
```
BEACON_API_URL=https://ethereum-beacon-api.publicnode.com
PORT=3001
NODE_ENV=production
DB_PATH=./data/eth_exit.db
```

3. Build and start:
```bash
cd client && npm run build && cd .. && npm start
```

## CSV Format

Required: `pubkey`  
Optional: `provider`, `json_filename`, `bucket_no`

Provider is auto-detected from filename if not specified.

## License

MIT
