import React from 'react';
import './StatisticsTable.css';

// Provider logos mapping
const PROVIDER_LOGOS: { [key: string]: string } = {
  'Lido': 'https://s2.coinmarketcap.com/static/img/coins/64x64/8085.png',
  'Etherfi': 'https://s2.coinmarketcap.com/static/img/coins/64x64/29814.png',
  'Mantle': 'https://s2.coinmarketcap.com/static/img/coins/64x64/27075.png',
};

interface Statistics {
  byProvider: {
    [key: string]: {
      active: number;
      exit_queue: number;
      inactive: number;
      total: number;
    };
  };
  byBucket?: {
    [provider: string]: {
      [bucketNo: string]: {
        active: number;
        exit_queue: number;
        inactive: number;
        total: number;
      };
    };
  };
  totals: {
    total: number;
    active: number;
    exit_queue: number;
    inactive: number;
  };
}

interface StatisticsTableProps {
  statistics: Statistics;
  onBucketClick?: (provider: string, bucketNo: string) => void;
}

const StatisticsTable: React.FC<StatisticsTableProps> = ({ statistics, onBucketClick }) => {
  const providers = ['Lido', 'Etherfi', 'Mantle'];
  const [expandedProvider, setExpandedProvider] = React.useState<string | null>(null);

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const calculatePercentage = (value: number, total: number): string => {
    if (total === 0) return '0.0';
    return ((value / total) * 100).toFixed(1);
  };

  const handleProviderClick = (provider: string) => {
    if (expandedProvider === provider) {
      setExpandedProvider(null);
    } else {
      setExpandedProvider(provider);
    }
  };

  const getBucketStats = (provider: string) => {
    if (!statistics.byBucket || !statistics.byBucket[provider]) {
      return [];
    }
    return Object.entries(statistics.byBucket[provider])
      .map(([bucketNo, stats]) => ({ bucketNo, ...stats }))
      .sort((a, b) => {
        // Sort by bucket number (handle numeric and string bucket numbers)
        const aNum = parseInt(a.bucketNo) || 0;
        const bNum = parseInt(b.bucketNo) || 0;
        return aNum - bNum;
      });
  };

  return (
    <div className="statistics-container">
      <div className="table-wrapper">
        <div className="table-header">
          <h2 className="section-title">Validator Statistics</h2>
        </div>
        <table className="statistics-table">
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
            {providers.map((provider) => {
              const stats = statistics.byProvider[provider] || {
                total: 0,
                active: 0,
                exit_queue: 0,
                inactive: 0
              };
              
              const activePercent = calculatePercentage(stats.active, stats.total);
              const exitQueuePercent = calculatePercentage(stats.exit_queue, stats.total);
              const inactivePercent = calculatePercentage(stats.inactive, stats.total);
              const nonActivePercent = parseFloat(exitQueuePercent) + parseFloat(inactivePercent);
              
              const providerLogo = PROVIDER_LOGOS[provider] || null;
              
              const bucketStats = getBucketStats(provider);
              const isExpanded = expandedProvider === provider;
              
              return (
                <React.Fragment key={provider}>
                  <tr 
                    className={isExpanded ? 'provider-row expanded' : 'provider-row'}
                    onClick={() => handleProviderClick(provider)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="provider-cell">
                      <div className="provider-badge">
                        {providerLogo && (
                          <img 
                            src={providerLogo} 
                            alt={provider}
                            className="provider-logo"
                          />
                        )}
                        <span className="provider-name">{provider}</span>
                        {bucketStats.length > 0 && (
                          <span className="expand-icon" style={{ marginLeft: '8px' }}>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        )}
                      </div>
                    </td>
                  <td className="number-cell">{formatNumber(stats.total)}</td>
                  <td className="number-cell active">
                    {formatNumber(stats.active)} <span className="percentage">({activePercent}%)</span>
                  </td>
                  <td className="number-cell exit-queue">
                    {formatNumber(stats.exit_queue)} <span className="percentage">({exitQueuePercent}%)</span>
                  </td>
                  <td className="number-cell inactive">
                    {formatNumber(stats.inactive)} <span className="percentage">({inactivePercent}%)</span>
                  </td>
                  <td className="progress-cell">
                    <div className="progress-bar-container">
                      <div className="progress-bar">
                        {parseFloat(activePercent) > 0 && (
                          <div
                            className="progress-segment active"
                            style={{ width: `${activePercent}%` }}
                          />
                        )}
                        {nonActivePercent > 0 && (
                          <div
                            className="progress-segment non-active"
                            style={{ width: `${nonActivePercent}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                {isExpanded && bucketStats.length > 0 && (
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
                                  className="bucket-no-cell"
                                  onClick={() => onBucketClick && onBucketClick(provider, bucket.bucketNo)}
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
                                        <div
                                          className="progress-segment active"
                                          style={{ width: `${bucketActivePercent}%` }}
                                        />
                                      )}
                                      {bucketNonActivePercent > 0 && (
                                        <div
                                          className="progress-segment non-active"
                                          style={{ width: `${bucketNonActivePercent}%` }}
                                        />
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
            <tr className="totals-row">
              <td className="provider-cell">
                <div className="provider-badge">
                  <strong className="provider-name">Total</strong>
                </div>
              </td>
              <td className="number-cell">
                <strong>{formatNumber(statistics.totals.total)}</strong>
              </td>
              <td className="number-cell active">
                <strong>
                  {formatNumber(statistics.totals.active)} 
                  <span className="percentage"> ({calculatePercentage(statistics.totals.active, statistics.totals.total)}%)</span>
                </strong>
              </td>
              <td className="number-cell exit-queue">
                <strong>
                  {formatNumber(statistics.totals.exit_queue)} 
                  <span className="percentage"> ({calculatePercentage(statistics.totals.exit_queue, statistics.totals.total)}%)</span>
                </strong>
              </td>
              <td className="number-cell inactive">
                <strong>
                  {formatNumber(statistics.totals.inactive)} 
                  <span className="percentage"> ({calculatePercentage(statistics.totals.inactive, statistics.totals.total)}%)</span>
                </strong>
              </td>
              <td className="progress-cell">
                <div className="progress-bar-container">
                  <div className="progress-bar">
                    {parseFloat(calculatePercentage(statistics.totals.active, statistics.totals.total)) > 0 && (
                      <div
                        className="progress-segment active"
                        style={{ 
                          width: `${calculatePercentage(statistics.totals.active, statistics.totals.total)}%`
                        }}
                      />
                    )}
                    {parseFloat(calculatePercentage(statistics.totals.exit_queue, statistics.totals.total)) + parseFloat(calculatePercentage(statistics.totals.inactive, statistics.totals.total)) > 0 && (
                      <div
                        className="progress-segment non-active"
                        style={{ 
                          width: `${parseFloat(calculatePercentage(statistics.totals.exit_queue, statistics.totals.total)) + parseFloat(calculatePercentage(statistics.totals.inactive, statistics.totals.total))}%`
                        }}
                      />
                    )}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StatisticsTable;

