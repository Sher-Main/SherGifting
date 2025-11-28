import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import GlassCard from './UI/GlassCard';
import GlowButton from './UI/GlowButton';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
  errorId: string;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    showDetails: false,
    errorId: '',
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate a unique error ID for support reference
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return { 
      hasError: true, 
      error,
      errorId,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    
    // Optional: Send error to error reporting service
    // Example: errorService.reportError(error, errorInfo, this.state.errorId);
  }

  private handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      showDetails: false,
      errorId: '',
    });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      showDetails: false,
      errorId: '',
    });
    window.location.href = '/';
  };

  private toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          showDetails={this.state.showDetails}
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
          onToggleDetails={this.toggleDetails}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error?: Error;
  errorInfo?: ErrorInfo;
  errorId: string;
  showDetails: boolean;
  onRetry: () => void;
  onGoHome: () => void;
  onToggleDetails: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo,
  errorId,
  showDetails,
  onRetry,
  onGoHome,
  onToggleDetails,
}) => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0B1120]">
      <GlassCard className="max-w-2xl w-full animate-fade-in-up">
        <div className="text-center">
          {/* Error Icon */}
          <div className="w-20 h-20 bg-[#7F1D1D]/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border-2 border-[#EF4444]/30">
            <AlertTriangle size={40} className="text-[#EF4444]" />
          </div>

          {/* Error Title */}
          <h1 className="text-3xl font-bold text-white mb-3">
            Something went wrong
          </h1>
          
          {/* User-friendly message */}
          <p className="text-[#94A3B8] text-lg mb-2">
            We encountered an unexpected error. Don't worry, your data is safe.
          </p>

          {/* Error ID for support */}
          {errorId && (
            <div className="bg-[#1E293B]/40 border border-white/10 rounded-lg p-3 mb-6 inline-block">
              <p className="text-xs text-[#64748B] mb-1">Error Reference</p>
              <p className="text-sm text-white font-mono">{errorId}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <GlowButton
              variant="primary"
              onClick={onRetry}
              icon={RefreshCw}
              fullWidth={window.innerWidth < 640}
            >
              Reload Page
            </GlowButton>
            <GlowButton
              variant="secondary"
              onClick={onGoHome}
              icon={Home}
              fullWidth={window.innerWidth < 640}
            >
              Go to Homepage
            </GlowButton>
          </div>

          {/* Error Details (Collapsible) */}
          {(isDevelopment || error) && (
            <div className="mt-6 border-t border-white/10 pt-6">
              <button
                onClick={onToggleDetails}
                className="flex items-center justify-between w-full text-left text-sm text-[#94A3B8] hover:text-white transition-colors mb-3"
                aria-expanded={showDetails}
              >
                <span className="font-medium">Technical Details</span>
                {showDetails ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </button>

              {showDetails && (
                <div className="bg-[#0F172A]/50 border border-white/10 rounded-lg p-4 text-left space-y-3">
                  {error && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-2">
                        Error Message
                      </p>
                      <pre className="text-sm text-[#EF4444] bg-[#7F1D1D]/20 p-3 rounded overflow-auto">
                        {error.toString()}
                      </pre>
                    </div>
                  )}

                  {errorInfo && errorInfo.componentStack && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-2">
                        Component Stack
                      </p>
                      <pre className="text-xs text-[#94A3B8] bg-[#1E293B]/40 p-3 rounded overflow-auto max-h-48">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}

                  {isDevelopment && (
                    <p className="text-xs text-[#64748B] italic">
                      These details are only visible in development mode.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Help Text */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-sm text-[#64748B]">
              If this problem persists, please contact support with the error reference above.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default ErrorBoundary;
