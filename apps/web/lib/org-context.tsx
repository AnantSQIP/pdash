'use client';

import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, OrgSummary, UserSummary } from './api';
import { useAuth } from './auth-context';

type OrgContextValue = {
  org: OrgSummary | null;
  users: UserSummary[];
  currentUser: UserSummary | null;
  loading: boolean;
  isError: boolean;
  error: Error | null;
};

const OrgContext = createContext<OrgContextValue>({ org: null, users: [], currentUser: null, loading: true, isError: false, error: null });

const ORG_STALE = 5 * 60 * 1000; // 5 minutes

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, isAuthed } = useAuth();

  const { data: orgs = [], isLoading: orgsLoading, isError: orgsError, error: orgsErr } = useQuery({
    queryKey: ['orgs'],
    queryFn: () => api.orgs.list(),
    enabled: isAuthed,
    staleTime: ORG_STALE,
  });
  const org = orgs[0] ?? null;

  const { data: users = [], isLoading: usersLoading, isError: usersError, error: usersErr } = useQuery({
    queryKey: ['users', org?.id],
    queryFn: () => api.users.list(org!.id),
    enabled: isAuthed && !!org,
    staleTime: ORG_STALE,
  });

  // Memoize the whole context value so consumers don't re-render on every parent render.
  // currentUser is derived here (was recomputed via users.find on each render).
  const value = useMemo<OrgContextValue>(() => {
    const currentUser: UserSummary | null = user
      ? (users.find(u => u.id === user.id) ?? {
          id: user.id, firstName: user.firstName, lastName: user.lastName,
          email: user.email, designation: user.designation ?? undefined, status: user.status,
        })
      : null;
    return {
      org,
      users,
      currentUser,
      loading: isAuthed && (orgsLoading || (!!org && usersLoading)),
      isError: orgsError || usersError,
      error: (orgsErr ?? usersErr ?? null) as Error | null,
    };
  }, [org, users, user, isAuthed, orgsLoading, usersLoading, orgsError, usersError, orgsErr, usersErr]);

  return (
    <OrgContext.Provider value={value}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
