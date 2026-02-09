'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import HomeShell from '../_components/HomeShell';
import useHydratedUser from '../_components/useHydratedUser';

type UserItem = {
  _id: string;
  prefix?: string;
  name?: string;
  surname?: string;
  email?: string;
  phone?: string;
  type?: 'admin' | 'user' | string;
  timestamp?: string;
  hasFace?: boolean;
};

export default function UsersPage() {
  const router = useRouter();
  const currentUser = useHydratedUser();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [resetPasswordModal, setResetPasswordModal] = useState<{ userId: string; userName: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.type?.toLowerCase?.() !== 'admin') {
      router.push('/home');
      return;
    }
  }, [currentUser, router]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/admin/users?page=${page}&limit=${limit}`);
        const data = await response.json();
        if (Array.isArray(data)) {
          setUsers(data);
          setTotalPages(1);
        } else if (Array.isArray(data?.data)) {
          setUsers(data.data);
          setTotalPages(data?.meta?.totalPages || 1);
        } else {
          setError('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
        }
      } catch (err) {
        setError('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
      } finally {
        setLoading(false);
      }
    };

    if (currentUser?.type?.toLowerCase?.() === 'admin') {
      loadUsers();
    }
  }, [currentUser, page, limit]);

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    window.location.href = '/login';
  };

  const updateUserType = async (id: string, type: 'admin' | 'user') => {
    try {
      setUpdatingId(id);
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type })
      });

      const result = await response.json();
      if (!result.success) {
        setError(result.message || 'ไม่สามารถอัปเดตผู้ใช้ได้');
        return;
      }

      setUsers((prev) => prev.map((user) => (user._id === id ? { ...user, type } : user)));
    } catch (err) {
      setError('ไม่สามารถอัปเดตผู้ใช้ได้');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('ต้องการลบผู้ใช้นี้หรือไม่?')) return;

    try {
      setUpdatingId(id);
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });

      const result = await response.json();
      if (!result.success) {
        setError(result.message || 'ไม่สามารถลบผู้ใช้ได้');
        return;
      }

      setUsers((prev) => prev.filter((user) => user._id !== id));
    } catch (err) {
      setError('ไม่สามารถลบผู้ใช้ได้');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteFaceData = async (id: string) => {
    if (!confirm('ต้องการลบข้อมูลใบหน้าของผู้ใช้นี้หรือไม่? (ผู้ใช้จะต้องลงทะเบียนใบหน้าใหม่)')) return;

    try {
      setUpdatingId(id);
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'remove_face' })
      });

      const result = await response.json();
      if (!result.success) {
        setError(result.message || 'ไม่สามารถลบข้อมูลใบหน้าได้');
        return;
      }

      setUsers((prev) => prev.map((user) => (user._id === id ? { ...user, hasFace: false } : user)));
    } catch (err) {
      setError('ไม่สามารถลบข้อมูลใบหน้าได้');
    } finally {
      setUpdatingId(null);
    }
  };

  const resetPassword = async () => {
    if (!resetPasswordModal) return;
    if (!newPassword || newPassword.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    try {
      setUpdatingId(resetPasswordModal.userId);
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resetPasswordModal.userId, action: 'reset_password', newPassword })
      });

      const result = await response.json();
      if (!result.success) {
        setError(result.message || 'ไม่สามารถรีเซ็ตรหัสผ่านได้');
        return;
      }

      alert('รีเซ็ตรหัสผ่านสำเร็จ');
      setResetPasswordModal(null);
      setNewPassword('');
    } catch (err) {
      setError('ไม่สามารถรีเซ็ตรหัสผ่านได้');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!currentUser) return <div className="flex items-center justify-center min-h-screen text-gray-500">กำลังโหลด...</div>;

  return (
    <HomeShell user={currentUser} active="users" onLogout={handleLogout}>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-lg text-slate-800">จัดการผู้ใช้</h3>
          <span className="text-sm text-slate-500">ทั้งหมด {users.length} คน</span>
        </div>

        {error && <div className="p-4 text-sm text-red-500">{error}</div>}

        {loading ? (
          <div className="p-6 text-sm text-slate-500">กำลังโหลด...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4">อีเมล</th>
                  <th className="px-6 py-4">เบอร์โทรศัพท์</th>
                  <th className="px-6 py-4">สิทธิ์</th>
                  <th className="px-6 py-4">ข้อมูลใบหน้า</th>
                  <th className="px-6 py-4">รหัสผ่าน</th>
                  <th className="px-6 py-4">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-center text-sm text-slate-400">
                      ยังไม่มีข้อมูลผู้ใช้
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-700">{`${user.prefix || ''}${user.name || ''} ${user.surname || ''}`.trim()}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{user.email || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{user.phone || '-'}</td>
                      <td className="px-6 py-4">
                        <select
                          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          value={user.type || 'user'}
                          onChange={(e) => updateUserType(user._id, e.target.value as 'admin' | 'user')}
                          disabled={updatingId === user._id}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        {user.hasFace ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                              ✅ บันทึกแล้ว
                            </span>
                            <button
                              onClick={() => deleteFaceData(user._id)}
                              disabled={updatingId === user._id}
                              className="text-xs text-red-500 hover:underline disabled:text-gray-300"
                            >
                              ลบใบหน้า
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
                            ❌ ไม่มีข้อมูล
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setResetPasswordModal({ userId: user._id, userName: `${user.prefix || ''}${user.name || ''} ${user.surname || ''}`.trim() })}
                          disabled={updatingId === user._id}
                          className="text-sm text-blue-600 hover:text-blue-700 disabled:text-blue-300"
                        >
                          รีเซ็ตรหัสผ่าน
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => deleteUser(user._id)}
                          disabled={updatingId === user._id}
                          className="text-sm text-red-600 hover:text-red-700 disabled:text-red-300"
                        >
                          ลบผู้ใช้
                        </button>
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

      {/* Reset Password Modal */}
      {resetPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-800 mb-4">รีเซ็ตรหัสผ่าน</h3>
            <p className="text-sm text-slate-600 mb-4">ผู้ใช้: <span className="font-medium">{resetPasswordModal.userName}</span></p>
            <input
              type="password"
              placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setResetPasswordModal(null); setNewPassword(''); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                ยกเลิก
              </button>
              <button
                onClick={resetPassword}
                disabled={updatingId === resetPasswordModal.userId}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
              >
                {updatingId === resetPasswordModal.userId ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </HomeShell >
  );
}
