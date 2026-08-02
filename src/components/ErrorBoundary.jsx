import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card p-10 text-center mx-8 my-12 max-w-lg mx-auto">
          <div className="font-mono text-xl uppercase tracking-[0.2em] text-green-dark mb-6">// Error</div>
          <h2 className="text-xl font-sans font-semibold text-primary mb-4">
            Something went wrong
          </h2>
          <p className="text-muted mb-8 text-sm leading-relaxed">
            The calculator encountered an unexpected error. Please refresh the page to try again.
          </p>
          
          <div className="flex gap-4 justify-center flex-wrap">
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Refresh page
            </button>
            
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              className="btn-secondary"
            >
              Retry
            </button>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <details className="mt-8 text-left bg-red-50/10 p-4 rounded-card border border-red-200/30">
              <summary className="cursor-pointer font-bold text-error mb-2">
                Error details (dev mode)
              </summary>
              <pre className="text-xs text-error overflow-auto max-h-48 m-0 font-mono">
                {this.state.error && this.state.error.toString()}
                <br />
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
