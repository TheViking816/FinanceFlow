import React from 'react';

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-slate-400">
      <p className="text-sm font-bold">{title}</p>
      {description && <p className="text-xs mt-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
