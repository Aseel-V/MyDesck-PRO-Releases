
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '../components/ui/Skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function GuideWallet() {
    const { user } = useAuth();

    const { data: analytics, isLoading } = useQuery({
        queryKey: ['guide-analytics', user?.id],
        queryFn: async () => {
            // In a real scenario, we call the Edge Function
            // const { data, error } = await supabase.functions.invoke('get-guide-analytics', {
            //   body: { guide_id: user?.id }
            // });

            // For now, we'll fetch from the function we created, or mock it if CORS/Auth issues arise during dev
            const { data, error } = await supabase.functions.invoke('get-guide-analytics', {
                body: { guide_id: user?.id }
            });
            if (error) throw error;
            return data;
        },
        enabled: !!user?.id,
    });

    if (isLoading) {
        return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col md:flex-row gap-4">
                {/* Balance Cards */}
                <div className="flex-1 glass-panel bg-slate-950/90 border border-emerald-500/30 rounded-2xl p-6">
                    <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">Available Balance</h3>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-white">${analytics?.wallet_balance?.available || '0.00'}</span>
                        <span className="text-sm text-emerald-400">USD</span>
                    </div>
                    <button className="mt-4 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition">
                        Withdraw Funds
                    </button>
                </div>

                <div className="flex-1 glass-panel bg-slate-950/90 border border-amber-500/30 rounded-2xl p-6">
                    <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">Pending Balance</h3>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-white">${analytics?.wallet_balance?.pending || '0.00'}</span>
                        <span className="text-sm text-amber-400">USD</span>
                    </div>
                    <p className="mt-4 text-xs text-slate-500">
                        Funds are held securely in Escrow for 24 hours after the trip ends.
                    </p>
                </div>
            </div>

            {/* Analytics Chart */}
            <div className="glass-panel bg-slate-950/90 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-6">Earnings Overview</h3>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analytics?.sales_chart_data || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="name" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                            />
                            <Line type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Transactions / Best Sellers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel bg-slate-950/90 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Top Selling Trips</h3>
                    <div className="space-y-3">
                        {analytics?.top_selling_trips?.map((trip: any, i: number) => (
                            <div key={i} className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg">
                                <span className="text-slate-200">{trip.name}</span>
                                <span className="text-emerald-400 font-medium">+${trip.revenue}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="glass-panel bg-slate-950/90 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Top Tippers</h3>
                    <div className="space-y-3">
                        {analytics?.top_tippers?.map((tipper: any, i: number) => (
                            <div key={i} className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg">
                                <span className="text-slate-200">{tipper.name}</span>
                                <span className="text-sky-400 font-medium">${tipper.amount}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
