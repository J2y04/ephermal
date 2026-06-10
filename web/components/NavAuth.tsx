'use client';
import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';

export default function NavAuth() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <SignedOut>
        <a href="/auth/login.html" className="btn-ghost">Log in</a>
        <a href="/auth/register.html" className="btn-nav-cta">Get Started</a>
      </SignedOut>
      <SignedIn>
        <a href="/dashboard.html" className="btn-ghost">Dashboard</a>
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: {
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                border: '1px solid rgba(85,88,232,0.3)',
              },
              userButtonPopoverCard: {
                background: '#0a0d1f',
                border: '1px solid rgba(85,88,232,0.18)',
                borderRadius: '16px',
                boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
              },
              userButtonPopoverActionButton__signOut: {
                color: '#f87171',
              },
            },
          }}
        />
      </SignedIn>
    </div>
  );
}
