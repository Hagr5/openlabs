'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearToken, authHeader } from '../lib/auth';

export function useAuth() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function verifyToken() {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        // Test API call to verify if the token is still valid
        const res = await fetch('/api/v1/projects', {
          headers: authHeader(),
        });
        
        if (res.status === 401) {
          clearToken();
          router.replace('/login');
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to verify token', err);
        setLoading(false);
      }
    }

    verifyToken();
  }, [router]);

  return { loading };
}
