'use client';

import { useState, useEffect } from 'react';

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

  if (loading) return <div style={{padding: '2rem'}}>Loading...</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Admin Dashboard</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={triggerCron} style={{ padding: '0.8rem 1.5rem', background: '#34a853', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Force Fetch Emails
          </button>
          <button onClick={handleConnect} style={{ padding: '0.8rem 1.5rem', background: '#4285f4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            + Connect Gmail
          </button>
          <button onClick={handleLogout} style={{ padding: '0.8rem 1.5rem', background: '#f1f3f4', color: '#3c4043', border: '1px solid #dadce0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', padding: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Connected Seed Accounts ({accounts.length})</h2>
        {accounts.length === 0 ? (
          <p>No seed accounts connected yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {accounts.map(acc => (
              <li key={acc.id} style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 'bold' }}>{acc.email}</span>
                <span style={{ color: '#34a853' }}>Active</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <a href="/" style={{ color: '#4285f4', textDecoration: 'underline' }}>Go back to Public Dashboard</a>
      </div>
    </div>
  );
}
