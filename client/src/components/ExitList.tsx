import React, { useEffect, useState } from 'react';
import './ExitList.css';

// Provider logos mapping
const PROVIDER_LOGOS: { [key: string]: string } = {
  'Lido': 'https://s2.coinmarketcap.com/static/img/coins/64x64/8085.png',
  'Etherfi': 'https://s2.coinmarketcap.com/static/img/coins/64x64/29814.png',
  'Mantle': 'https://s2.coinmarketcap.com/static/img/coins/64x64/27075.png',
};

type ExitValidator = {
  id: number;
  pubkey: string;
  status: string;
  batch_id: number;
  batch_filename?: string;
  batch_uploaded_at?: string;
  updated_at?: string;
  provider?: string | null;
  bucket_no?: string | null;
  json_filename?: string | null;
};

type ApiResponse = {
  data: ExitValidator[];
  total: number;
  limit: number;
  offset: number;
};

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

interface ExitListProps {
  initialBatchId?: number;
  initialProvider?: string;
  initialBucketNo?: string;
}

const ExitList: React.FC<ExitListProps> = ({ initialBatchId, initialProvider, initialBucketNo }) => {
  const [items, setItems] = useState<ExitValidator[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState('');
  const [bucketNo, setBucketNo] = useState('');
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [batchId, setBatchId] = useState('');

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
      if (batchId) params.append('batch_id', batchId);

      const res = await fetch(`/api/exit-list?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch exit list');
      const data: ApiResponse = await res.json();
      setItems(data.data);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch exit list');
    } finally {
      setLoading(false);
    }
  };

  // Update filters when initial props change
  useEffect(() => {
    if (initialBatchId !== undefined) {
      setBatchId(initialBatchId.toString());
    }
    if (initialProvider !== undefined) {
      setProvider(initialProvider);
    }
    if (initialBucketNo !== undefined) {
      setBucketNo(initialBucketNo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBatchId, initialProvider, initialBucketNo]);

  // Fetch data when page or pageSize changes
  useEffect(() => {
    if (page !== 0) {
      setPage(0);
    } else {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  // Fetch data when filters change (initial props or manual changes)
  useEffect(() => {
    if (page !== 0) {
      setPage(0);
    } else {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, provider, bucketNo]);

  // Auto-search with debounce when search text filters change (q, bucketNo)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setPage(0);
      // fetchData will be called by page change effect
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, bucketNo]);

  // Immediate search when dropdown filters change (provider, status, batchId)
  useEffect(() => {
    setPage(0);
    // fetchData will be called by page change effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, status, batchId]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="exit-list" id="exit-list-section">
      <div className="exit-list-header">
        <h2 className="section-title">Exit List</h2>
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
          <select value={provider} onChange={(e) => {
            setProvider(e.target.value);
            setPage(0);
          }}>
            <option value="">All Providers</option>
            <option value="Lido">Lido</option>
            <option value="Etherfi">Etherfi</option>
            <option value="Mantle">Mantle</option>
          </select>
          <select value={status} onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}>
            <option value="">All Status</option>
            <option value="active">active</option>
            <option value="exit_queue">exit_queue</option>
            <option value="inactive">inactive</option>
            <option value="pending">pending</option>
          </select>
          <button onClick={() => { setPage(0); fetchData(); }} disabled={loading}>
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: 'var(--md-space-3)' }}>
          {error}
        </div>
      )}

      <div className="exit-table-wrapper">
        <table className="exit-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Batch</th>
              <th>Provider</th>
              <th>Bucket No</th>
              <th>JSON File</th>
              <th>Pubkey</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="loading-cell">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-cell">
                  No exit validators found
                </td>
              </tr>
            ) : (
              items.map((v, index) => {
                const providerLogo = v.provider ? PROVIDER_LOGOS[v.provider] : null;
                
                return (
                  <tr key={v.id}>
                    <td className="number-cell">{(page * pageSize) + index + 1}</td>
                    <td className="batch-cell">
                      <div className="batch-info">
                        <div className="batch-filename">{v.batch_filename || `Batch #${v.batch_id}`}</div>
                        {v.batch_uploaded_at && (
                          <div className="batch-date">
                            {new Date(v.batch_uploaded_at).toLocaleDateString('ko-KR')}
                          </div>
                        )}
                      </div>
                    </td>
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
                    <td className="pubkey-cell">
                      <a 
                        href={`https://beaconcha.in/validator/${v.pubkey.startsWith('0x') ? v.pubkey.substring(2) : v.pubkey}`} 
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
              })
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
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
          <span className="page-info">Page {page + 1} / {totalPages}</span>
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
      )}
    </div>
  );
};

export default ExitList;

