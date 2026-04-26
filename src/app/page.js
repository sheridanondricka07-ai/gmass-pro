'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function Dashboard() {
  const [data, setData] = useState({ accounts: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchEmails = async () => {
    try {
      const url = new URL('/api/emails', window.location.origin);
      if (search) url.searchParams.append('q', search);
      
      const res = await fetch(url);
      const json = await res.json();
      if (json.accounts) {
        setData(json);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch emails", err);
    } finally {
      setLoading(false);
    }
  };

  const triggerBackgroundFetch = async () => {
    try {
      await fetch('/api/cron/fetchEmails');
      fetchEmails(); // Refresh data after fetch
    } catch (err) {
      console.error("Background fetch failed", err);
    }
  };

  useEffect(() => {
    fetchEmails();
    const dataInterval = setInterval(fetchEmails, 10000); // UI Refresh every 10s
    
    // Trigger actual Gmail fetch every 2 minutes while page is open
    const fetchInterval = setInterval(triggerBackgroundFetch, 120000); 
    
    return () => {
      clearInterval(dataInterval);
      clearInterval(fetchInterval);
    };
  }, [search]);

  // Utility to format "time ago"
  const timeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  const getBadgeClass = (folder) => {
    if (folder === 'Primary Inbox') return styles.badgeInbox;
    if (folder === 'Spam') return styles.badgeSpam;
    return styles.badgeUpdates;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ flex: 1, display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Search by address, domain, subject or ESP" 
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span style={{ fontSize: '0.8rem', color: '#888', whiteSpace: 'nowrap' }}>
            Last sync: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>
        <a href="/admin" style={{
          padding: '1rem 2rem', 
          background: 'var(--primary-color)', 
          color: 'white', 
          borderRadius: '8px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap'
        }}>
          Manage Seeds
        </a>
      </div>

      {loading && data.accounts.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>Loading Dashboard...</div>
      ) : (
        <div className={styles.grid}>
          {data.accounts.map(account => (
            <div key={account.id} className={styles.accountColumn}>
              <div className={styles.accountHeader}>
                <div className={styles.accountEmail}>{account.email}</div>
                <div className={styles.accountStatus}>Google Workspace Seed</div>
              </div>
              
              <div className={styles.emailList}>
                {account.emails && account.emails.length > 0 ? (
                  account.emails.map(email => (
                    <div key={email.id} className={styles.emailItem}>
                      <div className={styles.sender}>{email.sender}</div>
                      <div className={styles.subject}>{email.subject}</div>
                      <div className={styles.meta}>
                        <span className={`${styles.badge} ${getBadgeClass(email.folder)}`}>
                          {email.folder}
                        </span>
                        <span className={styles.time}>{timeAgo(email.date)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyState}>No emails found.</div>
                )}
              </div>
            </div>
          ))}
          {data.accounts.length === 0 && !loading && (
            <div style={{gridColumn: '1 / -1', textAlign: 'center'}}>
              No seed accounts connected. Please go to /admin to connect accounts.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
