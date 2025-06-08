
import React from 'react';

const Fallback = ({ error, resetErrorBoundary }: any) => {
  return (
    <div role="alert" style={{ padding: "20px", border: "1px solid red", backgroundColor: "#ffcccc" }}>
      <h2>Something went wrong:</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary} style={{ marginTop: "10px", backgroundColor: "#ccc" }}>
        Try Again
      </button>
    </div>
  );
};

export { Fallback };
