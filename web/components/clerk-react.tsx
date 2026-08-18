'use client';

import * as ClerkReact from '@clerk/clerk-react';
import * as ClerkDev from './clerk-dev-shim';

const useDevShim = process.env.NODE_ENV === 'development';

export const ClerkProvider = useDevShim ? ClerkDev.ClerkProvider : ClerkReact.ClerkProvider;
export const useUser = useDevShim ? ClerkDev.useUser : ClerkReact.useUser;
export const useSession = useDevShim ? ClerkDev.useSession : ClerkReact.useSession;
export const SignedIn = useDevShim ? ClerkDev.SignedIn : ClerkReact.SignedIn;
export const SignedOut = useDevShim ? ClerkDev.SignedOut : ClerkReact.SignedOut;
export const UserButton = useDevShim ? ClerkDev.UserButton : ClerkReact.UserButton;
