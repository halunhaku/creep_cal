import React from 'react';
import { useT } from '../i18n';

/**
 * `message` stays a prop: the callers that pass one are naming the specific thing
 * being loaded ("Loading model…", "Loading workspace…") and resolve it from the
 * catalogue themselves. The default is the generic one.
 */
const LoadingSpinner = ({ 
  size = 40, 
  message,
  showMessage = true,
}) => {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center p-5 gap-3">
      <div
        className="rounded-full animate-spin"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          border: `3px solid var(--action-soft)`,
          borderTop: `3px solid var(--action)`,
        }}
      />
      
      {showMessage && (
        <div className="text-muted text-sm font-medium text-center">
          {message ?? t('loading.default')}
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
