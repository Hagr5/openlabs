'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUsername, getRole, clearToken } from '../../../lib/auth';
import { useAuth } from '../../../hooks/useAuth';

// gRPC status code for RESOURCE_EXHAUSTED
const GRPC_RESOURCE_EXHAUSTED = 8;

interface AdminEntry {
  name: string;
  role: string;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addName, setAddName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [limitReached, setLimitReached] = useState(false);
  const { loading: authLoading } = useAuth();
  const username = getUsername();
  const role = getRole();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Guard
  useEffect(() => {
    if (role && role !== 'superadmin') {
      router.replace(role === 'admin' ? '/admin' : '/dashboard');
    }
  }, [role, router]);

  // Fetch admin list via gRPC API route → AdminService.ListAdmins
  // SuperAdminService is intentionally not referenced here or anywhere else in the frontend.
  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/grpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ method: 'listAdmins', data: {} }),
      });
      const data = await res.json();
      if (data.admins) {
        setAdmins(data.admins);
        // Show limit warning when already at capacity
        setLimitReached(data.admins.length >= 5);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  // Add admin — calls AdminService.AddAdmin which enforces the 5-admin limit.
  // Returns RESOURCE_EXHAUSTED (code 8) if limit is hit.
  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;

    setAddLoading(true);
    setAddError('');
    setAddSuccess('');

    try {
      const res = await fetch('/api/grpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          method: 'addAdmin',
          data: { name: addName.trim(), role: 'admin' },
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        if (data.code === GRPC_RESOURCE_EXHAUSTED) {
          setAddError('Limit reached — admin slots are full (max 5)');
          setLimitReached(true);
        } else {
          setAddError(data.error || 'Failed to add admin');
        }
        return;
      }

      setAddSuccess(`Admin "${addName.trim()}" added successfully`);
      setAddName('');
      fetchAdmins();
    } catch {
      setAddError('Request failed — check service connectivity');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDeleteAdmin(name: string) {
    if (!confirm(`Are you sure you want to delete admin "${name}"?`)) return;

    try {
      const res = await fetch('/api/grpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          method: 'removeAdmin',
          data: { name },
        }),
      });

      if (res.ok) {
        fetchAdmins();
      } else {
        alert('Failed to delete admin');
      }
    } catch {
      alert('Request failed');
    }
  }

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <div className="page-wrapper">
      <div className="bg-grid" />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      {/* Topbar */}
      <nav className="topbar">
        <div className="topbar-inner">
          <span className="logo">SwiTF01-hit3</span>
          <div className="nav-user">
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{mounted ? username : ''}</span>
            <span className="badge badge-super">Superadmin</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="container fade-in" style={{ padding: '32px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, marginBottom: 4 }}>
            Superadmin Panel
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Admin user management</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Add Admin form */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Add Admin</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Platform limit: 5 admins
            </p>

            {limitReached && !addError && (
              <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                ⚠️ Limit reached — all admin slots are currently full
              </div>
            )}

            {addError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{addError}</div>}
            {addSuccess && <div className="alert alert-success" style={{ marginBottom: 16 }}>{addSuccess}</div>}

            <form onSubmit={handleAddAdmin}>
              <div className="input-group" style={{ marginBottom: 12 }}>
                <label className="input-label" htmlFor="admin-name">Admin Name</label>
                <input
                  id="admin-name"
                  className="input"
                  placeholder="Enter admin username"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  required
                />
              </div>
              <button
                id="add-admin-btn"
                className="btn btn-primary"
                type="submit"
                disabled={addLoading}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {addLoading ? <><span className="spinner" /> Adding…</> : '+ Add Admin'}
              </button>
            </form>
          </div>

          {/* Admin list */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>
                Admin List ({admins.length}/5 slots used)
              </div>
              <button className="btn btn-ghost btn-sm" onClick={fetchAdmins}>↻ Refresh</button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <span className="spinner" />
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)', width: 40 }}>{i + 1}</td>
                        <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{admin.name}</td>
                        <td>
                          <span className="badge badge-admin">{admin.role}</span>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--text-error)' }}
                            onClick={() => handleDeleteAdmin(admin.name)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
