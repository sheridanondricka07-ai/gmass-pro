'use client';

import { useState, useEffect } from 'react';
import styles from './admin.module.css';

export default function AdminDashboard() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/emails');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const json = await res.json();
      if (json.accounts) setAccounts(json.accounts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleConnect = () => {
    window.location.href = '/api/gmail/connect';
  };

  const triggerCron = async () => {
    await fetch('/api/cron/fetchEmails');
    alert('Cron job triggered. Emails fetched.');
    fetchAccounts();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const copyEmails = () => {
    if (!accounts || accounts.length === 0) {
      alert('No emails to copy.');
      return;
    }
    const emails = accounts.map(acc => acc.email).join('\n');
    navigator.clipboard.writeText(emails).then(() => {
      alert('All connected emails copied to clipboard!');
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
  };

  if (loading) return <div className={styles.loading}>Loading...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
        <div className={styles.actions}>
          <button onClick={copyEmails} className={`${styles.btn} ${styles.btnOutline}`}>
            Copy All Emails
          </button>
          <button onClick={triggerCron} className={`${styles.btn} ${styles.btnSuccess}`}>
            Force Fetch Emails
          </button>
          <button onClick={handleConnect} className={`${styles.btn} ${styles.btnPrimary}`}>
            + Connect Gmail
          </button>
          <button onClick={handleLogout} className={`${styles.btn} ${styles.btnGhost}`}>
            Logout
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Connected Seed Accounts ({accounts.length})</h2>
        {accounts.length === 0 ? (
          <p className={styles.emptyText}>No seed accounts connected yet.</p>
        ) : (
          <ul className={styles.accountList}>
            {accounts.map(acc => (
              <li key={acc.id} className={styles.accountRow}>
                <span className={styles.accountEmail}>{acc.email}</span>
                <span className={styles.statusActive}>
                  <span className={styles.statusDot} />
                  Active
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.footerLink}>
        <a href="/">Go back to Public Dashboard</a>
      </div>
    </div>
  );
}
