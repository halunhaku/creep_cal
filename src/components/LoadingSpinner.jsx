import React from 'react';
import { useT } from '../i18n';

/**
 * `message` stays a prop: the callers that pass one are naming the specific thing
 * being loaded ("Loading model…", "Loading workspace…") and resolve it from the
 * catalogue themselves. The default is the generic one.
 *
 * The message node is always rendered and names the status via `aria-labelledby`,
 * so `showMessage={false}` hides it visually without leaving the spinner unnamed.
 * `aria-labelledby` points at that node rather than using `aria-label`: `message`
 * may be a node, which an attribute would stringify to "[object Object]".
 */
const LoadingSpinner = ({ 
  size = 40, 
  message,
  showMessage = true,
}) => {
  const t = useT();
  const messageId = React.useId();
  return (
    <div
      className="flex flex-col items-center justify-center p-5 gap-3"
      role="status"
      aria-labelledby={messageId}
    >
      <div
        className="rounded-full animate-spin"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          border: `3px solid var(--action-soft)`,
          borderTop: `3px solid var(--action)`,
        }}
      />
      
      <div
        id={messageId}
        className={showMessage ? "text-muted text-sm font-medium text-center" : "sr-only"}
      >
        {message ?? t('loading.default')}
      </div>
    </div>
  );
};

export default LoadingSpinner;
