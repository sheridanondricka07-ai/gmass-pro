'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './page.module.css';

export default function Dashboard() {
  const [data, setData] = useState({ accounts: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [newEmailIds, setNewEmailIds] = useState(new Set());

  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [timeFilter, setTimeFilter] = useState('all'); // all, 5, 15, 60

  const seenIds = useRef(null);
  const prevSearch = useRef(search);

  const fetchEmails = async () => {
    try {
      const url = new URL('/api/emails', window.location.origin);
      if (search) url.searchParams.append('q', search);

      const res = await fetch(url);
      const json = await res.json();
      if (json.accounts) {
        const allIds = new Set();
        json.accounts.forEach(acc => (acc.emails || []).forEach(e => allIds.add(e.id)));

        // Skip the flash on first load and whenever the search changes -
        // only actual new arrivals between polls should animate.
        const searchChanged = prevSearch.current !== search;
        prevSearch.current = search;

        if (seenIds.current && !searchChanged) {
          const arrived = [...allIds].filter(id => !seenIds.current.has(id));
          if (arrived.length > 0) {
            setNewEmailIds(prev => new Set([...prev, ...arrived]));
            setTimeout(() => {
              setNewEmailIds(prev => {
                const next = new Set(prev);
                arrived.forEach(id => next.delete(id));
                return next;
              });
            }, 2000);
          }
        }
        seenIds.current = allIds;

        setData(json);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch emails", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
    // New mail is pushed into the DB in real time via the Gmail webhook, so
    // this just needs to poll our own cache for the UI to feel live.
    const dataInterval = setInterval(fetchEmails, 3000);

    return () => clearInterval(dataInterval);
  }, [search]);

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

  const getSenderColor = (sender) => {
    if (!sender) return 'var(--primary-color)';
    let hash = 0;
    for (let i = 0; i < sender.length; i++) {
      hash = sender.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 52%)`;
  };

  // Subtle background wash so spam/inbox mail is scannable at a glance,
  // on top of the per-sender accent border.
  const getCardTint = (email) => {
    if (email.folder === 'Spam') return 'var(--tint-danger)';
    if (email.folder === 'Primary' || email.inInbox) return 'var(--tint-success)';
    return undefined;
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

  // Gmail's category tabs (Updates/Promotions/Social/Forums) all live inside
  // the Inbox, so show an "Inbox" badge alongside the category badge when the
  // message actually carries the INBOX label - matching Gmail's own UI.
  const getBadges = (email) => {
    if (email.folder === 'Spam') {
      return [{ label: 'Spam', className: styles.badgeSpam }];
    }
    if (email.folder === 'Primary') {
      return [{ label: 'Primary Inbox', className: styles.badgePrimary }];
    }
    const categoryBadge = { label: email.folder, className: getBadgeClass(email.folder) };
    if (email.inInbox) {
      return [{ label: 'Inbox', className: styles.badgeInbox }, categoryBadge];
    }
    return [categoryBadge];
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
        <div style={{ flex: 1, display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
            className={styles.timeSelect}
          >
            <option value="all">Show All Time</option>
            <option value="5">Last 5 Minutes</option>
            <option value="15">Last 15 Minutes</option>
            <option value="60">Last 1 Hour</option>
          </select>
          <span className={styles.syncStatus}>
            <span className={styles.syncDot} />
            Last sync: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>
        <div className={styles.headerActions}>
          <button onClick={copyEmails} className={`${styles.btn} ${styles.btnOutline}`}>
            Copy All Emails
          </button>
          <a href="/admin" className={`${styles.btn} ${styles.btnPrimary}`}>
            Manage Seeds
          </a>
          <button onClick={handleLogout} className={`${styles.btn} ${styles.btnGhost}`}>
            Logout
          </button>
        </div>
      </div>

      {loading && data.accounts.length === 0 ? (
        <div className={styles.loadingState}>Loading Dashboard...</div>
      ) : (
        <div className={styles.grid}>
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
                      <div
                        key={email.id}
                        className={`${styles.emailItem} ${newEmailIds.has(email.id) ? styles.emailNew : ''}`}
                        style={{
                          '--sender-color': getSenderColor(senderEmailPart),
                          '--card-tint': getCardTint(email)
                        }}
                      >
                        <div className={styles.senderName}>{senderName}</div>
                        <div className={styles.subject}>{email.subject}</div>
                        <div className={styles.meta}>
                          <span className={styles.badgeGroup}>
                            {getBadges(email).map(b => (
                              <span key={b.label} className={`${styles.badge} ${b.className}`}>
                                {b.label}
                              </span>
                            ))}
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
            <div className={styles.emptyState}>
              No seed accounts connected. Please click "Manage Seeds" to connect accounts.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
