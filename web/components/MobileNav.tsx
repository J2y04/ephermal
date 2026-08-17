'use client';

import { useEffect, useState } from 'react';
import NavAuth from './NavAuth';

const MOBILE_NAV_LINKS = [
  { href: '#analyse', label: 'Analyse Your Store' },
  { href: '#goal', label: "Who it's for" },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#services', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  // Escape key closes the menu.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={isOpen}
        aria-controls="mobile-nav-panel"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {isOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>
      <div id="mobile-nav-panel" className={`mobile-nav-panel${isOpen ? ' open' : ''}`} aria-hidden={!isOpen}>
        {MOBILE_NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setIsOpen(false)}>
            {link.label}
          </a>
        ))}
        <div className="mobile-nav-panel-divider" />
        <div className="mobile-nav-panel-auth">
          <NavAuth />
        </div>
      </div>
    </>
  );
}
