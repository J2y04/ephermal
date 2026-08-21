'use client';

import { useState } from 'react';

const ENDPOINT = 'https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/contact-sales';

export default function ContactForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  // Honeypot. Hidden from people and from screen readers, so anything that
  // fills it in is automation.
  const [website, setWebsite] = useState('');

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Checked here so the common mistakes never cost a round trip, but the
    // same rules are enforced server-side, which is what actually counts.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('That email address does not look right.');
      return;
    }
    if (message.trim().length < 10) {
      setError('Tell us a little more so we can actually be useful.');
      return;
    }

    setSending(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name, company, message, website }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'That did not send. Email hello@ephermal.app directly and we will pick it up.');
        return;
      }
      setSent(true);
    } catch {
      setError('That did not send. Email hello@ephermal.app directly and we will pick it up.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="contact-done" role="status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <h2>Got it.</h2>
        <p>We read every one of these. Expect a reply from a person, usually within a day.</p>
        <a href="/" className="btn-secondary">Back to the site</a>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={submit} noValidate>
      <div className="contact-row">
        <label className="contact-field">
          <span>Your email</span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@yourstore.com"
            autoComplete="email"
            required
          />
        </label>
        <label className="contact-field">
          <span>Name <em>optional</em></span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="How should we address you?"
            autoComplete="name"
          />
        </label>
      </div>

      <label className="contact-field">
        <span>Store or company <em>optional</em></span>
        <input
          type="text"
          value={company}
          onChange={e => setCompany(e.target.value)}
          placeholder="yourstore.com"
          autoComplete="organization"
        />
      </label>

      <label className="contact-field">
        <span>What should we know?</span>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={5}
          placeholder="What you sell, roughly what you spend on ads, and what you are trying to fix."
          required
        />
      </label>

      {/* Honeypot: off-screen rather than display:none, because some bots skip
          hidden inputs but not positioned ones. */}
      <div aria-hidden="true" className="contact-hp">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={e => setWebsite(e.target.value)}
        />
      </div>

      {error && <div className="contact-error" role="alert">{error}</div>}

      <button type="submit" className="btn-primary contact-submit" disabled={sending}>
        {sending ? 'Sending…' : 'Contact sales'}
      </button>

      <p className="contact-note">
        Goes straight to Jamal, the founder. No sequence, no CRM, no follow-up drip.
      </p>
    </form>
  );
}
