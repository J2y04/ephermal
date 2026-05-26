'use client';
import { useEffect } from 'react';

export default function ScrollReveal() {
  useEffect(() => {
    // ── Reveal observer ──────────────────────────────────────────────────────
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: '0px 0px -64px 0px' }
    );

    document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));

    // Auto-stagger children of [data-stagger] parents
    document.querySelectorAll('[data-stagger]').forEach(parent => {
      Array.from(parent.children).forEach((child, i) => {
        const el = child as HTMLElement;
        if (!el.hasAttribute('data-reveal')) {
          el.setAttribute('data-reveal', '');
          el.setAttribute('data-delay', String(i + 1));
          io.observe(el);
        }
      });
    });

    // ── Split-text reveal — Linear-style word mask ────────────────────────────
    const splitObs = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            splitObs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('[data-split]').forEach(el => splitObs.observe(el));

    // ── Animated counters ────────────────────────────────────────────────────
    const counterObs = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          const target = parseFloat(el.getAttribute('data-count') || '0');
          const suffix = el.getAttribute('data-count-suffix') || '';
          const prefix = el.getAttribute('data-count-prefix') || '';
          const decimals = target % 1 !== 0 ? 1 : 0;
          const duration = 1600;
          const start = performance.now();
          const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            el.textContent = prefix + (target * easeOut(p)).toFixed(decimals) + suffix;
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          counterObs.unobserve(el);
        });
      },
      { threshold: 0.3 }
    );
    document.querySelectorAll('[data-count]').forEach(el => counterObs.observe(el));

    // ── Card spotlight — Vercel-style mouse-tracking glow ─────────────────────
    const spotlightClean: (() => void)[] = [];
    document.querySelectorAll<HTMLElement>('[data-spotlight]').forEach(el => {
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      };
      const onLeave = () => {
        el.style.setProperty('--mx', '-999px');
        el.style.setProperty('--my', '-999px');
      };
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
      spotlightClean.push(() => {
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseleave', onLeave);
      });
    });

    // ── Hero card perspective tilt ────────────────────────────────────────────
    const heroVisual = document.querySelector<HTMLElement>('.hero-visual');
    const heroCard = document.querySelector<HTMLElement>('.hero-card');
    let tiltClean = () => {};
    if (heroVisual && heroCard) {
      const onMove = (e: MouseEvent) => {
        const r = heroCard.getBoundingClientRect();
        const x = ((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 6;
        const y = ((e.clientY - r.top - r.height / 2) / (r.height / 2)) * 4;
        heroCard.style.transform = `rotateX(${-y}deg) rotateY(${x}deg)`;
      };
      const onLeave = () => {
        heroCard.style.transform = 'rotateX(0deg) rotateY(0deg)';
      };
      heroVisual.addEventListener('mousemove', onMove);
      heroVisual.addEventListener('mouseleave', onLeave);
      tiltClean = () => {
        heroVisual.removeEventListener('mousemove', onMove);
        heroVisual.removeEventListener('mouseleave', onLeave);
      };
    }

    // ── Parallax on scroll ───────────────────────────────────────────────────
    const parallaxEls = document.querySelectorAll<HTMLElement>('[data-parallax]');
    const onScroll = () => {
      const sy = window.scrollY;
      parallaxEls.forEach(el => {
        const speed = parseFloat(el.getAttribute('data-parallax') || '0.15');
        el.style.transform = `translateY(${sy * speed}px)`;
      });
    };
    if (parallaxEls.length) window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      io.disconnect();
      splitObs.disconnect();
      counterObs.disconnect();
      spotlightClean.forEach(fn => fn());
      tiltClean();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return null;
}
