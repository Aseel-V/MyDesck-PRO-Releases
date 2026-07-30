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

  private static isAuthRelatedError(error: Error | null): boolean {
    if (!error) return false;
    const message = error.message?.toLowerCase() || '';

    // Verified auth/JWT errors ONLY
    return (
      message.includes('refresh_token_not_found') ||
      message.includes('invalid refresh token') ||
      message.includes('jwt expired') ||
      message.includes('jwt claims') ||
      (message.includes('auth') && message.includes('session_not_found')) ||
      message.includes('pgrst301')
    );
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const isAuthError = ErrorBoundary.isAuthRelatedError(error);
    return { hasError: true, error, isAuthError };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] React render error caught:', error, errorInfo);

    // Only auto-recover if verified auth/JWT error
    if (this.state.isAuthError && !this.state.hasCleared) {
      this.autoRecoverFromAuthError();
    }
  }

  private clearAuthStorage = () => {
    console.warn('[ErrorBoundary] Clearing auth storage for verified session error...');
    Object.keys(localStorage).forEach((key) => {
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
    console.warn('[ErrorBoundary] Auto-recovering from verified auth failure...');
    this.clearAuthStorage();
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetState = () => {
    this.setState({ hasError: false, error: null, isAuthError: false, hasCleared: false });
  };

  public render() {
    if (this.state.hasError) {
      if (this.state.isAuthError) {
        return (
          <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">
              Session Expired
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Your session has expired. Redirecting to sign-in...
            </p>
          </div>
        );
      }

      return (
        <div className="flex min-h-[350px] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
          <AlertTriangle className="h-10 w-10 text-rose-500" />
          <h2 className="mt-3 text-base font-bold text-rose-900 dark:text-rose-200">
            Component Error
          </h2>
          <p className="mt-1 max-w-md text-xs text-rose-700 dark:text-rose-300">
            A temporary display error occurred in this view. Your data is safe.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={this.handleResetState}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-200"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
