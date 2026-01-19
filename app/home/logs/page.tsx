'use client';
import { useEffect, useMemo, useState } from 'react';
import HomeShell from '../_components/HomeShell';
import useHydratedUser from '../_components/useHydratedUser';

type LogItem = {
  timestamp: string;
  status: 'CHECK_IN' | 'CHECK_OUT' | string;
  name?: string;
  surname?: string;
};

export default function LogsPage() {
  const user = useHydratedUser();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsError, setLogsError] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadLogs = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/logs?page=${page}&limit=${limit}`);
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
      } catch (error) {
        setLogsError('ไม่สามารถโหลดข้อมูลบันทึกได้');
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, [page, limit]);

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

  return (
    <HomeShell user={user} active="logs" onLogout={handleLogout}>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-lg text-slate-800">ประวัติการลงเวลา</h3>
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
                  <th className="px-6 py-4">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4">สถานะ</th>
                  <th className="px-6 py-4">วันที่</th>
                  <th className="px-6 py-4">เวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-sm text-slate-400">
                      ยังไม่มีข้อมูล
                    </td>
                  </tr>
                ) : (
                  sortedLogs.map((log, index) => (
                    <tr key={`${log.timestamp}-${index}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-700">{log.name} {log.surname}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            log.status === 'CHECK_IN'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
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
