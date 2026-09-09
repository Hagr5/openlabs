'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setToken, decodeToken, redirectForRole } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If already authenticated, redirect immediately
  useEffect(() => {
    const token = localStorage.getItem('SwiTF01-hit3_token');
    if (token) {
      const payload = decodeToken(token);
      if (payload && payload.exp * 1000 > Date.now()) {
        router.replace(redirectForRole(payload.role));
      }
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Generate PKCE code verifier and challenge
      const codeVerifier = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const codeChallenge = btoa(codeVerifier);

      // Step 1: Login to get authorization code
      const loginRes = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, codeChallenge }),
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        setError(loginData.message || 'Invalid credentials');
        return;
      }

      // Step 2: Exchange authorization code for JWT
      // Notice: we send the email returned by the login step
      const jwtRes = await fetch('/api/v1/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorizationCode: loginData.authorizationCode,
          grantType: 'authorization_code',
          codeVerifier,
          email: loginData.email,
        }),
      });

      const jwtData = await jwtRes.json();
      if (!jwtRes.ok) {
        setError(jwtData.message || 'Failed to exchange token');
        return;
      }

      setToken(jwtData.access_token);
      const payload = decodeToken(jwtData.access_token);
      if (payload) {
        router.push(redirectForRole(payload.role));
      }
    } catch {
      setError('Connection error — is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrapper login-page">
      <div className="bg-grid" />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      <div className="glass-card login-card fade-in" style={{ padding: '40px' }}>
        <div className="login-header">
          <div className="login-logo">SwiTF01-hit3</div>
          <div className="login-subtitle">Project Management Platform</div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Username</label>
            <input
              className="input"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              className="input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ marginTop: 8, justifyContent: 'center' }}
          >
            {loading ? <span className="spinner" /> : null}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-muted)' }}>
          Secure enterprise access — authorised personnel only
        </p>
      </div>
    </div>
  );
}
