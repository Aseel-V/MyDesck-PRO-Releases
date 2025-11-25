import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, UserPlus, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import CreateUserForm from './CreateUserForm';

// This interface defines the structure for a user object that combines
// authentication data with profile information for the admin view.
interface UserWithProfile {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
  business_name: string;
  business_id?: string;
  role: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const PER_PAGE = 20;

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-users', {
        body: { page, perPage: PER_PAGE },
      });

      if (error) throw error;

      if (data?.users) {
        setUsers(data.users);
        // Simple heuristic for "has more": if we got a full page, assume there might be more
        setHasMore(data.users.length === PER_PAGE);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-sky-400/30 border-t-sky-400 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-sky-300/80 mb-1">
            Control Center
          </p>
          <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-50 via-sky-100 to-slate-200 drop-shadow-[0_0_16px_rgba(15,23,42,0.9)]">
            Admin Panel
          </h2>
          <p className="text-slate-400 mt-1 text-sm">
            Manage users and platform access without touching their private data.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 shadow-[0_10px_30px_rgba(16,185,129,0.4)]">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-400/60">
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-100">
              Admin Access
            </span>
          </div>
          <button
            onClick={() => setShowRegisterModal(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-400/80 bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(56,189,248,0.55)] hover:from-sky-400 hover:to-sky-300 transition-all"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600/90">
              <UserPlus className="w-4 h-4" />
            </div>
            <span>Create Account</span>
          </button>
        </div>
      </div>

      {/* User Stats */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/90 shadow-[0_18px_55px_rgba(15,23,42,0.95)] px-5 py-4 flex items-center gap-5">
        <div className="relative flex h-12 w-12 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-sky-500 via-fuchsia-500 to-sky-300 opacity-70 blur-[1px]" />
          <div className="relative h-10 w-10 rounded-full bg-slate-950 border border-slate-700/80 flex items-center justify-center">
            <Users className="w-5 h-5 text-sky-300" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 mb-1">
            Total Users
          </p>
          <p className="text-3xl font-bold text-slate-50 leading-tight">
            {users.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Includes all registered accounts linked to a business profile.
          </p>
        </div>
      </div>

      {/* User Table */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/95 shadow-[0_20px_60px_rgba(15,23,42,1)] overflow-hidden">
        <div className="px-4 py-3 md:px-6 md:py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h3 className="text-lg md:text-xl font-semibold text-slate-50">
              All Users
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Basic overview of accounts, roles, and businesses.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950/90">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Full Name
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Business Name
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Join Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-900/70 transition-colors"
                >
                  <td className="px-6 py-3 whitespace-nowrap text-slate-100 font-medium">
                    {user.email}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-slate-300">
                    {user.full_name}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-slate-300">
                    {user.business_name}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full border ${user.role === 'admin'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/50'
                        : 'bg-sky-500/10 text-sky-300 border-sky-500/40'
                        }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-slate-400 text-xs">
                    {user.created_at}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        <span className="text-sm text-slate-500">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition-all"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-panel border border-slate-800/80 bg-slate-950/95 rounded-2xl shadow-[0_28px_80px_rgba(15,23,42,1)] w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-scaleIn">
            <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-slate-800/80">
              <div>
                <h3 className="text-lg font-semibold text-slate-50">
                  Register New User
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Create a new account and assign it to a business.
                </p>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="rounded-xl border border-slate-700/80 px-3 py-1.5 text-xs md:text-sm text-slate-200 bg-slate-950/80 hover:bg-slate-900/80 transition-all"
              >
                Close
              </button>
            </div>
            <div className="p-4 md:p-6">
              <CreateUserForm
                onClose={() => setShowRegisterModal(false)}
                onSuccess={() => {
                  setShowRegisterModal(false);
                  fetchUsers();
                }}
                existingBusinesses={Array.from(
                  new Map(
                    users
                      .filter((u) => u.business_id && u.business_name)
                      .map((u) => [u.business_id, { id: u.business_id!, name: u.business_name }])
                  ).values()
                )}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
