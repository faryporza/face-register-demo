'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  LogOut,
  Calendar,
  Mail,
  Phone,
  LayoutDashboard,
  Activity,
  Menu,
  X,
  CheckCircle
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

type LogItem = {
  timestamp: string;
  status: 'CHECK_IN' | 'CHECK_OUT' | string;
  name?: string;
  surname?: string;
};

export default function AttendanceDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsError, setLogsError] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (!storedUser) {
      router.push('/login');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, [router]);

  useEffect(() => {
    const loadLogs = async () => {
      try {
        const response = await fetch('/api/logs');
        const data = await response.json();
        if (Array.isArray(data)) {
          setLogs(data);
        } else {
          setLogsError('ไม่สามารถโหลดข้อมูลบันทึกได้');
        }
      } catch (error) {
        setLogsError('ไม่สามารถโหลดข้อมูลบันทึกได้');
      }
    };

    loadLogs();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    router.push('/login');
  };

  const formatThaiDate = (dateString: string) => {
    const date = new Date(dateString);
    const buddhistYear = date.getFullYear() + 543;
    const day = date.getDate();
    const month = date.toLocaleDateString('th-TH', { month: 'short' });
    return `${day} ${month} ${buddhistYear}`;
  };

  const formatThaiDateLong = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const chartData = useMemo(() => {
    const groups = logs.reduce((acc: Record<string, { date: string; count: number; fullDate: string }>, log) => {
      const dateKey = new Date(log.timestamp).toISOString().slice(0, 10);
      if (!acc[dateKey]) {
        acc[dateKey] = { date: formatThaiDate(dateKey), count: 0, fullDate: dateKey };
      }
      acc[dateKey].count += 1;
      return acc;
    }, {});

    return Object.values(groups).sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime());
  }, [logs]);

  const recentLogs = useMemo(() => {
    return [...logs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, [logs]);

  const totalLogs = logs.length;
  const checkInLogs = logs.filter((log) => log.status === 'CHECK_IN').length;

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-500">กำลังโหลด...</div>;

  const userName = `${user.prefix || ''}${user.name || ''} ${user.surname || ''}`.trim();
  const regDate = user.timestamp ? new Date(user.timestamp).toLocaleString('th-TH') : '-';
  const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.email || userName || 'user')}`;

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
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">TimeCheck<span className="text-indigo-600">.io</span></h1>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100">
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 space-y-2">
            <a href="#" className="flex items-center gap-3 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-medium transition-colors">
              <LayoutDashboard size={20} />
              <span>ภาพรวม (Dashboard)</span>
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-xl font-medium transition-colors">
              <User size={20} />
              <span>ข้อมูลส่วนตัว</span>
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-xl font-medium transition-colors">
              <Calendar size={20} />
              <span>ประวัติการลงเวลา</span>
            </a>
          </nav>

          <button
            onClick={handleLogout}
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
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">ยินดีต้อนรับ, {user.name} 👋</h2>
                <p className="text-slate-500 mt-1">จัดการเวลาและการลงทะเบียนของคุณได้ที่นี่</p>
              </div>
              <div className="text-right hidden md:block">
                <p className="text-sm text-slate-400">วันที่ปัจจุบัน</p>
                <p className="text-lg font-medium text-slate-700">{formatThaiDateLong(new Date().toISOString())}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white rounded-2xl p-6 shadow-sm border border-slate-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>

                <div className="relative flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden mb-4 bg-indigo-100">
                    <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">{userName}</h3>
                  <div className="flex items-center gap-2 mt-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    Online
                  </div>

                  <div className="w-full mt-6 space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-500">
                        <Phone size={18} />
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-slate-400">เบอร์โทรศัพท์</p>
                        <p className="text-sm font-medium text-slate-700">{user.phone || '-'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-500">
                        <Mail size={18} />
                      </div>
                      <div className="text-left overflow-hidden">
                        <p className="text-xs text-slate-400">อีเมล</p>
                        <p className="text-sm font-medium text-slate-700 truncate">{user.email || '-'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <div className="p-2 bg-white rounded-lg shadow-sm text-indigo-500">
                        <Calendar size={18} />
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-slate-400">วันที่ลงทะเบียน</p>
                        <p className="text-sm font-medium text-slate-700">{regDate}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 text-indigo-600 mb-2">
                      <LayoutDashboard size={24} />
                      <span className="text-sm font-medium text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded-md">Total</span>
                    </div>
                    <div>
                      <h4 className="text-slate-400 text-sm font-medium">จำนวน Log ทั้งหมด</h4>
                      <p className="text-3xl font-bold text-slate-800 mt-1">{totalLogs}</p>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 text-emerald-600 mb-2">
                      <CheckCircle size={24} />
                      <span className="text-sm font-medium text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded-md">Today</span>
                    </div>
                    <div>
                      <h4 className="text-slate-400 text-sm font-medium">จำนวน Check-in</h4>
                      <p className="text-3xl font-bold text-slate-800 mt-1">{checkInLogs}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                      <Activity className="text-indigo-500" size={20} />
                      สถิติการลงเวลา (แยกตามวัน)
                    </h3>
                  </div>

                  {logsError ? (
                    <p className="text-sm text-red-500">{logsError}</p>
                  ) : (
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: '#64748b' }}
                            dy={10}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                          <Tooltip
                            contentStyle={{
                              borderRadius: '12px',
                              border: 'none',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="count"
                            stroke="#4f46e5"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorCount)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-slate-800">ล่าสุด 5 รายการ</h3>
                <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">ดูทั้งหมด</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-6 py-4">ชื่อ-นามสกุล</th>
                      <th className="px-6 py-4">สถานะ</th>
                      <th className="px-6 py-4">วันที่</th>
                      <th className="px-6 py-4">เวลา</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-6 text-center text-sm text-slate-400">
                          ยังไม่มีข้อมูล
                        </td>
                      </tr>
                    ) : (
                      recentLogs.map((log, index) => (
                        <tr key={`${log.timestamp}-${index}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                                {(log.name || user.name || 'U').charAt(0)}
                              </div>
                              <span className="font-medium text-slate-700">{log.name} {log.surname}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                            ${log.status === 'CHECK_IN'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-orange-100 text-orange-800'
                                }
                          `}
                            >
                              {log.status === 'CHECK_IN' ? 'เข้างาน' : 'ออกงาน'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{formatThaiDate(log.timestamp)}</td>
                          <td className="px-6 py-4 text-sm text-slate-600 font-mono">{formatTime(log.timestamp)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
