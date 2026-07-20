import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
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
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-950/50 border border-rose-500/20 text-center">
                    <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
                    <h3 className="text-sm font-semibold text-slate-200">Something went wrong</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                        {this.state.error?.message || 'Failed to load component'}
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}
