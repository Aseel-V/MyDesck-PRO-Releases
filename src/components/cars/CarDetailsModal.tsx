import { useState } from 'react';
import { X, CarFront, User, Calendar, Gauge, Wrench, CreditCard, FileText, Info, Trash2, AlertTriangle } from 'lucide-react';
import { AutoRepairOrder, AutoRepairItem } from '../../types/autoRepair';
import { useCurrency } from '../../contexts/CurrencyContext';
import { motion, AnimatePresence } from 'framer-motion';

import AddServiceModal from './AddServiceModal';

interface CarDetailsModalProps {
  order: AutoRepairOrder;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate?: () => void;
}

export default function CarDetailsModal({ order, onClose, onDelete, onUpdate }: CarDetailsModalProps) {
  const { currency, format } = useCurrency();
  const vehicle = order.vehicle;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddService, setShowAddService] = useState(false);

  const handleDeleteClick = () => {
      setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
      onDelete(order.id);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative max-w-2xl w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        
        {/* Delete Confirmation Overlay */}
        <AnimatePresence>
            {showDeleteConfirm && (
                <motion.div 
                    initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
                    exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    className="absolute inset-0 z-50 bg-white/80 dark:bg-slate-950/80 flex items-center justify-center p-6"
                >
                    <motion.div 
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 text-center"
                    >
                        <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete Vehicle?</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                            Are you sure you want to delete this order? This action cannot be undone and will remove all associated data.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 px-4 py-2 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-500/20 transition-all"
                            >
                                Yes, Delete
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-sky-100 dark:bg-sky-500/10 rounded-lg">
                <CarFront className="w-6 h-6 text-sky-600 dark:text-sky-400" />
             </div>
             <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {vehicle?.model || 'Unknown Model'}
                </h2>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-bold">
                        {vehicle?.plate_number}
                    </span>
                    {vehicle?.year && (
                        <>
                            <span>•</span>
                            <span>{vehicle.year}</span>
                        </>
                    )}
                    {vehicle?.trim_level && (
                        <>
                            <span>•</span>
                            <span className="uppercase">{vehicle.trim_level}</span>
                        </>
                    )}
                </div>
             </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 space-y-8 custom-scrollbar">
            
            {/* Status Section */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Status</span>
                    <div className="flex items-center gap-2 mt-1">
                        <Wrench className="w-4 h-4 text-sky-500" />
                        <span className="font-bold capitalize text-slate-900 dark:text-white">{order.status}</span>
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Odometer</span>
                    <div className="flex items-center gap-2 mt-1">
                         <Gauge className="w-4 h-4 text-violet-500" />
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {order.odometer_reading?.toLocaleString()} km
                        </span>
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Date In</span>
                    <div className="flex items-center gap-2 mt-1">
                        <Calendar className="w-4 h-4 text-emerald-500" />
                        <span className="font-medium text-slate-900 dark:text-white">
                            {new Date(order.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>
                 <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                    <span className="text-xs text-slate-500 uppercase font-semibold">Total</span>
                    <div className="flex items-center gap-2 mt-1">
                         <CreditCard className="w-4 h-4 text-amber-500" />
                        <span className="font-bold text-slate-900 dark:text-white">
                            {format(order.total_amount, currency)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Vehicle Specs & Owner Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Vehicle Specs */}
                <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        Vehicle Specs
                    </h3>
                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Color</span>
                            <div className="flex items-center gap-2">
                                {vehicle?.color && (
                                    <div className="w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: 'currentColor' }} />
                                )}
                                <span className="font-medium text-slate-900 dark:text-white">
                                    {vehicle?.color || 'N/A'}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Test Exp.</span>
                            <span className="font-medium text-slate-900 dark:text-white">
                                {vehicle?.test_expiry ? new Date(vehicle.test_expiry).toLocaleDateString() : 'N/A'}
                            </span>
                        </div>
                         <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Ownership</span>
                            <span className="font-medium text-slate-900 dark:text-white">
                                {vehicle?.ownership || 'N/A'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Trim</span>
                            <span className="font-medium text-slate-900 dark:text-white">
                                {vehicle?.trim_level || 'N/A'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Owner Details */}
                <div>
                     <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Owner Details
                    </h3>
                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                        <div>
                            <label className="text-xs text-slate-500">Name</label>
                            <p className="font-medium text-slate-900 dark:text-slate-200 text-lg">{vehicle?.owner_name}</p>
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Phone</label>
                            <p className="font-medium text-slate-900 dark:text-slate-200 text-lg">{vehicle?.owner_phone || 'N/A'}</p>
                        </div>
                    </div>
                </div>
            </div>

             {/* Notes / Issues */}
             <div>
                 <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Notes / Issues
                </h3>
                <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 min-h-[100px]">
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {order.notes || 'No notes added.'}
                    </p>
                </div>
            </div>

            {/* Services & Parts Section */}
            <div>
                 <div className="flex items-center justify-between mb-3">
                     <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <Wrench className="w-4 h-4" />
                        Services & Parts
                    </h3>
                    <button
                        onClick={() => setShowAddService(true)}
                        className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 flex items-center gap-1"
                    >
                        <AlertTriangle className="w-3 h-3" /> {/* Using generic icon since Plus is not imported, can fix later or use text */}
                        Add Service
                    </button>
                 </div>
                
                <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {order.items && order.items.length > 0 ? (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase">Type</th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase">Qty</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {order.items.map((item: AutoRepairItem) => (
                                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                                        <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">
                                            {item.name}
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                item.type === 'part' 
                                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' 
                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                                            }`}>
                                                {item.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-center text-slate-600 dark:text-slate-400">
                                            {item.quantity}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono text-slate-900 dark:text-white">
                                            {format(item.price, currency)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 font-bold">
                                <tr>
                                    <td colSpan={3} className="px-4 py-2 text-right text-slate-500">Total</td>
                                    <td className="px-4 py-2 text-right text-slate-900 dark:text-white">
                                        {format(order.total_amount, currency)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : (
                        <div className="p-8 text-center">
                            <p className="text-slate-400 text-sm">No services added yet.</p>
                            <button 
                                onClick={() => setShowAddService(true)}
                                className="mt-2 text-sky-600 dark:text-sky-400 text-sm font-medium hover:underline"
                            >
                                Add your first service
                            </button>
                        </div>
                    )}
                </div>
            </div>

        </div>

        {showAddService && (
            <AddServiceModal 
                order={order}
                onClose={() => setShowAddService(false)}
                onSuccess={() => {
                    if (onUpdate) onUpdate();
                }}
            />
        )}

         {/* Footer Actions */}
         <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between gap-3 shrink-0">
            <button
                onClick={handleDeleteClick}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20 transition-colors"
                title="Delete Order"
             >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
            </button>
            
            <div className="flex items-center gap-3">
                <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                    Close
                </button>
                <button
                    className="px-6 py-2 rounded-xl text-sm font-bold text-white bg-sky-600 hover:bg-sky-500 shadow-lg shadow-sky-500/20 transition-all"
                >
                    Edit Order
                </button>
            </div>
         </div>

      </motion.div>
    </div>
  );
}
