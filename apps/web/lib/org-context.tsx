'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, OrgSummary, UserSummary } from './api';

type OrgContextValue = {
  org: OrgSummary | null;
  users: UserSummary[];
  currentUser: UserSummary | null;
  loading: boolean;
};

const OrgContext = createContext<OrgContextValue>({ org: null, users: [], currentUser: null, loading: true });

const ORG_STALE = 5 * 60 * 1000; // 5 minutes

export function OrgProvider({ children }: { children: ReactNode }) {
  const { data: orgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.orgs.list(),
    staleTime: ORG_STALE,
  });

  const org = orgs[0] ?? null;

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users', org?.id],
    queryFn: () => api.users.list(org!.id),
    enabled: !!org,
    staleTime: ORG_STALE,
  });

  // Use first admin user as the current user (replaced by real auth in Phase 6)
  const currentUser =
    users.find(u => u.email === 'mohit@squarkip.com') ??
    users.find(u => u.designation === 'VP') ??
    users[0] ??
    null;
  const loading = orgsLoading || (!!org && usersLoading);

  return (
    <OrgContext.Provider value={{ org, users, currentUser, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
