import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Users, MapPin, TrendingUp, ChevronLeft, ChevronRight, Search, UserPlus, X } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import CreateUserForm from './CreateUserForm'; // استيراد النموذج

interface UserWithProfile {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
  business_name: string;
  role: string;
  created_at: string;
}

interface BusinessOption {
  id: string;
  name: string;
}

const PAGE_SIZE = 10;

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { profile } = useAuth();

  // Data State
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userPage, setUserPage] = useState(1);
  
  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

  // Search State
  const [userSearch, setUserSearch] = useState('');
  const debouncedUserSearch = useDebounce(userSearch, 500);

  // Loading State
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTrips: 0,
    totalRevenue: 0,
    totalProfit: 0
  });

  // Fetch Stats (Once)
  useEffect(() => {
    fetchGlobalStats();
    fetchBusinesses(); // جلب قائمة الشركات عند التحميل
  }, []);

  // Fetch Users when page or search changes
  useEffect(() => {
    fetchUsers();
  }, [userPage, debouncedUserSearch]);

  const fetchGlobalStats = async () => {
    try {
      const { count: userCount } = await supabase.from('user_profiles').select('id', { count: 'exact', head: true });
      const { count: tripCount } = await supabase.from('trips').select('id', { count: 'exact', head: true });
      const { data: financialData } = await supabase.from('trips').select('sale_price, profit');

      const totalRevenue = financialData?.reduce((sum, t) => sum + (t.sale_price || 0), 0) || 0;
      const totalProfit = financialData?.reduce((sum, t) => sum + (t.profit || 0), 0) || 0;

      setStats({
        totalUsers: userCount || 0,
        totalTrips: tripCount || 0,
        totalRevenue,
        totalProfit
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // دالة لجلب قائمة الشركات لاستخدامها في نموذج الإنشاء
  const fetchBusinesses = async () => {
    try {
      const { data } = await supabase
        .from('business_profiles')
        .select('id, business_name')
        .order('business_name');
      
      if (data) {
        setBusinesses(data.map(b => ({ id: b.id, name: b.business_name })));
      }
    } catch (error) {
      console.error('Error fetching businesses:', error);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      let query = supabase
        .from('user_profiles')
        .select('id, email, full_name, phone_number, role, created_at', { count: 'exact' });

      if (debouncedUserSearch) {
        query = query.or(`email.ilike.%${debouncedUserSearch}%,full_name.ilike.%${debouncedUserSearch}%`);
      }

      const from = (userPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: userProfiles, count, error } = await query
        .range(from, to)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const userIds = userProfiles?.map(u => u.id) || [];
      const { data: businessProfiles } = await supabase
        .from('business_profiles')
        .select('user_id, business_name')
        .in('user_id', userIds);

      const businessMap = new Map(
        businessProfiles?.map((bp) => [bp.user_id, bp.business_name]) || []
      );

      const combinedUsers: UserWithProfile[] = (userProfiles || []).map((up) => ({
        id: up.id,
        email: up.email || 'No email',
        full_name: up.full_name || 'No name',
        phone_number: up.phone_number || 'No phone',
        business_name: businessMap.get(up.id) || 'No business',
        role: up.role || 'user',
        created_at: up.created_at
      }));

      setUsers(combinedUsers);
      setTotalUsers(count || 0);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'ILS': return '₪';
      default: return '$';
    }
  };

  const currencySymbol = getCurrencySymbol(profile?.preferred_currency || 'USD');
  const totalUserPages = Math.ceil(totalUsers / PAGE_SIZE);

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{t('admin.dashboardTitle')}</h2>
          <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">Manage users and view platform statistics</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg border border-red-300 font-semibold text-sm">
            {t('admin.adminAccess')}
          </div>
          
          {/* Create User Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white transform transition-all hover:scale-105">
          <div className="flex items-center justify-between mb-4">
            <Users className="w-8 h-8 opacity-80" />
          </div>
          <p className="text-3xl font-bold mb-1">{stats.totalUsers}</p>
          <p className="text-sm opacity-80">{t('admin.totalUsers')}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white transform transition-all hover:scale-105">
          <div className="flex items-center justify-between mb-4">
            <MapPin className="w-8 h-8 opacity-80" />
          </div>
          <p className="text-3xl font-bold mb-1">{stats.totalTrips}</p>
          <p className="text-sm opacity-80">{t('admin.totalTrips')}</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white transform transition-all hover:scale-105">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="w-8 h-8 opacity-80" />
          </div>
          <p className="text-3xl font-bold mb-1">
            {currencySymbol}{stats.totalRevenue.toFixed(2)}
          </p>
          <p className="text-sm opacity-80">{t('admin.totalRevenue')}</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white transform transition-all hover:scale-105">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="w-8 h-8 opacity-80" />
          </div>
          <p className="text-3xl font-bold mb-1">
            {currencySymbol}{stats.totalProfit.toFixed(2)}
          </p>
          <p className="text-sm opacity-80">{t('admin.totalProfit')}</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:bg-slate-950/70 dark:border-slate-800">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{t('admin.allUsers')}</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t('admin.searchPlaceholder') || 'Search users...'}
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setUserPage(1);
              }}
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm w-full sm:w-64 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  {t('admin.table.email')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  {t('admin.table.fullName')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  {t('admin.table.businessName')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  {t('admin.table.phone')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  {t('admin.table.role')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-950/70 dark:divide-slate-800">
              {loadingUsers ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    {t('admin.loadingUsers')}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    {t('admin.noUsers')}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-900/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">
                      {user.full_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">
                      {user.business_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">
                      {user.phone_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'admin'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                          }`}
                      >
                        {user.role === 'admin' ? t('admin.roles.admin') : t('admin.roles.user')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* User Pagination */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between dark:border-slate-800">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {t('admin.paginationUsers', {
              start: Math.min((userPage - 1) * PAGE_SIZE + 1, totalUsers),
              end: Math.min(userPage * PAGE_SIZE, totalUsers),
              total: totalUsers
            })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setUserPage(p => Math.max(1, p - 1))}
              disabled={userPage === 1 || loadingUsers}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
              disabled={userPage === totalUserPages || loadingUsers}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 animate-scaleIn dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2 dark:text-white">
                <UserPlus className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                Create New Account
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 max-h-[80vh] overflow-y-auto">
              <CreateUserForm 
                onClose={() => setShowCreateModal(false)}
                onSuccess={() => {
                  setShowCreateModal(false);
                  fetchUsers(); // Refresh list after creation
                  fetchGlobalStats(); // Refresh stats
                }}
                existingBusinesses={businesses}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}