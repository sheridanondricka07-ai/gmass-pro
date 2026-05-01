'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function Dashboard() {
  const [data, setData] = useState({ accounts: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [timeFilter, setTimeFilter] = useState('all'); // all, 5, 15, 60

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
    setIsSyncing(true);
    
    for (const account of data.accounts) {
      try {
        await fetch(`/api/emails/sync?accountId=${account.id}`);
      } catch (err) {
        console.error("Background sync failed for account", account.id, err);
      }
    }
    await fetchEmails(); 
    setIsSyncing(false);
  };


  useEffect(() => {
    fetchEmails();
    const dataInterval = setInterval(fetchEmails, 5000); // UI Refresh every 5s
    
    // Trigger granular Gmail fetch every 30 seconds while page is open (to avoid Vercel firewall)
    const fetchInterval = setInterval(triggerBackgroundFetch, 30000); 
    
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

  const getSenderColor = (sender) => {
    if (!sender) return '#ffffff';
    let hash = 0;
    for (let i = 0; i < sender.length; i++) {
      hash = sender.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 40%, 85%)`; 
  };

  const getBadgeClass = (folder) => {
    if (folder === 'Primary' || folder === 'Primary Inbox') return styles.badgePrimary;
    if (folder === 'Promotions') return styles.badgePromotions;
    if (folder === 'Social') return styles.badgeSocial;
    if (folder === 'Forums') return styles.badgeForums;
    if (folder === 'Updates') return styles.badgeUpdates;
    if (folder === 'Spam') return styles.badgeSpam;
    return styles.badgeUpdates;
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const copyEmails = () => {
    if (!data.accounts || data.accounts.length === 0) {
      alert('No emails to copy.');
      return;
    }
    const emails = data.accounts.map(acc => acc.email).join('\n');
    navigator.clipboard.writeText(emails).then(() => {
      alert('All connected emails copied to clipboard!');
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
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
          <select 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="all">Show All Time</option>
            <option value="5">Last 5 Minutes</option>
            <option value="15">Last 15 Minutes</option>
            <option value="60">Last 1 Hour</option>
          </select>
          <span style={{ fontSize: '0.8rem', color: '#888', whiteSpace: 'nowrap' }}>
            Last sync: {lastUpdated.toLocaleTimeString()} {isSyncing && '(Syncing...)'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={copyEmails}
            style={{
              padding: '1rem 2rem', 
              background: '#fff', 
              color: 'var(--primary-color)', 
              border: '1px solid var(--primary-color)',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Copy All Emails
          </button>
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
          <button 
            onClick={handleLogout}
            style={{
              padding: '1rem 2rem', 
              background: '#f1f3f4', 
              color: '#3c4043', 
              border: '1px solid #dadce0',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {loading && data.accounts.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>Loading Dashboard...</div>
      ) : (
        <div className={styles.dashboard}>
        {data.accounts.map(account => {
          let accountEmails = account.emails || [];
          if (timeFilter !== 'all') {
             const mins = parseInt(timeFilter);
             const cutoff = new Date(Date.now() - mins * 60 * 1000);
             accountEmails = accountEmails.filter(e => new Date(e.date) >= cutoff);
          }
          return (
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
                {accountEmails && accountEmails.length > 0 ? (
                  accountEmails.map(email => {
                    const senderName = email.sender.split('<')[0].trim();
                    const senderEmailPart = email.sender.includes('<') ? email.sender.split('<')[1].replace('>', '') : email.sender;
                    return (
                      <div key={email.id} className={styles.emailItem} style={{ backgroundColor: getSenderColor(senderEmailPart) }}>
                        <div className={styles.senderHeader}>
                          <span className={styles.senderName}>{senderName}</span>
                        </div>
                        <div className={styles.subject}>{email.subject}</div>
                        <div className={styles.meta}>
                          <span className={`${styles.badge} ${getBadgeClass(email.folder)}`}>
                            {email.folder}
                          </span>
                          <span className={styles.time}>{timeAgo(email.date)}</span>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className={styles.emptyState}>No emails found.</div>
                )}
              </div>
            </div>
          )})}
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
