import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Save, Calendar, Building2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface EditUserModalProps {
  user: {
    id: string;
    user_id: string;
    full_name?: string;
    trial_start_date?: string;
    business_type?: string;
    is_suspended?: boolean;
    subscription_status?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [trialStart, setTrialStart] = useState('');
  const [businessType, setBusinessType] = useState<'tourism' | 'restaurant' | 'supermarket' | 'phone_shop' | 'car_parts' | 'clothes_shop' | 'furniture_store'>('tourism');
  const [isSuspended, setIsSuspended] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'trial' | 'active' | 'past_due'>('trial');

  // Load initial data
  useEffect(() => {
    if (user) {
      setTrialStart(user.trial_start_date ? new Date(user.trial_start_date).toISOString().split('T')[0] : '');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setBusinessType((user.business_type as any) || 'tourism');
      setIsSuspended(user.is_suspended || false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSubscriptionStatus((user.subscription_status as any) || 'trial');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Update business_profiles
      const { error: businessError } = await supabase
        .from('business_profiles')
        .update({
          business_type: businessType,
          trial_start_date: trialStart ? new Date(trialStart).toISOString() : null,
          subscription_status: subscriptionStatus,
          is_suspended: isSuspended // Ensure this is also in business_profiles as per plan
        })
        .eq('user_id', user.user_id);

      if (businessError) throw businessError;

      // 2. Update user_profiles (for suspension redundancy/safety if needed, or if app uses this)
      // The prompt says "Modify business_profiles table... Add is_suspended". 
      // But user_profiles ALSO has is_suspended. Let's update both to be safe and consistent.
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          is_suspended: isSuspended
        })
        .eq('user_id', user.user_id);

      if (profileError) throw profileError;

      toast.success('User updated successfully');
      onSuccess();
    } catch (error: unknown) {
      console.error('Error updating user:', error);
      toast.error((error as Error)?.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-scaleIn dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit User: {user.full_name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Trial Start Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Trial Start Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={trialStart}
                onChange={(e) => setTrialStart(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Change this to extend or reset the free trial period.</p>
          </div>

          {/* Business Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Business Type
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as typeof businessType)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none appearance-none"
              >
                <option value="tourism">Tourism (Trips)</option>
                <option value="restaurant">Restaurant</option>
                <option value="supermarket">Supermarket</option>
                <option value="phone_shop">Phone Shop</option>
                <option value="car_parts">Car Parts Shop</option>
                <option value="clothes_shop">Clothes Shop</option>
                <option value="furniture_store">Home Furniture Store</option>
              </select>
            </div>
          </div>

          {/* Subscription Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Subscription Status
            </label>
            <select
              value={subscriptionStatus}
              onChange={(e) => setSubscriptionStatus(e.target.value as typeof subscriptionStatus)}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
            >
              <option value="trial">Trial</option>
              <option value="active">Active (Paid)</option>
              <option value="past_due">Past Due</option>
            </select>
          </div>

          {/* Suspension Toggle */}
          <div className={`flex items-center justify-between p-4 rounded-xl border ${
            currentUser?.id === user.id 
              ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed' 
              : 'bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/20'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                currentUser?.id === user.id
                  ? 'bg-slate-200 text-slate-500'
                  : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-sm font-semibold ${
                  currentUser?.id === user.id ? 'text-slate-500' : 'text-rose-900 dark:text-rose-200'
                }`}>
                  {currentUser?.id === user.id ? 'Cannot Suspend Self' : 'Suspend Account'}
                </p>
                <p className={`text-xs ${
                  currentUser?.id === user.id ? 'text-slate-400' : 'text-rose-700 dark:text-rose-400'
                }`}>
                  {currentUser?.id === user.id ? 'You cannot suspend your own admin account.' : 'User will be blocked from logging in.'}
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={isSuspended}
                onChange={(e) => setIsSuspended(e.target.checked)}
                disabled={currentUser?.id === user.id}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-rose-300 dark:peer-focus:ring-rose-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-rose-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"></div>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Saving...' : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
