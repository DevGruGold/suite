import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requireSuperadmin?: boolean;
  redirectTo?: string;
}

export function AuthGuard({
  children,
  requireAuth = false,
  requireAdmin = false,
  requireSuperadmin = false,
  redirectTo = '/auth',
}: AuthGuardProps) {
  const { isAuthenticated, isAdmin, isSuperadmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check authentication
  if (requireAuth && !isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Check admin access
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Check superadmin access
  if (requireSuperadmin && !isSuperadmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
