
import { useParams } from 'react-router-dom';

export default function Payment() {
    const { id } = useParams();
    return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">Payment Page</h1>
                <p>Trip/Event ID: {id}</p>
                <p className="text-slate-400 mt-2">Stripe & PayPal integration coming soon...</p>
            </div>
        </div>
    );
}
