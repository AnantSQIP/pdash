'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type EffectivePermissions } from './api';
import { useOrg } from './org-context';

// Highest-privilege first. The user's "persona" is the first of these they hold.
const ROLE_PRIORITY = ['Super Admin', 'Admin', 'Manager', 'HR', 'Senior Consultant', 'Consultant', 'Employee'];

type PermissionsValue = {
  codes: string[];
  roles: string[];
  /** The highest-privilege role the user holds — used only for persona labels/ordering, never for gating. */
  primaryRole: string | null;
  isSuperAdmin: boolean;
  loading: boolean;
  can: (code: string | string[]) => boolean;
  hasRole: (name: string) => boolean;
};

const PermissionsContext = createContext<PermissionsValue>({
  codes: [], roles: [], primaryRole: null, isSuperAdmin: false, loading: true,
  can: () => false, hasRole: () => false,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useOrg();

  const { data, isLoading } = useQuery<EffectivePermissions>({
    queryKey: ['effective-permissions', currentUser?.id],
    queryFn: () => api.me.effectivePermissions(),
    enabled: !!currentUser?.id,
    staleTime: 60_000,
  });

  // Memoize the context value so consumers (Sidebar, every <Can>, every page) don't
  // re-render on unrelated parent updates. Rebuilds only when the permission data changes.
  const value = useMemo<PermissionsValue>(() => {
    const codes = data?.codes ?? [];
    const roles = data?.roles ?? [];
    const isSuperAdmin = data?.isSuperAdmin ?? false;
    const codeSet = new Set(codes);
    return {
      codes,
      roles,
      isSuperAdmin,
      primaryRole: ROLE_PRIORITY.find(r => roles.includes(r)) ?? roles[0] ?? null,
      loading: isLoading,
      can: (code: string | string[]) => {
        if (isSuperAdmin) return true;
        const list = Array.isArray(code) ? code : [code];
        return list.some(c => codeSet.has(c));
      },
      hasRole: (name: string) => roles.includes(name),
    };
  }, [data, isLoading]);

  return (
    <PermissionsContext.Provider value={value}>
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
