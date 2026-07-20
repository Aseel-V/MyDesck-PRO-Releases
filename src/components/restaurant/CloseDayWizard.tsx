import { useState, useEffect, useRef } from 'react';
import { useRestaurant } from '../../hooks/useRestaurant';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { ChevronRight, DollarSign, Users, FileText } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { PinPadModal, PinPadModalHandle } from './PinPadModal';

interface CloseDayWizardProps {
    isOpen: boolean;
    onClose: () => void;
}

// Helper Steps
export default function CloseDayWizard({ isOpen, onClose }: CloseDayWizardProps) {
    const { t } = useLanguage();
    const { staff, authorizeStaffAction, closeBusinessDay } = useRestaurant();
    const [currentStep, setCurrentStep] = useState(0);

    const STEPS = [
        t('restaurantAnalytics.closeDayWizard.staffAndShifts'),
        t('restaurantAnalytics.closeDayWizard.dailyExpenses'),
        t('restaurantAnalytics.closeDayWizard.reviewAndClose')
    ];
    const [processing, setProcessing] = useState(false);
    const [isPinPadOpen, setIsPinPadOpen] = useState(false);
    const pinPadRef = useRef<PinPadModalHandle>(null);

    // State for Step 1: Staff Shifts
    const [shifts, setShifts] = useState<{ staffId: string; hours: number; total: number }[]>([]);
    
    // State for Step 2: Expenses
    const [expenses, setExpenses] = useState<{ desc: string; amount: number }[]>([{ desc: t('restaurantAnalytics.closeDayWizard.marketSupplies'), amount: 0 }]);

    // State for Step 3: Totals (Calculated)
    const [totals, setTotals] = useState({
        sales: 0,
        tips: 0,
        labor: 0,
        expenses: 0,
        net: 0
    });

    // Init shifts
    useEffect(() => {
        if (staff.length > 0 && shifts.length === 0) {
            setShifts(staff.map(s => ({ staffId: s.id, hours: 0, total: 0 })));
        }
    }, [staff, shifts.length]);

    const { user } = useAuth();

    // Recalculate totals
    useEffect(() => {
        const fetchSales = async () => {
            if (!user?.id) return;
            
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('restaurant_orders')
                .select('total_amount')
                .eq('status', 'closed')
                .gte('closed_at', `${today}T00:00:00`)
                .lte('closed_at', `${today}T23:59:59`);

            if (error) {
                console.error('Error fetching sales:', error);
                return;
            }

            const totalSales = data?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
            
            const laborCost = shifts.reduce((sum, s) => sum + s.total, 0);
            const expenseCost = expenses.reduce((sum, e) => sum + e.amount, 0);
            
            setTotals({
                sales: totalSales,
                tips: 0,
                labor: laborCost,
                expenses: expenseCost,
                net: totalSales - laborCost - expenseCost
            });
        };

        fetchSales();
    }, [shifts, expenses, user?.id]);

    const updateShift = (index: number, hours: number) => {
        const s = staff.find(st => st.id === shifts[index].staffId);
        if (!s) return;
        const newShifts = [...shifts];
        newShifts[index] = { ...newShifts[index], hours, total: hours * s.hourly_rate };
        setShifts(newShifts);
    };



    // ... (rest of component state)

    const handlePinSuccess = async (pin: string) => {
        try {
            const result = await authorizeStaffAction.mutateAsync({ 
                pin, 
                requiredRole: 'Manager' // Check standard role name
            });
            
            if (result.staff_id) {
                setIsPinPadOpen(false);
                executeCloseDay(result.staff_id);
            }
        } catch (err: unknown) {
             toast.error((err as Error)?.message || 'Authorization failed');
             pinPadRef.current?.triggerFailure();
        }
    };

    const executeCloseDay = async (staffId: string) => {
        if (!user?.id) {
            toast.error(t('restaurantAnalytics.closeDayWizard.userNotFound'));
            return;
        }
        setProcessing(true);
        try {
            // Prepare inputs for RPC
            const shiftData = shifts
                .filter(s => s.hours > 0)
                .map(s => ({
                    staff_id: s.staffId,
                    hours: s.hours
                }));

            const expenseData = expenses.map(e => ({
                description: e.desc,
                amount: e.amount
            }));

            // Call Secure RPC
            await closeBusinessDay.mutateAsync({
                staffId: staffId,
                date: new Date().toISOString().split('T')[0],
                shifts: shiftData,
                expenses: expenseData
            });

            toast.success(t('restaurantAnalytics.closeDayWizard.closing'));
            onClose();
        } catch (err: unknown) {
            console.error(err);
            toast.error((err as Error)?.message || 'Failed to close day');
        } finally {
            setProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
                <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 h-[80vh]">
                    
                     {/* Header */}
                     <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                        <div>
                            <h2 className="text-2xl font-bold dark:text-white">{t('restaurantAnalytics.closeDayWizard.title')}</h2>
                            <p className="text-sm text-slate-500">{t('restaurantAnalytics.closeDayWizard.step')} {currentStep + 1}: {STEPS[currentStep]}</p>
                        </div>
                         {/* Steps Indicator */}
                         <div className="flex gap-2">
                            {STEPS.map((_, idx) => (
                                <div key={idx} className={`h-2 w-8 rounded-full transition-colors ${idx <= currentStep ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`} />
                            ))}
                         </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {currentStep === 0 && (
                            <div className="space-y-4">
                                <h3 className="font-bold flex items-center gap-2 mb-4"><Users className="text-emerald-500" /> {t('restaurantAnalytics.closeDayWizard.enterStaffHours')}</h3>
                                {staff.map((s, idx) => (
                                    <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <div>
                                            <div className="font-bold">{s.full_name}</div>
                                            <div className="text-xs text-slate-500">{s.role} • ₪{s.hourly_rate}/{t('restaurantAnalytics.closeDayWizard.hr')}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <input 
                                                type="number" 
                                                value={shifts[idx]?.hours || 0}
                                                onChange={(e) => updateShift(idx, parseFloat(e.target.value) || 0)}
                                                className="w-20 p-2 border rounded-lg text-center dark:bg-slate-900 dark:border-slate-700"
                                                min="0"
                                            />
                                            <div className="w-24 text-right font-bold text-emerald-600">₪{shifts[idx]?.total.toFixed(0)}</div>
                                        </div>
                                    </div>
                                ))}
                                <div className="text-right p-4 font-bold text-lg">{t('restaurantAnalytics.closeDayWizard.totalLabor')}: ₪{totals.labor.toFixed(0)}</div>
                            </div>
                        )}

                        {currentStep === 1 && (
                            <div className="space-y-4">
                                 <h3 className="font-bold flex items-center gap-2 mb-4"><DollarSign className="text-rose-500" /> {t('restaurantAnalytics.closeDayWizard.dailyExpenses')}</h3>
                                 {expenses.map((e, idx) => (
                                     <div key={idx} className="flex gap-4">
                                         <input 
                                            type="text" 
                                            value={e.desc}
                                            onChange={(ev) => {
                                                const newExp = [...expenses];
                                                newExp[idx].desc = ev.target.value;
                                                setExpenses(newExp);
                                            }}
                                            className="flex-1 p-3 border rounded-xl dark:bg-slate-800 dark:border-slate-700"
                                            placeholder={t('restaurantAnalytics.closeDayWizard.descriptionPlaceholder')}
                                         />
                                          <input 
                                            type="number" 
                                            value={e.amount}
                                            onChange={(ev) => {
                                                const newExp = [...expenses];
                                                newExp[idx].amount = parseFloat(ev.target.value);
                                                setExpenses(newExp);
                                            }}
                                            className="w-32 p-3 border rounded-xl dark:bg-slate-800 dark:border-slate-700"
                                            placeholder={t('restaurantAnalytics.closeDayWizard.amountPlaceholder')}
                                         />
                                     </div>
                                 ))}
                                 <button 
                                    onClick={() => setExpenses([...expenses, { desc: '', amount: 0}])}
                                    className="text-sm text-emerald-600 font-bold hover:underline"
                                >
                                    + {t('restaurantAnalytics.closeDayWizard.addExpense')}
                                </button>
                                 <div className="text-right p-4 font-bold text-lg">{t('restaurantAnalytics.closeDayWizard.totalExpenses')}: ₪{totals.expenses.toFixed(0)}</div>
                            </div>
                        )}

                        {currentStep === 2 && (
                             <div className="space-y-6 text-center">
                                <div className="p-8 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md mx-auto">
                                    <FileText size={48} className="mx-auto text-slate-400 mb-4" />
                                    <h3 className="text-xl font-bold mb-6">{t('restaurantAnalytics.closeDayWizard.summary')}</h3>
                                    
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                                            <span>{t('restaurantAnalytics.totalSales')}</span>
                                            <span className="font-medium text-slate-900 dark:text-white">₪{totals.sales}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                                            <span>{t('restaurantAnalytics.closeDayWizard.totalLabor')}</span>
                                            <span className="font-medium text-rose-500">-₪{totals.labor}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                                            <span>{t('restaurantAnalytics.tableExpenses')}</span>
                                            <span className="font-medium text-rose-500">-₪{totals.expenses}</span>
                                        </div>
                                        <div className="h-px bg-slate-200 dark:bg-slate-700 my-2" />
                                        <div className="flex justify-between text-lg font-bold">
                                            <span>{t('restaurantAnalytics.netProfit')}</span>
                                            <span className={totals.net >= 0 ? "text-emerald-600" : "text-rose-600"}>₪{totals.net}</span>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-500">{t('restaurantAnalytics.closeDayWizard.resetWarning')}</p>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-between bg-white dark:bg-slate-900">
                        <button 
                            onClick={() => currentStep > 0 ? setCurrentStep(c => c - 1) : onClose()}
                            className="px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                        >
                            {currentStep === 0 ? t('restaurantAnalytics.closeDayWizard.cancel') : t('restaurantAnalytics.closeDayWizard.back')}
                        </button>
                        
                        {currentStep < 2 ? (
                             <button 
                                onClick={() => setCurrentStep(c => c + 1)}
                                className="px-6 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-medium flex items-center gap-2"
                            >
                                {t('restaurantAnalytics.closeDayWizard.nextStep')} <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button 
                                onClick={() => setIsPinPadOpen(true)}
                                disabled={processing}
                                className="px-8 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-200 disabled:opacity-50"
                            >
                                {processing ? t('restaurantAnalytics.closeDayWizard.closing') : t('restaurantAnalytics.closeDayWizard.confirmAndClose')}
                            </button>
                        )}
                    </div>

                </div>
            </div>

            {isPinPadOpen && (
                <PinPadModal
                    ref={pinPadRef}
                    title={t('restaurantAnalytics.closeDayWizard.managerAuth')}
                    description={t('restaurantAnalytics.closeDayWizard.enterPinToClose')}
                    onClose={() => setIsPinPadOpen(false)}
                    onSuccess={handlePinSuccess}
                    isProcessing={false}
                />
            )}
        </>
    );
}

