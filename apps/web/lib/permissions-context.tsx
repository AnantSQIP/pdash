'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type EffectivePermissions } from './api';
import { useOrg } from './org-context';

type PermissionsValue = {
  codes: string[];
  isSuperAdmin: boolean;
  loading: boolean;
  can: (code: string | string[]) => boolean;
};

const PermissionsContext = createContext<PermissionsValue>({
  codes: [], isSuperAdmin: false, loading: true, can: () => false,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useOrg();

  const { data, isLoading } = useQuery<EffectivePermissions>({
    queryKey: ['effective-permissions', currentUser?.id],
    queryFn: () => api.me.effectivePermissions(),
    enabled: !!currentUser?.id,
    staleTime: 60_000,
  });

  const codes = data?.codes ?? [];
  const isSuperAdmin = data?.isSuperAdmin ?? false;

  const can = (code: string | string[]) => {
    if (isSuperAdmin) return true;
    const list = Array.isArray(code) ? code : [code];
    return list.some(c => codes.includes(c));
  };

  return (
    <PermissionsContext.Provider value={{ codes, isSuperAdmin, loading: isLoading, can }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

/** Render children only if the actor has the given permission(s). */
export function Can({ perm, children, fallback = null }: { perm: string | string[]; children: ReactNode; fallback?: ReactNode }) {
  const { can } = usePermissions();
  return <>{can(perm) ? children : fallback}</>;
}
