import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spinner } from '@/ui/display';
import { useMe } from './session';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const me = useMe();
  const loc = useLocation();
  if (me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-n-400">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (me.isError || !me.data) {
    return <Navigate to={`/admin/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  return <>{children}</>;
}

/** Main-admin-only routes: everyone else is sent back to the rooms list. */
export function RequireMainAdmin({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return null;
  if (me.data?.role !== 'MAIN') return <Navigate to="/admin/rooms" replace />;
  return <>{children}</>;
}
