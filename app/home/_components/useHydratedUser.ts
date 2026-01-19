'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function useHydratedUser() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (!storedUser) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);

    if (!parsedUser?.type && parsedUser?.email) {
      fetch('/api/faces')
        .then((res) => res.json())
        .then((faces) => {
          if (!Array.isArray(faces)) return;
          const matched = faces.find((face: any) => face.email === parsedUser.email);
          if (matched?.type) {
            const updatedUser = { ...parsedUser, type: matched.type };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            setUser(updatedUser);
          }
        })
        .catch(() => {
          // ignore hydration errors
        });
    }
  }, [router]);

  return user;
}
