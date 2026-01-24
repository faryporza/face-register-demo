'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function useHydratedUser() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/me', {
          credentials: 'include'
        });

        if (!response.ok) {
          router.push('/login');
          return;
        }

        const data = await response.json();
        if (data.success && data.user) {
          setUser(data.user);
        } else {
          router.push('/login');
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  // Return null while loading to prevent flash
  if (loading) return null;

  return user;
}

