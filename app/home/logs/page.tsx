'use client';
import { useEffect, useMemo, useState } from 'react';
import HomeShell from '../_components/HomeShell';
import useHydratedUser from '../_components/useHydratedUser';

type LogItem = {
  timestamp: string;
  event?: string;
  status?: 'success' | 'fail' | string;
  email?: string;
  userId?: string;
  route?: string;
  method?: string;
  message?: string;
  errorCode?: string;
  meta?: Record<string, unknown>;
  result?: Record<string, unknown>;
  client?: {
    userAgent?: string;
    ip?: string;
  };
};

export default function LogsPage() {
  const user = useHydratedUser();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsError, setLogsError] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterErrorCode, setFilterErrorCode] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    const loadLogs = async () => {
      try {
        if (!user || user?.type?.toLowerCase?.() !== 'admin') return;
        setLoading(true);
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(limit));
        if (filterEvent) params.set('event', filterEvent);
        if (filterStatus) params.set('status', filterStatus);
        if (filterEmail) params.set('email', filterEmail);
        if (filterErrorCode) params.set('errorCode', filterErrorCode);
        if (filterFrom) params.set('from', filterFrom);
        if (filterTo) params.set('to', filterTo);

        const response = await fetch(`/api/logs?${params.toString()}`,
          {
            headers: {
              'x-user-email': user.email || ''
            }
          }
        );
        if (response.status === 403) {
          setLogsError('เฉพาะผู้ดูแลระบบเท่านั้น');
          return;
        }
        const data = await response.json();
        if (Array.isArray(data)) {
          setLogs(data);
          setTotalPages(1);
        } else if (Array.isArray(data?.data)) {
          setLogs(data.data);
          setTotalPages(data?.meta?.totalPages || 1);
        } else {
          setLogsError('ไม่สามารถโหลดข้อมูลบันทึกได้');
        }
      } catch {
        setLogsError('ไม่สามารถโหลดข้อมูลบันทึกได้');
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, [page, limit, user, filterEvent, filterStatus, filterEmail, filterErrorCode, filterFrom, filterTo]);

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    window.location.href = '/login';
  };

  const formatThaiDate = (dateString: string) => {
    const date = new Date(dateString);
    const buddhistYear = date.getFullYear() + 543;
    const day = date.getDate();
    const month = date.toLocaleDateString('th-TH', { month: 'short' });
    return `${day} ${month} ${buddhistYear}`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [logs]);

  if (!user) return <div className="flex items-center justify-center min-h-screen text-gray-500">กำลังโหลด...</div>;
  if (user?.type?.toLowerCase?.() !== 'admin') {
    return (
      <HomeShell user={user} active="logs" onLogout={handleLogout}>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center text-slate-500">
          เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถดูบันทึกระบบได้
        </div>
      </HomeShell>
    );
  }

  return (
    <HomeShell user={user} active="logs" onLogout={handleLogout}>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-800">บันทึกระบบ (Admin)</h3>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={filterEvent}
              onChange={(e) => {
                setPage(1);
                setFilterEvent(e.target.value);
              }}
              placeholder="event เช่น checkin-scan-fail"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={filterStatus}
              onChange={(e) => {
                setPage(1);
                setFilterStatus(e.target.value);
              }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">ทุกสถานะ</option>
              <option value="success">success</option>
              <option value="fail">fail</option>
            </select>
            <input
              value={filterEmail}
              onChange={(e) => {
                setPage(1);
                setFilterEmail(e.target.value);
              }}
              placeholder="email"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={filterErrorCode}
              onChange={(e) => {
                setPage(1);
                setFilterErrorCode(e.target.value);
              }}
              placeholder="errorCode"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => {
                setPage(1);
                setFilterFrom(e.target.value);
              }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={filterTo}
              onChange={(e) => {
                setPage(1);
                setFilterTo(e.target.value);
              }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {logsError ? (
          <div className="p-6 text-sm text-red-500">{logsError}</div>
        ) : loading ? (
          <div className="p-6 text-sm text-slate-500">กำลังโหลด...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">เหตุการณ์</th>
                  <th className="px-6 py-4">ผู้ใช้</th>
                  <th className="px-6 py-4">สถานะ</th>
                  <th className="px-6 py-4">เส้นทาง</th>
                  <th className="px-6 py-4">เวลา</th>
                  <th className="px-6 py-4">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-400">
                      ยังไม่มีข้อมูล
                    </td>
                  </tr>
                ) : (
                  sortedLogs.map((log, index) => (
                    <tr key={`${log.timestamp}-${index}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-700">{log.event || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-600">
                          {log.email || log.userId || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            log.status === 'success'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {log.status || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{log.method} {log.route}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                        {formatThaiDate(log.timestamp)} {formatTime(log.timestamp)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {log.message || log.errorCode || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
          <span className="text-sm text-slate-500">หน้า {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 disabled:text-slate-300 disabled:border-slate-100"
            >
              ก่อนหน้า
            </button>
            <button
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 disabled:text-slate-300 disabled:border-slate-100"
            >
              ถัดไป
            </button>
          </div>
        </div>
      </div>
    </HomeShell>
  );
}
