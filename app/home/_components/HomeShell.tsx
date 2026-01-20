'use client';
import { ReactNode, useState } from 'react';
import Link from 'next/link';
import {
  User,
  LogOut,
  Calendar,
  LayoutDashboard,
  Menu,
  X,
  CheckCircle,
  Users
} from 'lucide-react';

type HomeShellUser = {
  type?: string;
};

type HomeShellProps = {
  user: HomeShellUser;
  active: 'dashboard' | 'profile' | 'logs' | 'users' | 'checkins';
  onLogout: () => void;
  children: ReactNode;
};

const navItemClass = (active: boolean) =>
  `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
    active
      ? 'bg-indigo-50 text-indigo-700'
      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
  }`;

export default function HomeShell({ user, active, onLogout, children }: HomeShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isAdmin = typeof user?.type === 'string' && user.type.toLowerCase() === 'admin';

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex overflow-hidden">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-64 bg-white shadow-xl lg:shadow-none border-r border-slate-200
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      >
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center justify-between gap-3 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <CheckCircle className="text-white w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                TimeCheck<span className="text-indigo-600">.io</span>
              </h1>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100">
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 space-y-2">
            <Link href="/home" className={navItemClass(active === 'dashboard')}>
              <LayoutDashboard size={20} />
              <span>ภาพรวม (Dashboard)</span>
            </Link>
            <Link href="/home/profile" className={navItemClass(active === 'profile')}>
              <User size={20} />
              <span>ข้อมูลส่วนตัว</span>
            </Link>
            {isAdmin && (
              <Link href="/home/checkins" className={navItemClass(active === 'checkins')}>
                <Calendar size={20} />
                <span>ประวัติการลงเวลา</span>
              </Link>
            )}
            {isAdmin && (
              <Link href="/home/logs" className={navItemClass(active === 'logs')}>
                <Calendar size={20} />
                <span>บันทึกระบบ</span>
              </Link>
            )}
            {isAdmin && (
              <Link href="/home/users" className={navItemClass(active === 'users')}>
                <Users size={20} />
                <span>จัดการผู้ใช้</span>
              </Link>
            )}
          </nav>

          <button
            onClick={onLogout}
            className="flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl font-medium transition-colors mt-auto"
          >
            <LogOut size={20} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="lg:hidden bg-white p-4 flex items-center justify-between border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-lg">TimeCheck</span>
          </div>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg">
            <Menu size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
