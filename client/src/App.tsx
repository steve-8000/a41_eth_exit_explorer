import React, { useState, useEffect } from 'react';
import './App.css';
import StatisticsTable from './components/StatisticsTable';
import ValidatorList from './components/ValidatorList';
import ExitStatisticsTable from './components/ExitStatisticsTable';
import ExitList from './components/ExitList';
import ExitCSVUpload from './components/ExitCSVUpload';
import Footer from './components/Footer';

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
  lastUpdate?: string;
}

interface ExitQueueInfo {
  eth: number;
  wait: string;
  churn: string;
  sweep_delay?: string;
}

interface ExitStatistics {
  totals: {
    total: number;
    active: number;
    exit_queue: number;
    inactive: number;
  };
  byBatch: Array<{
    id: number;
    filename: string;
    uploaded_at: string;
    total: number;
    active: number;
    exit_queue: number;
    inactive: number;
  }>;
  byBatchDetail?: {
    [batchId: number]: {
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
    };
  };
  lastUpdate?: string;
}

function App() {
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [exitStatistics, setExitStatistics] = useState<ExitStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exitLoading, setExitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitQueue, setExitQueue] = useState<ExitQueueInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'validators' | 'exit'>('validators');
  const [filterProvider, setFilterProvider] = useState<string>('');
  const [filterBucketNo, setFilterBucketNo] = useState<string>('');
  const [filterBatchId, setFilterBatchId] = useState<number | undefined>(undefined);
  const [filterExitProvider, setFilterExitProvider] = useState<string>('');
  const [filterExitBucketNo, setFilterExitBucketNo] = useState<string>('');

  const handleBucketClick = (provider: string, bucketNo: string) => {
    setFilterProvider(provider);
    setFilterBucketNo(bucketNo);
    setActiveTab('validators');

    // Scroll to Pubkey List section
    setTimeout(() => {
      const el = document.getElementById('pubkey-list-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleExitBatchClick = (batchId: number) => {
    setFilterBatchId(batchId);
    setActiveTab('exit');

    // Scroll to Exit List section
    setTimeout(() => {
      const el = document.getElementById('exit-list-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleExitProviderClick = (batchId: number, provider: string) => {
    setFilterBatchId(batchId);
    setFilterExitProvider(provider);
    setActiveTab('exit');

    // Scroll to Exit List section
    setTimeout(() => {
      const el = document.getElementById('exit-list-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleExitBucketClick = (batchId: number, provider: string, bucketNo: string) => {
    setFilterBatchId(batchId);
    setFilterExitProvider(provider);
    setFilterExitBucketNo(bucketNo);
    setActiveTab('exit');

    // Scroll to Exit List section
    setTimeout(() => {
      const el = document.getElementById('exit-list-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const fetchStatistics = async () => {
    try {
      setLoading(true);
      const [statsRes, exitRes] = await Promise.all([
        fetch('/api/statistics'),
        fetch('/api/exit-queue')
      ]);

      if (!statsRes.ok) {
        throw new Error('Failed to fetch statistics');
      }
      const statsData = await statsRes.json();
      setStatistics(statsData);

      if (exitRes.ok) {
        const exitData = await exitRes.json();
        setExitQueue(exitData);
      } else {
        setExitQueue(null);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchExitStatistics = async () => {
    try {
      setExitLoading(true);
      const response = await fetch('/api/exit-statistics');
      if (!response.ok) {
        throw new Error('Failed to fetch exit statistics');
      }
      const data = await response.json();
      setExitStatistics(data);
    } catch (err) {
      // Error handled silently
    } finally {
      setExitLoading(false);
    }
  };

  useEffect(() => {
    // Load last synced statistics on initial mount
    fetchStatistics();
    fetchExitStatistics();
  }, []);

  useEffect(() => {
    // Fetch exit statistics when switching to exit tab
    if (activeTab === 'exit' && !exitStatistics) {
      fetchExitStatistics();
    }
  }, [activeTab]);

  const handleSyncStatuses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/sync-statuses', {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to sync statuses');
      }
      await fetchStatistics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync statuses');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncExitStatuses = async () => {
    try {
      setExitLoading(true);
      const response = await fetch('/api/sync-exit-statuses', {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to sync exit statuses');
      }
      // Wait a bit for sync to start, then fetch statistics
      setTimeout(() => {
        fetchExitStatistics();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync exit statuses');
    } finally {
      setExitLoading(false);
    }
  };

  const handleExitUpload = () => {
    fetchExitStatistics();
  };

  const handleExitBatchDelete = () => {
    fetchExitStatistics();
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-title">
          <a 
            href="/" 
            className="a41-logo-link"
          >
            <img 
              src="https://cdn.prod.website-files.com/663b58d3805ec350a436dc33/664675b7004579d5ccb8611f_a41%20(2).svg" 
              alt="A41" 
              className="a41-logo"
            />
          </a>
          <h1>Ethereum Exit Status</h1>
        </div>
        <div className="header-info">
          {exitQueue && (
            <div className="exit-queue-header">
              <span>ETH: {exitQueue.eth.toLocaleString()}</span>
              <span>Wait: {exitQueue.wait}</span>
              {exitQueue.sweep_delay && <span>Sweep: {exitQueue.sweep_delay}</span>}
            </div>
          )}
          {statistics?.lastUpdate && (
            <div className="last-update">
              Last Updated: {new Date(statistics.lastUpdate).toLocaleString('en-US', { 
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
              })}
            </div>
          )}
          <button onClick={handleSyncStatuses} className="sync-button" disabled={loading}>
            {loading ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </header>

      <main className="App-main">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="tabs">
          <button
            className={`tab-button ${activeTab === 'validators' ? 'active' : ''}`}
            onClick={() => setActiveTab('validators')}
          >
            Validators
          </button>
          <button
            className={`tab-button ${activeTab === 'exit' ? 'active' : ''}`}
            onClick={() => setActiveTab('exit')}
          >
            Exit List
          </button>
        </div>

        {activeTab === 'validators' && (
          <>
            {loading && !statistics ? (
              <div className="loading">Loading statistics...</div>
            ) : statistics ? (
              <>
                <StatisticsTable 
                  statistics={statistics} 
                  onBucketClick={handleBucketClick}
                />
                <ValidatorList 
                  initialProvider={filterProvider}
                  initialBucketNo={filterBucketNo}
                />
              </>
            ) : null}
          </>
        )}

        {activeTab === 'exit' && (
          <>
            <div className="exit-section-header">
              <ExitCSVUpload onUpload={handleExitUpload} />
              <button
                onClick={handleSyncExitStatuses}
                className="sync-button"
                disabled={exitLoading}
              >
                {exitLoading ? 'Syncing...' : 'Sync Exit Statuses'}
              </button>
            </div>
            {exitLoading && !exitStatistics ? (
              <div className="loading">Loading exit statistics...</div>
            ) : exitStatistics ? (
              <>
                <ExitStatisticsTable 
                  statistics={exitStatistics} 
                  onDelete={handleExitBatchDelete}
                  onProviderClick={handleExitProviderClick}
                  onBucketClick={handleExitBucketClick}
                />
                <ExitList 
                  initialBatchId={filterBatchId}
                  initialProvider={filterExitProvider}
                  initialBucketNo={filterExitBucketNo}
                />
              </>
            ) : null}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;

