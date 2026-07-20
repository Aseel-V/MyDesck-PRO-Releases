import { Edit2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

import { useLanguage } from '../../contexts/LanguageContext';

interface AdminUser {
  id: string;
  created_at: string;
  subscription_status: 'active' | 'trial' | 'past_due' | 'cancelled' | null;
  is_suspended: boolean;
  user_id: string;
  role: string;
  logo_url: string | null;
  business_name: string;
  full_name: string;
  short_id: string;
  business_type: string;
  email: string;
  phone_number: string | null;
  trial_start_date?: string;
}

interface AdminUserTableProps {
  users: AdminUser[];
  loading: boolean;
  onEdit: (user: AdminUser) => void;
}

export default function AdminUserTable({ users, loading, onEdit }: AdminUserTableProps) {
  const { user: currentUser } = useAuth();
  const { t } = useLanguage();

  
  // Visual logic: Check if join date > 3 months
  const isTrialOver = (joinDate: string) => {
    if (!joinDate) return false;
    const date = new Date(joinDate);
    if (isNaN(date.getTime())) return false;
    
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    return date < threeMonthsAgo;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
    
  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        <div className="animate-spin w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full mx-auto mb-3"></div>
        {t('admin.loadingUsers')}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        {t('admin.noUsers')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-500 dark:text-slate-400 font-semibold sticky top-0">
          <tr>
            <th className="px-6 py-4 rounded-tl-xl">{t('admin.roles.user')}</th>
            <th className="px-6 py-4">{t('admin.table.businessName')}</th>
            <th className="px-6 py-4">{t('admin.table.contact')}</th>
            <th className="px-6 py-4">{t('admin.table.statusAndPlan')}</th>
            <th className="px-6 py-4 text-right rounded-tr-xl">{t('admin.table.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {users.map((user) => {
            const trialExpired = isTrialOver(user.created_at) && user.subscription_status === 'trial';
            const isSuspended = user.is_suspended;
            const isMe = currentUser?.id === user.user_id;
            const isAdminUser = user.role === 'admin';
            
            // Safe access for dynamic keys
            const getBusinessTypeName = (type: string) => {

               return t(`admin.businessTypes.${type}`) || type;
            };

            const getSubscriptionStatusName = (status: string) => {

               return t(`admin.subscriptionStatus.${status}`) || status;
            };
            
            return (
              <tr 
                key={user.id} 
                className={`group transition-all hover:bg-slate-50 dark:hover:bg-slate-900/40 
                  ${trialExpired ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}
                  ${isSuspended ? 'bg-rose-50/60 dark:bg-rose-900/10 opacity-75' : ''}
                `}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-sm shrink-0 overflow-hidden">
                      {user.logo_url ? (
                        <img src={user.logo_url} alt={user.business_name} className="w-full h-full object-cover" />
                        ) : (
                        user.full_name?.charAt(0).toUpperCase() || '?'
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        {user.full_name}
                        {isAdminUser && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800/30">
                            {t('admin.badges.admin')}
                          </span>
                        )}
                        {isMe && (
                          <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                            {t('admin.badges.me')}
                          </span>
                        )}
                        {trialExpired && !isSuspended && !isAdminUser && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30">
                            {t('admin.badges.pay20')}
                          </span>
                        )}
                        {isSuspended && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/30">
                            {t('admin.badges.suspended')}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        ID: {user.short_id || user.id.substring(0, 8)}
                      </p>
                    </div>
                  </div>
                </td>
                
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{user.business_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/30">
                      {getBusinessTypeName(user.business_type)}
                    </span>
                  </div>
                </td>

                <td className="px-6 py-4">
                  <div className="space-y-1">
                    <p className="text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{user.phone_number || 'No phone'}</p>
                  </div>
                </td>

                <td className="px-6 py-4">
                  <div className="space-y-1">
                    {isAdminUser ? (
                       <span className="text-sm font-medium text-slate-400 dark:text-slate-500 italic">
                         {t('admin.badges.noPlanAdmin')}
                       </span>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                                user.subscription_status === 'active' ? 'bg-emerald-500' : 
                                user.subscription_status === 'past_due' ? 'bg-rose-500' : 'bg-amber-400'
                              }`} 
                          />
                          <span className="text-sm font-medium capitalize text-slate-700 dark:text-slate-300">
                             {getSubscriptionStatusName(user.subscription_status || 'trial')}
                          </span>
                        </div>
                         {user.trial_start_date && (
                             <p className="text-[10px] text-sky-500 dark:text-sky-400">
                               {t('admin.badges.trialReset')}: {formatShortDate(user.trial_start_date)}
                             </p>
                        )}
                      </>
                    )}
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {t('admin.badges.joined')}: {user.created_at ? formatDate(user.created_at) : 'N/A'}
                    </p>
                  </div>
                </td>

                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onEdit(user)}
                    className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                    title="Edit User"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

