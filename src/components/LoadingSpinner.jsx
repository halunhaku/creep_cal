import React from 'react';

const LoadingSpinner = ({ 
  size = 40, 
  message = "Loading…", 
  showMessage = true,
}) => {
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
          {message}
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;
