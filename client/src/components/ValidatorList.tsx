import React, { useEffect, useState } from 'react';
import './ValidatorList.css';

// Provider logos mapping
const PROVIDER_LOGOS: { [key: string]: string } = {
  'Lido': 'https://s2.coinmarketcap.com/static/img/coins/64x64/8085.png',
  'Etherfi': 'https://s2.coinmarketcap.com/static/img/coins/64x64/29814.png',
  'Mantle': 'https://s2.coinmarketcap.com/static/img/coins/64x64/27075.png',
};

type Validator = {
  pubkey: string;
  provider: string;
  status: string;
  json_filename?: string | null;
  bucket_no?: string | null;
  updated_at?: string;
};

type ApiResponse = {
  data: Validator[];
  total: number;
  limit: number;
  offset: number;
};

interface ValidatorListProps {
  initialProvider?: string;
  initialBucketNo?: string;
}

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

const ValidatorList: React.FC<ValidatorListProps> = ({ initialProvider = '', initialBucketNo = '' }) => {
  const [items, setItems] = useState<Validator[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState('');
  const [bucketNo, setBucketNo] = useState(initialBucketNo);
  const [provider, setProvider] = useState(initialProvider);
  const [status, setStatus] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('limit', pageSize.toString());
      params.append('offset', (page * pageSize).toString());
      if (q) params.append('q', q);
      if (bucketNo) params.append('bucket_no', bucketNo);
      if (provider) params.append('provider', provider);
      if (status) params.append('status', status);

      const res = await fetch(`/api/validators?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch validators');
      const data: ApiResponse = await res.json();
      setItems(data.data);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch validators');
    } finally {
      setLoading(false);
    }
  };

  // Update filters when initial props change
  useEffect(() => {
    if (initialProvider !== undefined) {
      setProvider(initialProvider);
    }
    if (initialBucketNo !== undefined) {
      setBucketNo(initialBucketNo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProvider, initialBucketNo]);

  // Fetch data when page or pageSize changes
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  // Auto-search with debounce when search text filters change (q, bucketNo)
  // Uses OR condition - user can input one or both
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (page !== 0) {
        // Changing page to 0 will trigger fetchData via page effect
        setPage(0);
      } else {
        // Already on first page, fetch immediately
        fetchData();
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, bucketNo]);

  // Immediate search when dropdown filters change (provider, status)
  // These are individual filters applied with AND condition
  useEffect(() => {
    if (page !== 0) {
      setPage(0);
    } else {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, status]);

  const handleSearch = () => {
    setPage(0);
    fetchData();
  };

  // Handle provider change - immediate filter (including "All Providers")
  const handleProviderChange = (value: string) => {
    setProvider(value);
    setPage(0);
    // fetchData will be triggered by useEffect
  };

  // Handle status change - immediate filter (including "All Status")
  const handleStatusChange = (value: string) => {
    setStatus(value);
    setPage(0);
    // fetchData will be triggered by useEffect
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="validator-list" id="pubkey-list-section">
      <div className="validator-list-header">
        <h2 className="section-title">Pubkey List</h2>
        <div className="filters">
          <input
            type="text"
            placeholder="Search pubkey..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search bucket no..."
            value={bucketNo}
            onChange={(e) => setBucketNo(e.target.value)}
          />
          <select value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
            <option value="">All Providers</option>
            <option value="Lido">Lido</option>
            <option value="Etherfi">Etherfi</option>
            <option value="Mantle">Mantle</option>
          </select>
          <select value={status} onChange={(e) => handleStatusChange(e.target.value)}>
            <option value="">All Status</option>
            <option value="active">active</option>
            <option value="exit_queue">exit_queue</option>
            <option value="inactive">inactive</option>
            <option value="pending">pending</option>
          </select>
          <button onClick={handleSearch} disabled={loading}>
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>
      </div>

      <div className="validator-table-wrapper">
        <table className="validator-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Provider</th>
              <th>Bucket No</th>
              <th>JSON File</th>
              <th>Pubkey</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v, index) => {
              // Remove 0x prefix from pubkey for beaconcha.in URL
              const pubkeyWithoutPrefix = v.pubkey.startsWith('0x') ? v.pubkey.slice(2) : v.pubkey;
              const beaconchaUrl = `https://beaconcha.in/validator/${pubkeyWithoutPrefix}`;
              
              const providerLogo = v.provider ? PROVIDER_LOGOS[v.provider] : null;
              
              return (
                <tr key={v.pubkey}>
                  <td className="number-cell">{(page * pageSize) + index + 1}</td>
                  <td className="provider-cell">
                    {v.provider ? (
                      <div className="provider-badge">
                        {providerLogo && (
                          <img 
                            src={providerLogo} 
                            alt={v.provider}
                            className="provider-logo"
                          />
                        )}
                        <span className="provider-name">{v.provider}</span>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{v.bucket_no || '-'}</td>
                  <td className="json-file-cell">{v.json_filename || '-'}</td>
                  <td className="pubkey-cell mono">
                    <a 
                      href={beaconchaUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="pubkey-link"
                    >
                      {v.pubkey}
                    </a>
                  </td>
                  <td>
                    <span className={`status-badge status-${v.status}`}>{v.status}</span>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="empty">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
          Prev
        </button>
        <div className="page-numbers">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 10) {
              pageNum = i;
            } else if (page < 5) {
              pageNum = i;
            } else if (page >= totalPages - 5) {
              pageNum = totalPages - 10 + i;
            } else {
              pageNum = page - 4 + i;
            }
            
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                disabled={loading}
                className={pageNum === page ? 'active' : ''}
              >
                {pageNum + 1}
              </button>
            );
          })}
        </div>
        <span className="page-info">
          Page {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
          disabled={page + 1 >= totalPages || loading}
        >
          Next
        </button>
        <span className="total">Total: {total.toLocaleString()}</span>
        <div className="page-size-selector">
          <span className="page-size-label">Show:</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            disabled={loading}
            className="page-size-select"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
};

export default ValidatorList;

