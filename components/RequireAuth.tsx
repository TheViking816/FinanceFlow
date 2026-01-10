import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import LoadingState from './LoadingState';

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return <LoadingState label="Verificando sesión..." />;
  }

  if (!session) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

export default RequireAuth;
