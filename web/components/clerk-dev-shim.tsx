'use client';

import React, { createContext, useContext, useMemo } from 'react';

type MockUser = {
  id: string;
  firstName: string | null;
  publicMetadata: { role?: string; plan?: string };
  primaryEmailAddress?: { emailAddress?: string };
};

type MockSession = {
  getToken: () => Promise<string | null>;
};

type ClerkContextValue = {
  user: MockUser | null;
  session: MockSession | null;
};

const ClerkContext = createContext<ClerkContextValue>({
  user: null,
  session: null,
});

const LOCAL_USER: MockUser = {
  id: 'user_local_preview',
  firstName: 'Dev',
  publicMetadata: { role: 'admin', plan: 'scale' },
  primaryEmailAddress: { emailAddress: 'dev@localhost' },
};

export function ClerkProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<ClerkContextValue>(() => ({
    user: LOCAL_USER,
    session: null,
  }), []);

  return <ClerkContext.Provider value={value}>{children}</ClerkContext.Provider>;
}

export function useUser() {
  const { user } = useContext(ClerkContext);
  return { isLoaded: true, isSignedIn: !!user, user };
}

export function useSession() {
  const { session } = useContext(ClerkContext);
  return { isLoaded: true, session };
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  const { user } = useContext(ClerkContext);
  return user ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const { user } = useContext(ClerkContext);
  return user ? null : <>{children}</>;
}

export function UserButton() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-eph-border bg-eph-surface text-xs font-semibold text-eph-text">
      Dev
    </div>
  );
}
