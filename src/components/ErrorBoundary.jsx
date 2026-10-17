import React from 'react';
import { useT } from '../i18n';

/**
 * The fallback is a function component so it can read the catalogue: a class
 * component cannot call `useT()`, and threading a `t` prop through the boundary
 * would make every caller responsible for a component that exists to be the one
 * thing that still works when everything else has failed.
 */
function ErrorFallback({ error, errorInfo, onRetry }) {
  const t = useT();
  return (
    <div className="card p-10 text-center mx-8 my-12 max-w-lg mx-auto">
      <div className="font-mono text-xl text-action mb-6">{t('error.marker')}</div>
      <h2 className="text-xl font-sans font-semibold text-ink mb-4">
        {t('error.title')}
      </h2>
      <p className="text-muted mb-8 text-sm leading-relaxed">
        {t('error.body')}
      </p>

      <div className="flex gap-4 justify-center flex-wrap">
        <button
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          {t('error.refresh')}
        </button>

        <button
          onClick={onRetry}
          className="btn-secondary"
        >
          {t('error.retry')}
        </button>
      </div>

      {import.meta.env.DEV && error && (
        <details className="mt-8 border border-error bg-error-soft p-4 text-left">
          <summary className="cursor-pointer font-bold text-error mb-2">
            {t('error.details')}
          </summary>
          <pre className="text-xs text-error overflow-auto max-h-48 m-0 font-mono">
            {error.toString()}
            <br />
            {errorInfo.componentStack}
          </pre>
        </details>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
    this.reset = this.reset.bind(this);
  }

  // React passes the thrown error here; this boundary only needs the flag, the
  // error itself is captured in componentDidCatch below.
  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  reset() {
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.reset}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
