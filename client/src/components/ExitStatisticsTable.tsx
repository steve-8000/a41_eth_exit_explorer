import React, { useState } from 'react';
import './ExitStatisticsTable.css';

// Provider logos mapping
const PROVIDER_LOGOS: { [key: string]: string } = {
  'Lido': 'https://s2.coinmarketcap.com/static/img/coins/64x64/8085.png',
  'Etherfi': 'https://s2.coinmarketcap.com/static/img/coins/64x64/29814.png',
  'Mantle': 'https://s2.coinmarketcap.com/static/img/coins/64x64/27075.png',
};

interface BatchStats {
  id: number;
  filename: string;
  uploaded_at: string;
  total: number;
  active: number;
  exit_queue: number;
  inactive: number;
}

interface BatchDetail {
  byProvider: {
    [provider: string]: {
      total: number;
      active: number;
      exit_queue: number;
      inactive: number;
    };
  };
  byBucket: {
    [provider: string]: {
      [bucketNo: string]: {
        total: number;
        active: number;
        exit_queue: number;
        inactive: number;
      };
    };
  };
}

interface ExitStatistics {
  totals: {
    total: number;
    active: number;
    exit_queue: number;
    inactive: number;
  };
  byBatch: BatchStats[];
  byBatchDetail?: {
    [batchId: number]: BatchDetail;
  };
  lastUpdate?: string;
}

interface ExitStatisticsTableProps {
  statistics: ExitStatistics;
  onDelete?: (batchId: number) => void;
  onProviderClick?: (batchId: number, provider: string) => void;
  onBucketClick?: (batchId: number, provider: string, bucketNo: string) => void;
}

const ExitStatisticsTable: React.FC<ExitStatisticsTableProps> = ({ 
  statistics, 
  onDelete,
  onProviderClick,
  onBucketClick
}) => {
  const { totals, byBatch, byBatchDetail } = statistics;
  const [deletingBatchId, setDeletingBatchId] = useState<number | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const handleDelete = async (batchId: number, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete the batch "${filename}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingBatchId(batchId);
      const response = await fetch(`/api/exit-batch/${batchId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete batch');
      }

      if (onDelete) {
        onDelete(batchId);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete batch');
    } finally {
      setDeletingBatchId(null);
    }
  };

  const handleProviderClick = (batchId: number, provider: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const providerKey = `${batchId}-${provider}`;
    if (expandedProvider === providerKey) {
      setExpandedProvider(null);
    } else {
      setExpandedProvider(providerKey);
    }
  };

  const calculatePercentage = (value: number, total: number): string => {
    if (total === 0) return '0.0';
    return ((value / total) * 100).toFixed(1);
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const getProviderStats = (batchId: number) => {
    if (!byBatchDetail || !byBatchDetail[batchId]) {
      return [];
    }
    return Object.entries(byBatchDetail[batchId].byProvider || {})
      .map(([provider, stats]) => ({ provider, ...stats }))
      .sort((a, b) => {
        const order = ['Lido', 'Etherfi', 'Mantle'];
        const aIndex = order.indexOf(a.provider);
        const bIndex = order.indexOf(b.provider);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.provider.localeCompare(b.provider);
      });
  };

  const getBucketStats = (batchId: number, provider: string) => {
    if (!byBatchDetail || !byBatchDetail[batchId] || !byBatchDetail[batchId].byBucket[provider]) {
      return [];
    }
    return Object.entries(byBatchDetail[batchId].byBucket[provider])
      .map(([bucketNo, stats]) => ({ bucketNo, ...stats }))
      .sort((a, b) => {
        const aNum = parseInt(a.bucketNo) || 0;
        const bNum = parseInt(b.bucketNo) || 0;
        return aNum - bNum;
      });
  };

  const activePercent = totals.total > 0 ? calculatePercentage(totals.active, totals.total) : '0.0';
  const exitQueuePercent = totals.total > 0 ? calculatePercentage(totals.exit_queue, totals.total) : '0.0';
  const inactivePercent = totals.total > 0 ? calculatePercentage(totals.inactive, totals.total) : '0.0';

  return (
    <div className="exit-statistics-wrapper">
      <div className="table-wrapper">
        <div className="table-header">
          <h2 className="section-title">Exit Statistics</h2>
        </div>
        <table className="exit-statistics-table">
          <thead>
            <tr>
              <th>Batch</th>
              <th>Total</th>
              <th>Active</th>
              <th>Exit Queue</th>
              <th>Inactive</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {byBatch.map((batch) => {
              const batchActivePercent = calculatePercentage(batch.active, batch.total);
              const batchExitQueuePercent = calculatePercentage(batch.exit_queue, batch.total);
              const batchInactivePercent = calculatePercentage(batch.inactive, batch.total);
              const nonActivePercent = parseFloat(batchExitQueuePercent) + parseFloat(batchInactivePercent);
              const providerStats = getProviderStats(batch.id);

              return (
                <React.Fragment key={batch.id}>
                  <tr className="batch-row">
                    <td className="batch-cell">
                      <div className="batch-filename">
                        <span className="batch-filename-text">{batch.filename}</span>
                      </div>
                      <div className="batch-date">
                        {new Date(batch.uploaded_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })}
                      </div>
                    </td>
                    <td className="number-cell">{formatNumber(batch.total)}</td>
                    <td className="number-cell active">
                      {formatNumber(batch.active)} <span className="percentage">({batchActivePercent}%)</span>
                    </td>
                    <td className="number-cell exit-queue">
                      {formatNumber(batch.exit_queue)} <span className="percentage">({batchExitQueuePercent}%)</span>
                    </td>
                    <td className="number-cell inactive">
                      {formatNumber(batch.inactive)} <span className="percentage">({batchInactivePercent}%)</span>
                    </td>
                    <td className="progress-cell">
                      <div className="progress-bar-container">
                        <div className="progress-bar">
                          {parseFloat(batchActivePercent) > 0 && (
                            <div className="progress-segment active" style={{ width: `${batchActivePercent}%` }} />
                          )}
                          {nonActivePercent > 0 && (
                            <div className="progress-segment non-active" style={{ width: `${nonActivePercent}%` }} />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="action-cell" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="delete-button"
                        onClick={(e) => handleDelete(batch.id, batch.filename, e)}
                        disabled={deletingBatchId === batch.id}
                        title="Delete batch"
                      >
                        {deletingBatchId === batch.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                  {providerStats.length > 0 && (
                    <tr className="batch-details-row">
                      <td colSpan={7} className="batch-details-cell">
                        <table className="batch-details-table">
                          <thead>
                            <tr>
                              <th>Provider</th>
                              <th>Total</th>
                              <th>Active</th>
                              <th>Exit Queue</th>
                              <th>Inactive</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {providerStats.map((provider) => {
                              const providerActivePercent = calculatePercentage(provider.active, provider.total);
                              const providerExitQueuePercent = calculatePercentage(provider.exit_queue, provider.total);
                              const providerInactivePercent = calculatePercentage(provider.inactive, provider.total);
                              const providerNonActivePercent = parseFloat(providerExitQueuePercent) + parseFloat(providerInactivePercent);
                              const providerLogo = PROVIDER_LOGOS[provider.provider] || null;
                              const bucketStats = getBucketStats(batch.id, provider.provider);

                              const providerKey = `${batch.id}-${provider.provider}`;
                              const isProviderExpanded = expandedProvider === providerKey;

                              return (
                                <React.Fragment key={provider.provider}>
                                  <tr 
                                    className={`provider-detail-row ${isProviderExpanded ? 'expanded' : ''}`}
                                    onClick={(e) => handleProviderClick(batch.id, provider.provider, e)}
                                    style={{ cursor: bucketStats.length > 0 ? 'pointer' : 'default' }}
                                  >
                                    <td className="provider-cell">
                                      <div className="provider-badge">
                                        {providerLogo && (
                                          <img 
                                            src={providerLogo} 
                                            alt={provider.provider}
                                            className="provider-logo"
                                          />
                                        )}
                                        <span className="provider-name">{provider.provider}</span>
                                        {bucketStats.length > 0 && (
                                          <span className="expand-icon" style={{ marginLeft: '8px' }}>
                                            {isProviderExpanded ? '▼' : '▶'}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="number-cell">{formatNumber(provider.total)}</td>
                                    <td className="number-cell active">
                                      {formatNumber(provider.active)} <span className="percentage">({providerActivePercent}%)</span>
                                    </td>
                                    <td className="number-cell exit-queue">
                                      {formatNumber(provider.exit_queue)} <span className="percentage">({providerExitQueuePercent}%)</span>
                                    </td>
                                    <td className="number-cell inactive">
                                      {formatNumber(provider.inactive)} <span className="percentage">({providerInactivePercent}%)</span>
                                    </td>
                                    <td className="progress-cell">
                                      <div className="progress-bar-container">
                                        <div className="progress-bar">
                                          {parseFloat(providerActivePercent) > 0 && (
                                            <div className="progress-segment active" style={{ width: `${providerActivePercent}%` }} />
                                          )}
                                          {providerNonActivePercent > 0 && (
                                            <div className="progress-segment non-active" style={{ width: `${providerNonActivePercent}%` }} />
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                  {isProviderExpanded && bucketStats.length > 0 && (
                                    <tr className="bucket-details-row">
                                      <td colSpan={6} className="bucket-details-cell">
                                        <table className="bucket-table">
                                          <thead>
                                            <tr>
                                              <th>Bucket No</th>
                                              <th>Total</th>
                                              <th>Active</th>
                                              <th>Exit Queue</th>
                                              <th>Inactive</th>
                                              <th>Status</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {bucketStats.map((bucket) => {
                                              const bucketActivePercent = calculatePercentage(bucket.active, bucket.total);
                                              const bucketExitQueuePercent = calculatePercentage(bucket.exit_queue, bucket.total);
                                              const bucketInactivePercent = calculatePercentage(bucket.inactive, bucket.total);
                                              const bucketNonActivePercent = parseFloat(bucketExitQueuePercent) + parseFloat(bucketInactivePercent);

                                              return (
                                                <tr key={bucket.bucketNo}>
                                                  <td 
                                                    className="bucket-no-cell clickable"
                                                    onClick={() => onBucketClick && onBucketClick(batch.id, provider.provider, bucket.bucketNo)}
                                                    style={{ cursor: onBucketClick ? 'pointer' : 'default' }}
                                                  >
                                                    {bucket.bucketNo}
                                                  </td>
                                                  <td className="number-cell">{formatNumber(bucket.total)}</td>
                                                  <td className="number-cell active">
                                                    {formatNumber(bucket.active)} <span className="percentage">({bucketActivePercent}%)</span>
                                                  </td>
                                                  <td className="number-cell exit-queue">
                                                    {formatNumber(bucket.exit_queue)} <span className="percentage">({bucketExitQueuePercent}%)</span>
                                                  </td>
                                                  <td className="number-cell inactive">
                                                    {formatNumber(bucket.inactive)} <span className="percentage">({bucketInactivePercent}%)</span>
                                                  </td>
                                                  <td className="progress-cell">
                                                    <div className="progress-bar-container">
                                                      <div className="progress-bar">
                                                        {parseFloat(bucketActivePercent) > 0 && (
                                                          <div className="progress-segment active" style={{ width: `${bucketActivePercent}%` }} />
                                                        )}
                                                        {bucketNonActivePercent > 0 && (
                                                          <div className="progress-segment non-active" style={{ width: `${bucketNonActivePercent}%` }} />
                                                        )}
                                                      </div>
                                                    </div>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            <tr className="totals-row">
              <td className="totals-label">Total</td>
              <td className="number-cell">{formatNumber(totals.total)}</td>
              <td className="number-cell active">
                {formatNumber(totals.active)} <span className="percentage">({activePercent}%)</span>
              </td>
              <td className="number-cell exit-queue">
                {formatNumber(totals.exit_queue)} <span className="percentage">({exitQueuePercent}%)</span>
              </td>
              <td className="number-cell inactive">
                {formatNumber(totals.inactive)} <span className="percentage">({inactivePercent}%)</span>
              </td>
              <td className="progress-cell">
                <div className="progress-bar-container">
                  <div className="progress-bar">
                    {parseFloat(activePercent) > 0 && (
                      <div className="progress-segment active" style={{ width: `${activePercent}%` }} />
                    )}
                    {parseFloat((100 - parseFloat(activePercent)).toFixed(1)) > 0 && (
                      <div className="progress-segment non-active" style={{ width: `${(100 - parseFloat(activePercent)).toFixed(1)}%` }} />
                    )}
                  </div>
                </div>
              </td>
              <td className="action-cell"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExitStatisticsTable;
