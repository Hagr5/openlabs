'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUsername, getRole, clearToken, authHeader } from '../../../lib/auth';
import { useAuth } from '../../../hooks/useAuth';

interface Admin {
  _id: string;
  name: string;
  email: string;
  role: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { loading: authLoading } = useAuth();
  const username = getUsername();
  const role = getRole();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Guard
  useEffect(() => {
    if (role && role !== 'admin') {
      router.replace(role === 'superadmin' ? '/superadmin' : '/dashboard');
    }
  }, [role, router]);

  // GraphQL query — ONLY uses the 'name' argument.
  // The 'rawFilter' argument is intentionally omitted and never referenced
  // anywhere in the frontend codebase. It is discoverable only via introspection.
  const fetchAdmins = useCallback(async (nameFilter?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(),
        },
        body: JSON.stringify({
          query: `
            query SearchAdmins($name: String) {
              searchAdmins(name: $name) {
                _id
                name
                email
                role
              }
            }
          `,
          variables: { name: nameFilter || undefined },
        }),
      });

      if (res.status === 401) { clearToken(); router.replace('/login'); return; }

      const { data, errors } = await res.json();
      if (errors?.length) { setError(errors[0].message); return; }
      setAdmins(data?.searchAdmins ?? []);
    } catch {
      setError('Failed to load admins');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchAdmins(search.trim() || undefined);
  }

  function logout() {
    clearToken();
    router.replace('/login');
  }

  // Mask superadmin email in the UI — resolver always returns the real value.
  // The masking is frontend-only (part of the challenge design).
  function displayEmail(admin: Admin): string {
    if (admin.role === 'superadmin') return '****';
    return admin.email;
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
            <span className="badge badge-admin">Admin</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="container fade-in" style={{ padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, marginBottom: 4 }}>Admin Panel</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Manage platform administrators</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-sm)', padding: '8px 14px' }}>
            <span style={{ fontSize: 12, color: 'var(--warning)' }}>⚠️</span>
            <span style={{ fontSize: 13, color: 'var(--warning)' }}>Admin slots full — limit reached (5/5)</span>
          </div>
        </div>

        {/* Search */}
        <div className="glass-card" style={{ padding: 20, marginBottom: 20 }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10 }}>
            <input
              id="admin-search"
              className="input"
              placeholder="Search admins by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-primary" type="submit" style={{ flexShrink: 0 }}>
              Search
            </button>
            {search && (
              <button
                className="btn btn-ghost"
                type="button"
                style={{ flexShrink: 0 }}
                onClick={() => { setSearch(''); fetchAdmins(); }}
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Admin table */}
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <span className="spinner" />
          </div>
        ) : admins.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div>No admins found</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin._id as string}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {admin.name}
                    </td>
                    <td>
                      {/* Superadmin email masked in UI — resolver always returns real value */}
                      {displayEmail(admin)}
                    </td>
                    <td>
                      <span className={`badge ${admin.role === 'superadmin' ? 'badge-super' : 'badge-admin'}`}>
                        {admin.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
