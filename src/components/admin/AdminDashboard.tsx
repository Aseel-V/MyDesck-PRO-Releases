import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Trip } from '../../types/trip';
import { Users, MapPin, TrendingUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';

interface UserWithProfile {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
  business_name: string;
  role: string;
  created_at: string;
}

const PAGE_SIZE = 10;

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { profile } = useAuth();

  // Data State
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userPage, setUserPage] = useState(1);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [totalTrips, setTotalTrips] = useState(0);
  const [tripPage, setTripPage] = useState(1);

  // Search State
  const [userSearch, setUserSearch] = useState('');
  const debouncedUserSearch = useDebounce(userSearch, 500);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Loading State
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTrips: 0,
    totalRevenue: 0,
    totalProfit: 0
  });

  // Fetch Stats (Once)
  useEffect(() => {
    fetchGlobalStats();
  }, []);

  // Fetch Users when page or search changes
  useEffect(() => {
    fetchUsers();
  }, [userPage, debouncedUserSearch]);

  // Fetch Trips when page or selected user changes
  useEffect(() => {
    fetchTrips();
  }, [tripPage, selectedUserId]);

  const fetchGlobalStats = async () => {
    try {
      // Optimize: Use head: true for counts to avoid fetching data
      const { count: userCount } = await supabase.from('user_profiles').select('id', { count: 'exact', head: true });
      const { count: tripCount } = await supabase.from('trips').select('id', { count: 'exact', head: true });

      // For revenue/profit, fetch only necessary columns
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

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      // Optimize: Fetch only needed columns
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

      // Fetch business profiles for these users
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

  const fetchTrips = async () => {
    setLoadingTrips(true);
    try {
      // Optimize: Fetch only needed columns
      // Note: We need all columns for the table rendering? 
      // The table uses: destination, client_name, start_date, end_date, sale_price, profit, payment_status, status
      let query = supabase
        .from('trips')
        .select('id, user_id, destination, client_name, start_date, end_date, sale_price, profit, payment_status, status', { count: 'exact' });

      if (selectedUserId) {
        query = query.eq('user_id', selectedUserId);
      }

      const from = (tripPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count, error } = await query
        .range(from, to)
        .order('start_date', { ascending: false });

      if (error) throw error;

      setTrips((data as Trip[]) || []);
      setTotalTrips(count || 0);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoadingTrips(false);
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
  const totalTripPages = Math.ceil(totalTrips / PAGE_SIZE);

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-gray-900">{t('admin.dashboardTitle')}</h2>
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg border border-red-300 font-semibold">
          {t('admin.adminAccess')}
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
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-xl font-bold text-gray-900">{t('admin.allUsers')}</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search users..."
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setUserPage(1); // Reset to first page on search
              }}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.email')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.fullName')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.businessName')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.phone')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.role')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loadingUsers ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.full_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.business_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => {
                          setSelectedUserId(user.id);
                          setTripPage(1);
                        }}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {t('admin.userTrips')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* User Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {Math.min((userPage - 1) * PAGE_SIZE + 1, totalUsers)} to {Math.min(userPage * PAGE_SIZE, totalUsers)} of {totalUsers} users
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

      {/* Trips Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900">
            {selectedUserId ? t('admin.userTrips') : t('admin.showAllTrips')}
          </h3>
          {selectedUserId && (
            <button
              onClick={() => {
                setSelectedUserId(null);
                setTripPage(1);
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all text-sm font-medium"
            >
              {t('admin.showAllTrips')}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.destination')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.client')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.dates')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.salePrice')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.profit')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.paymentStatus')}
                </th>
                <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('admin.table.status')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loadingTrips ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                    Loading trips...
                  </td>
                </tr>
              ) : trips.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                    No trips found
                  </td>
                </tr>
              ) : (
                trips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {trip.destination}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {trip.client_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(trip.start_date).toLocaleDateString()} -{' '}
                      {new Date(trip.end_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {currencySymbol}{trip.sale_price.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`font-semibold ${trip.profit >= 0 ? 'text-green-700' : 'text-red-700'
                          }`}
                      >
                        {trip.profit >= 0 ? '+' : ''}{currencySymbol}{trip.profit.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${trip.payment_status === 'paid'
                          ? 'bg-green-100 text-green-800'
                          : trip.payment_status === 'partial'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                          }`}
                      >
                        {trip.payment_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${trip.status === 'active'
                          ? 'bg-blue-100 text-blue-800'
                          : trip.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                          }`}
                      >
                        {trip.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Trip Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {Math.min((tripPage - 1) * PAGE_SIZE + 1, totalTrips)} to {Math.min(tripPage * PAGE_SIZE, totalTrips)} of {totalTrips} trips
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTripPage(p => Math.max(1, p - 1))}
              disabled={tripPage === 1 || loadingTrips}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTripPage(p => Math.min(totalTripPages, p + 1))}
              disabled={tripPage === totalTripPages || loadingTrips}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
