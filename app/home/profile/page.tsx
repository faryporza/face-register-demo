'use client';
import { useState } from 'react';
import { Calendar, Mail, Phone } from 'lucide-react';
import HomeShell from '../_components/HomeShell';
import useHydratedUser from '../_components/useHydratedUser';

export default function ProfilePage() {
  const user = useHydratedUser();

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    window.location.href = '/login';
  };

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-500">กำลังโหลด...</div>;

  const userName = `${user.prefix || ''}${user.name || ''} ${user.surname || ''}`.trim();
  const regDate = user.timestamp ? new Date(user.timestamp).toLocaleString('th-TH') : '-';
  const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.email || userName || 'user')}`;

  return (
    <HomeShell user={user} active="profile" onLogout={handleLogout}>
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden bg-indigo-100">
            <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{userName}</h2>
            <p className="text-slate-500">ข้อมูลส่วนตัวของคุณ</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
            <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-500">
              <Phone size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-400">เบอร์โทรศัพท์</p>
              <p className="text-sm font-medium text-slate-700">{user.phone || '-'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
            <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-500">
              <Mail size={18} />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs text-slate-400">อีเมล</p>
              <p className="text-sm font-medium text-slate-700 truncate">{user.email || '-'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
            <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-500">
              <Calendar size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-400">วันที่ลงทะเบียน</p>
              <p className="text-sm font-medium text-slate-700">{regDate}</p>
            </div>
          </div>
        </div>
      </div>
    </HomeShell>
  );
}
