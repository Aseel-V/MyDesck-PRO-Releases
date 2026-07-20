import { useState, useEffect } from 'react';
import { X, Search, Plus, Wrench, Coins, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CarPart } from '../../types/carParts';
import { AutoRepairOrder } from '../../types/autoRepair';
import { useCurrency } from '../../contexts/CurrencyContext';
import { toast } from 'sonner';

interface AddServiceModalProps {
    order: AutoRepairOrder;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddServiceModal({ order, onClose, onSuccess }: AddServiceModalProps) {
    const { profile } = useAuth();
    const { format, currency } = useCurrency();
    
    const [parts, setParts] = useState<CarPart[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPart, setSelectedPart] = useState<CarPart | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [laborCost, setLaborCost] = useState<string>('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchParts();
    }, [profile?.id]);

    const fetchParts = async () => {
        if (!profile?.id) return;
        try {
            const { data, error } = await supabase
                .from('car_parts')
                .select('*')
                .eq('business_id', profile.id)
                .gt('quantity', 0) // Only show parts in stock
                .order('part_name');
            
            if (error) throw error;
            setParts(data || []);
        } catch (err) {
            console.error('Error fetching parts:', err);
            toast.error('Failed to load parts inventory');
        } finally {
            setLoading(false);
        }
    };

    const filteredParts = parts.filter(part => {
        const searchLower = searchTerm.toLowerCase();
        return (
            part.part_name.toLowerCase().includes(searchLower) ||
            part.description?.toLowerCase().includes(searchLower) ||
            part.serial_number?.toLowerCase().includes(searchLower) ||
            part.compatible_cars?.some(car => car.toLowerCase().includes(searchLower))
        );
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Validate inputs
        if (!selectedPart && !laborCost) {
             toast.error('Please select a part or enter labor cost');
             return;
        }

        setSaving(true);
        try {
            const laborAmount = parseFloat(laborCost) || 0;
            const unitPrice = selectedPart?.selling_price_unit || 0;
            const partTotal = unitPrice * quantity;
            const unitCost = selectedPart?.purchase_price_unit || 0;
            const costTotal = unitCost * quantity;

            // Prepare items for RPC
            const items = [];
            
            // 1. Part Item
            if (selectedPart) {
                items.push({
                    type: 'part',
                    inventory_item_id: selectedPart.id,
                    name: selectedPart.part_name,
                    quantity: quantity,
                    cost: costTotal,
                    price: partTotal
                });
            }

            // 2. Labor Item
            if (laborAmount > 0) {
                 items.push({
                    type: 'labor',
                    inventory_item_id: null,
                    name: 'Service Labor (Hand Cost)',
                    quantity: 1,
                    cost: 0,
                    price: laborAmount
                });
            }

            // 3. Call RPC Transaction
            const { error: rpcError } = await supabase.rpc('add_repair_service_transaction', {
                p_order_id: order.id,
                p_items: items
            });

            if (rpcError) throw rpcError;

            toast.success('Service added successfully');
            onSuccess();
            onClose();

        } catch (err) {
            console.error('Error adding service:', err);
            toast.error('Failed to add service');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                 <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-sky-500" />
                        Add Service / Part
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    
                    {/* Part Selection */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <Package className="w-4 h-4 text-sky-500" />
                            Select Part (Optional)
                        </label>
                        
                        {!selectedPart ? (
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input 
                                        type="text"
                                        placeholder="Search parts inventory..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none"
                                    />
                                </div>
                                
                                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-slate-50 dark:bg-slate-950/50">
                                    {loading ? (
                                        <div className="p-4 text-center text-slate-500 text-sm">Loading parts...</div>
                                    ) : filteredParts.length === 0 ? (
                                        <div className="p-4 text-center text-slate-500 text-sm">No parts found</div>
                                    ) : (
                                        filteredParts.map(part => (
                                            <button
                                                key={part.id}
                                                onClick={() => {
                                                    setSelectedPart(part);
                                                    setQuantity(1);
                                                }}
                                                className="w-full text-left p-3 hover:bg-sky-50 dark:hover:bg-sky-900/10 flex items-center justify-between group transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0"
                                            >
                                                <div>
                                                    <div className="font-medium text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">
                                                        {part.part_name}
                                                    </div>
                                                    <div className="text-xs text-slate-500">
                                                        Stock: {part.quantity} • {format(part.selling_price_unit || 0, currency)}
                                                    </div>
                                                </div>
                                                <Plus className="w-4 h-4 text-slate-300 group-hover:text-sky-500" />
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="relative overflow-hidden rounded-xl border border-sky-100 dark:border-sky-900 bg-gradient-to-br from-sky-50/50 to-white dark:from-sky-950/30 dark:to-slate-900 p-4">
                                <div className="flex items-center justify-between gap-4">
                                    {/* Left: Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">Selected Part</span>
                                            <span className="text-xs text-slate-300 dark:text-slate-600">|</span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">Stock: {selectedPart.quantity}</span>
                                        </div>
                                        <div className="font-bold text-slate-900 dark:text-white truncate text-base mb-0.5">{selectedPart.part_name}</div>
                                        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                            {format(selectedPart.selling_price_unit || 0, currency)} <span className="text-xs text-slate-400">/ unit</span>
                                        </div>
                                    </div>

                                    {/* Right: Quantity & Action */}
                                    <div className="flex items-center gap-3">
                                        {/* Quantity Control */}
                                        <div className="flex items-center bg-white dark:bg-slate-950 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 p-1">
                                            <button
                                                type="button"
                                                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                                            >
                                                <span className="text-lg leading-none mb-0.5">-</span>
                                            </button>
                                            <input 
                                                type="number"
                                                min="1"
                                                max={selectedPart.quantity}
                                                value={quantity}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    if (val > selectedPart.quantity) {
                                                        toast.error(`Cannot exceed available stock of ${selectedPart.quantity}`);
                                                        setQuantity(selectedPart.quantity);
                                                    } else {
                                                        setQuantity(Math.min(val, selectedPart.quantity));
                                                    }
                                                }}
                                                className="w-12 text-center bg-transparent font-bold text-slate-900 dark:text-white text-sm outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setQuantity(q => Math.min(selectedPart.quantity, q + 1))}
                                                className="w-8 h-8 flex items-center justify-center rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        {/* Remove Button */}
                                        <button 
                                            onClick={() => {
                                                setSelectedPart(null);
                                                setQuantity(1);
                                            }}
                                            className="p-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Labor Cost */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                             <Coins className="w-4 h-4 text-amber-500" />
                            Labor / Hand Cost
                        </label>
                        <div className="relative">
                            <div className="absolute left-4 top-2.5 text-slate-400 text-sm font-medium">
                                {currency}
                            </div>
                            <input 
                                type="number"
                                value={laborCost}
                                onChange={(e) => setLaborCost(e.target.value)}
                                placeholder="0.00"
                                className="w-full pl-12 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                            />
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl space-y-2 border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">
                                Part Price {quantity > 1 && <span className="text-slate-400 font-normal">(x{quantity})</span>}:
                            </span>
                            <span className="font-medium font-mono text-slate-900 dark:text-white">
                                {format((selectedPart?.selling_price_unit || 0) * quantity, currency)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Labor Price:</span>
                            <span className="font-medium font-mono text-slate-900 dark:text-white">
                                {format(parseFloat(laborCost) || 0, currency)}
                            </span>
                        </div>
                        <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold">
                            <span className="text-slate-900 dark:text-white">Total:</span>
                            <span className="text-sky-600 dark:text-sky-400 font-mono">
                                {format(((selectedPart?.selling_price_unit || 0) * quantity) + (parseFloat(laborCost) || 0), currency)}
                            </span>
                        </div>
                    </div>

                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving || (!selectedPart && !laborCost)}
                         className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-sky-600 hover:bg-sky-500 shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                        {saving ? 'Adding...' : 'Add Service'}
                    </button>
                </div>

            </motion.div>
        </div>
    );
}
