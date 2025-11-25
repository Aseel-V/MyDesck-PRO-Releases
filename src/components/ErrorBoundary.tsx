import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
                    <div className="glass-panel max-w-md w-full bg-slate-900/90 border border-rose-500/30 rounded-2xl p-8 text-center shadow-[0_0_50px_rgba(225,29,72,0.2)]">
                        <div className="inline-flex p-4 rounded-full bg-rose-500/10 border border-rose-500/20 mb-6">
                            <AlertTriangle className="w-8 h-8 text-rose-400" />
                        </div>

                        <h1 className="text-2xl font-bold text-slate-50 mb-2">
                            Something went wrong
                        </h1>

                        <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                            We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.
                        </p>

                        <div className="bg-slate-950/50 rounded-lg p-4 mb-6 text-left overflow-auto max-h-32 border border-slate-800">
                            <p className="text-xs font-mono text-rose-300 break-all">
                                {this.state.error?.message}
                            </p>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-50 text-slate-950 font-semibold hover:bg-slate-200 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
