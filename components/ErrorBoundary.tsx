import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught Error in Component Tree:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleClearCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error("Error clearing storage", e);
    }
    window.location.href = window.location.origin;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 font-sans">
          <div className="max-w-lg w-full bg-slate-800/80 border border-slate-700/60 rounded-3xl p-8 shadow-2xl backdrop-blur-xl space-y-6 text-center">
            <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto text-3xl font-black">
              ⚠️
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black tracking-tight text-white uppercase">Application Interface Error</h2>
              <p className="text-slate-400 text-xs leading-relaxed">
                An unexpected component runtime exception occurred. The white screen was automatically intercepted to preserve application stability.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-left overflow-auto max-h-36 font-mono text-[11px] text-rose-300">
                <p className="font-bold text-rose-400 mb-1">{this.state.error.toString()}</p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] text-slate-500 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/20"
              >
                Reload App
              </button>
              <button
                onClick={this.handleClearCache}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
              >
                Clear Cache & Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
