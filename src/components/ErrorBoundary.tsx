import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    isAuthError: boolean;
    hasCleared: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        isAuthError: false,
        hasCleared: false,
    };

    private static hasSupabaseData(): boolean {
        return Object.keys(localStorage).some(key => 
            key.startsWith('sb-') || key.startsWith('supabase.')
        );
    }

    private static isAuthRelatedError(error: Error | null): boolean {
        if (!error) return false;
        const message = error.message?.toLowerCase() || '';
        
        // Direct auth errors
        const isDirectAuthError = (
            message.includes('refresh token') ||
            message.includes('invalid token') ||
            message.includes('session') ||
            message.includes('auth') ||
            message.includes('not found')
        );
        
        // React error #31: "Objects are not valid as React children"
        // This often happens when corrupted auth data causes render issues
        const isReactRenderError = (
            message.includes('objects are not valid') ||
            message.includes('minified react error #31') ||
            message.includes('object with keys')
        );
        
        // If it's a React render error AND we have Supabase data, treat it as auth-related
        // because corrupted session data is often the cause
        if (isReactRenderError && ErrorBoundary.hasSupabaseData()) {
            console.warn('[ErrorBoundary] React render error detected with Supabase data present - treating as auth error');
            return true;
        }
        
        return isDirectAuthError;
    }

    public static getDerivedStateFromError(error: Error): Partial<State> {
        const isAuthError = ErrorBoundary.isAuthRelatedError(error);
        return { hasError: true, error, isAuthError };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        
        // If it's an auth error OR we have Supabase data and app crashed, auto-recover
        const shouldAutoRecover = ErrorBoundary.isAuthRelatedError(error) || ErrorBoundary.hasSupabaseData();
        
        if (shouldAutoRecover && !this.state.hasCleared) {
            this.autoRecoverFromAuthError();
        }
    }

    private clearAuthStorage = () => {
        console.warn('[ErrorBoundary] Clearing auth storage to recover from crash...');
        
        // Clear all Supabase-related keys from localStorage
        Object.keys(localStorage).forEach(key => {
            if (
                key.startsWith('sb-') ||
                key.startsWith('supabase.') ||
                key === 'app_business_profile' ||
                key === 'app_user_profile'
            ) {
                localStorage.removeItem(key);
            }
        });
        
        this.setState({ hasCleared: true });
    };

    private autoRecoverFromAuthError = () => {
        console.warn('[ErrorBoundary] Auto-recovering from auth error...');
        this.clearAuthStorage();
        
        // Auto-redirect after a brief delay to show the user what's happening
        setTimeout(() => {
            window.location.href = '/';
        }, 1500);
    };

    private handleReload = () => {
        // Ensure storage is cleared before reload
        if (this.state.isAuthError && !this.state.hasCleared) {
            this.clearAuthStorage();
        }
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            const { isAuthError } = this.state;
            
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
                    <div className="glass-panel max-w-md w-full bg-slate-900/90 border border-rose-500/30 rounded-2xl p-8 text-center shadow-[0_0_50px_rgba(225,29,72,0.2)]">
                        <div className="inline-flex p-4 rounded-full bg-rose-500/10 border border-rose-500/20 mb-6">
                            <AlertTriangle className="w-8 h-8 text-rose-400" />
                        </div>

                        <h1 className="text-2xl font-bold text-slate-50 mb-2">
                            {isAuthError ? 'Session Expired' : 'Something went wrong'}
                        </h1>

                        <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                            {isAuthError 
                                ? 'Recovering your session... You\'ll be redirected to sign in shortly.'
                                : 'We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.'
                            }
                        </p>

                        {isAuthError && (
                            <div className="flex justify-center mb-6">
                                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
                            </div>
                        )}

                        {!isAuthError && (
                            <>
                                <div className="bg-slate-950/50 rounded-lg p-4 mb-6 text-left overflow-auto max-h-32 border border-slate-800">
                                    <p className="text-xs font-mono text-rose-300 break-all">
                                        {this.state.error?.message}
                                    </p>
                                </div>
                                <button
                                    onClick={this.handleReload}
                                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-50 text-slate-950 font-semibold hover:bg-slate-200 transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Reload Application
                                </button>
                            </>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
