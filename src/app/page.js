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
    if (data.accounts.length === 0) return;
    
    // Cycle through accounts and sync them one by one for a real-time feel
    for (const account of data.accounts) {
      try {
        await fetch(`/api/emails/sync?accountId=${account.id}`);
      } catch (err) {
        console.error(`Sync failed for ${account.email}`, err);
      }
    }
    fetchEmails(); // Final refresh
  };

  useEffect(() => {
    fetchEmails();
    const dataInterval = setInterval(fetchEmails, 5000); // UI Refresh every 5s
    
    // Trigger granular Gmail fetch every 15 seconds while page is open
    const fetchInterval = setInterval(triggerBackgroundFetch, 15000); 
    
    return () => {
      clearInterval(dataInterval);
      clearInterval(fetchInterval);
    };
  }, [search, data.accounts.length]);

  // Utility to format "time ago"
  const timeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (isNaN(seconds)) return 'Just now';
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  const maskEmail = (email) => {
    if (!email) return '';
    const [user, domain] = email.split('@');
    if (!domain) return user;
    const [domainName, tld] = domain.split('.');
    const maskedDomain = 'x'.repeat(domainName.length);
    return `${user}@${maskedDomain}.${tld || 'com'}`;
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
            <div key={account.id} className={styles.accountRow}>
              <div className={styles.accountInfo}>
                <div className={styles.gmailLogo}>
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="#EA4335"/>
                  </svg>
                </div>
                <div className={styles.accountEmail}>{account.email}</div>
                <div className={styles.accountStatus}>Google Workspace</div>
              </div>
              
              <div className={styles.emailList}>
                {account.emails && account.emails.length > 0 ? (
                  account.emails.map(email => (
                    <div key={email.id} className={styles.emailItem}>
                      <div className={styles.senderName}>{email.sender.split('<')[0].trim()}</div>
                      <div className={styles.senderEmail}>
                        {maskEmail(email.sender.includes('<') ? email.sender.split('<')[1].replace('>', '') : email.sender)}
                      </div>
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
            <div style={{textAlign: 'center', padding: '3rem', background: 'white', borderRadius: '8px'}}>
              No seed accounts connected. Please click "Manage Seeds" to connect accounts.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
