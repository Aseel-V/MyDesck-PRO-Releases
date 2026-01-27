import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, TrendingUp, Search, UserPlus, CreditCard, ShieldCheck } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import CreateUserForm from './CreateUserForm';
import AdminUserTable from './AdminUserTable';
import EditUserModal from './EditUserModal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';



export default function AdminDashboard() {
  
  // States
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // Dropdown data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [businesses, setBusinesses] = useState<any[]>([]);

  // Stats
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAdmins: 0,
    activeSubscriptions: 0,
    totalRevenue: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newUsersChat: [] as any[]
  });

  // Fetch Users & Stats
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Users (User Profiles joined with Business Profiles)
      // Note: Supabase join syntax or two queries. Two queries is safer/easier if no strict FK set up in client types yet.
      
      const { data: userProfiles, error: userError } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (userError) throw userError;

      const { data: businessProfiles, error: businessError } = await supabase
        .from('business_profiles')
        .select('*');

      if (businessError) throw businessError;

      // Merge data
      const mergedUsers = userProfiles.map(u => {
        const business = businessProfiles.find(b => b.user_id === u.user_id);
        return {
          ...u,
          business_name: business?.business_name || 'N/A',
          business_type: business?.business_type || 'tourism', // Default
          logo_url: business?.logo_url,
          trial_start_date: business?.trial_start_date, // Assuming it's in business profile per plan
          subscription_status: business?.subscription_status || 'trial',
          is_suspended: business?.is_suspended || u.is_suspended // Check both, prefer business logic
        };
      });

      // Filter by search
      const filteredUsers = mergedUsers.filter(u => {
        if (!debouncedSearch) return true;
        const q = debouncedSearch.toLowerCase();
        return (
          u.full_name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.business_name?.toLowerCase().includes(q) ||
          u.phone_number?.includes(q) ||
          u.id.includes(q)
        );
      });

      setUsers(filteredUsers);
      setBusinesses(businessProfiles.map(b => ({ id: b.id, name: b.business_name })));

      // 2. Calculate Stats
      const totalUsers = mergedUsers.length;
      const totalAdmins = mergedUsers.filter(u => u.role === 'admin').length;
      const activeSubscriptions = mergedUsers.filter(u => u.subscription_status === 'active').length;
      
      // Chart Data: New Users by Month (Last 6 months)
      const chartData = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthLabel = d.toLocaleDateString('en-US', { month: 'short' });
        const monthIndex = d.getMonth();
        const year = d.getFullYear();
        
        const count = mergedUsers.filter(u => {
            const uDate = new Date(u.created_at);
            return uDate.getMonth() === monthIndex && uDate.getFullYear() === year;
        }).length;
        
        chartData.push({ name: monthLabel, users: count });
      }

      setStats({
        totalUsers,
        totalAdmins,
        activeSubscriptions,
        totalRevenue: 0, // Placeholder as we don't have subscription payments table yet
        newUsersChat: chartData
      });

    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditUser = (user: any) => {
    setSelectedUser(user);
    setShowEditModal(true);
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
            Admin Dashboard
          </h2>
          <p className="text-slate-500 mt-2 text-lg dark:text-slate-400">
            Overview of platform performance and user management.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
           <button
             onClick={() => setShowCreateModal(true)}
             className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 font-medium dark:bg-sky-600 dark:hover:bg-sky-500 dark:shadow-sky-900/20"
           >
             <UserPlus className="w-5 h-5" />
             <span>Create User</span>
           </button>
        </div>
      </div>

      {/* Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Stat Cards */}
        <div className="space-y-6">
           <div className="glass-panel p-6 rounded-2xl border border-slate-200 bg-white/50 shadow-sm dark:bg-slate-950/50 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Users</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{stats.totalUsers}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                <Users className="w-6 h-6" />
              </div>
           </div>
           
           <div className="glass-panel p-6 rounded-2xl border border-slate-200 bg-white/50 shadow-sm dark:bg-slate-950/50 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Subscriptions</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{stats.activeSubscriptions}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                <CreditCard className="w-6 h-6" />
              </div>
           </div>

           <div className="glass-panel p-6 rounded-2xl border border-slate-200 bg-white/50 shadow-sm dark:bg-slate-950/50 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Admins</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{stats.totalAdmins}</p>
              </div>
              <div className="p-3 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
           </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:bg-slate-950 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-sky-500" />
            New Users Joined
          </h3>
          <div className="h-[300px] w-full" style={{ minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <BarChart data={stats.newUsersChat}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)'
                  }}
                />
                <Bar dataKey="users" radius={[6, 6, 0, 0]} barSize={40}>
                  {stats.newUsersChat.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === stats.newUsersChat.length - 1 ? '#0ea5e9' : '#cbd5e1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* User Management Section */}
      <div className="glass-panel rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-950 dark:border-slate-800">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">User Management</h3>
              <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">Manage access, status, and subscriptions.</p>
            </div>

            {/* Smart Filter */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by name, ID, business..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 outline-none transition-all dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500"
              />
            </div>
        </div>

        <AdminUserTable 
          users={users} 
          loading={loading} 
          onEdit={handleEditUser}
        />
      </div>

      {/* Modals */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 animate-scaleIn dark:bg-slate-900 dark:border-slate-800">
             <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Create New User</h3>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full dark:hover:bg-slate-800 transition-colors"
                >
                  <Search className="sr-only" /> {/* sr-only placeholder, using simple X icon via CSS or just click outside mostly */}
                  <span className="text-slate-400 text-xl font-light">×</span>
                </button>
             </div>
             <div className="p-6 max-h-[80vh] overflow-y-auto">
                <CreateUserForm 
                  onClose={() => setShowCreateModal(false)}
                  onSuccess={() => {
                    setShowCreateModal(false);
                    fetchData();
                  }}
                  existingBusinesses={businesses}
                />
             </div>
          </div>
        </div>
      )}

      {showEditModal && selectedUser && (
        <EditUserModal 
          user={selectedUser}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            fetchData();
          }}
        />
      )}

    </div>
  );
}