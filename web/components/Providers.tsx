'use client';
import { ClerkProvider } from './clerk-react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_live_Y2xlcmsuZXBoZXJtYWwuYXBwJA'}>
      {children}
    </ClerkProvider>
  );
}
