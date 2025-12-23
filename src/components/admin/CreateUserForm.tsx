import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { UserPlus, Building2, User } from 'lucide-react';

interface BusinessOption {
    id: string;
    name: string;
}

interface CreateUserFormProps {
    onClose: () => void;
    onSuccess: () => void;
    existingBusinesses: BusinessOption[];
}

export default function CreateUserForm({ onClose, onSuccess, existingBusinesses }: CreateUserFormProps) {
    const [mode, setMode] = useState<'new_business' | 'staff'>('new_business');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Common fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [role, setRole] = useState('user');

    // New Business fields
    const [businessName, setBusinessName] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [language, setLanguage] = useState<'en' | 'ar' | 'he'>('en');

    // Staff fields
    const [selectedBusinessId, setSelectedBusinessId] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const payload: any = {
                email,
                password,
                fullName,
                phoneNumber,
                role,
            };

            if (mode === 'new_business') {
                payload.businessName = businessName;
                payload.logoUrl = logoUrl;
                payload.currency = currency;
                payload.language = language;
            } else {
                if (!selectedBusinessId) throw new Error('Please select a business');
                payload.businessId = selectedBusinessId;
            }

            const { data, error } = await supabase.functions.invoke('create-user', {
                body: payload,
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            onSuccess();
        } catch (err: any) {
            console.error('Error creating user:', err);
            setError(err.message || 'Failed to create user');
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500";
    const labelClass = "block text-xs font-semibold text-slate-700 mb-1.5 dark:text-slate-300";

    return (
        <div className="space-y-6">
            {/* Mode Toggle */}
            <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 dark:bg-slate-900/80 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => setMode('new_business')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'new_business'
                            ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/50'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                >
                    <Building2 className="w-4 h-4" />
                    New Business
                </button>
                <button
                    type="button"
                    onClick={() => setMode('staff')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'staff'
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                >
                    <User className="w-4 h-4" />
                    Add Staff
                </button>
            </div>

            {error && (
                <div className="bg-rose-500/10 border border-rose-400/40 text-rose-100 px-4 py-3 rounded-xl text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={inputClass}
                            required
                            minLength={6}
                        />
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Phone Number</label>
                        <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                </div>

                <div>
                    <label className={labelClass}>Role</label>
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className={inputClass}
                    >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>

                <div className="h-px bg-slate-200 my-4 dark:bg-slate-800/80" />

                {mode === 'new_business' ? (
                    <div className="space-y-4 animate-fadeIn">
                        <div>
                            <label className={labelClass}>Business Name</label>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                className={inputClass}
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Logo URL (Optional)</label>
                            <input
                                type="text"
                                value={logoUrl}
                                onChange={(e) => setLogoUrl(e.target.value)}
                                className={inputClass}
                                placeholder="https://..."
                            />
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Currency</label>
                                <select
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value)}
                                    className={inputClass}
                                >
                                    <option value="USD">USD ($)</option>
                                    <option value="EUR">EUR (€)</option>
                                    <option value="ILS">ILS (₪)</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Language</label>
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value as any)}
                                    className={inputClass}
                                >
                                    <option value="en">English</option>
                                    <option value="ar">Arabic</option>
                                    <option value="he">Hebrew</option>
                                </select>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 animate-fadeIn">
                        <div>
                            <label className={labelClass}>Select Business</label>
                            <select
                                value={selectedBusinessId}
                                onChange={(e) => setSelectedBusinessId(e.target.value)}
                                className={inputClass}
                                required
                            >
                                <option value="">-- Select a Business --</option>
                                {existingBusinesses.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-slate-500 mt-1 dark:text-slate-500">
                                The user will be added as staff to this business.
                            </p>
                        </div>
                    </div>
                )}

                <div className="pt-4 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition-all dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <UserPlus className="w-4 h-4" />
                                Create User
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
