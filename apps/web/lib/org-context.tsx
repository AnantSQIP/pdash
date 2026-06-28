'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, OrgSummary, UserSummary } from './api';
import { useAuth } from './auth-context';

type OrgContextValue = {
  org: OrgSummary | null;
  users: UserSummary[];
  currentUser: UserSummary | null;
  loading: boolean;
};

const OrgContext = createContext<OrgContextValue>({ org: null, users: [], currentUser: null, loading: true });

const ORG_STALE = 5 * 60 * 1000; // 5 minutes

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, isAuthed } = useAuth();

  const { data: orgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.orgs.list(),
    enabled: isAuthed,
    staleTime: ORG_STALE,
  });
  const org = orgs[0] ?? null;

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users', org?.id],
    queryFn: () => api.users.list(org!.id),
    enabled: isAuthed && !!org,
    staleTime: ORG_STALE,
  });

  // The signed-in user (verified server-side), enriched from the org user list when loaded.
  const currentUser: UserSummary | null = user
    ? (users.find(u => u.id === user.id) ?? {
        id: user.id, firstName: user.firstName, lastName: user.lastName,
        email: user.email, designation: user.designation ?? undefined, status: user.status,
      })
    : null;

  const loading = isAuthed && (orgsLoading || (!!org && usersLoading));

  return (
    <OrgContext.Provider value={{ org, users, currentUser, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
