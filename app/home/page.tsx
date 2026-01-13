'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (!storedUser) {
      router.push('/checkin');
    } else {
      setUser(JSON.parse(storedUser));
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    router.push('/checkin');
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">ยินดีต้อนรับ</h1>
        
        <div className="flex flex-col gap-4 text-gray-700">
          <div className="border-b pb-2">
            <span className="text-sm text-gray-400 block">ชื่อ-นามสกุล</span>
            <p className="text-lg font-medium">{user.prefix}{user.name} {user.surname}</p>
          </div>
          
          <div className="border-b pb-2">
            <span className="text-sm text-gray-400 block">เบอร์โทรศัพท์</span>
            <p className="text-lg font-medium font-mono">{user.phone || '-'}</p>
          </div>
          
          <div className="border-b pb-2">
            <span className="text-sm text-gray-400 block">อีเมล</span>
            <p className="text-lg font-medium">{user.email || '-'}</p>
          </div>

          <div className="border-b pb-2">
            <span className="text-sm text-gray-400 block">วันที่ลงทะเบียน</span>
            <p className="text-lg font-medium">
              {new Date(user.timestamp).toLocaleString('th-TH')}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="mt-8 w-full bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition-colors"
        >
          ออกจากระบบ
        </button>
      </div>
      
      <a href="/" className="mt-6 text-gray-500 text-sm hover:underline">
        กลับหน้าลงทะเบียน
      </a>
    </div>
  );
}
