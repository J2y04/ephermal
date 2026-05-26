'use client';
import { ClerkProvider } from '@clerk/clerk-react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey="pk_live_Y2xlcmsuZXBoZXJtYWwuYXBwJA">
      {children}
    </ClerkProvider>
  );
}
