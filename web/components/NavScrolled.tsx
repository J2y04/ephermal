'use client';
import { useEffect } from 'react';

export default function NavScrolled() {
  useEffect(() => {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    const handler = () => nav.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);
  return null;
}
