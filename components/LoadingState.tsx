import React from 'react';

type LoadingStateProps = {
  label?: string;
};

const LoadingState: React.FC<LoadingStateProps> = ({ label = 'Cargando...' }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary"></div>
      <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
    </div>
  );
};

export default LoadingState;
