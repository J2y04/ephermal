import type { Metadata } from 'next';
import ContactForm from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact Sales - Ephermal',
  description: 'Talk to the person who built Ephermal. Tell us what you sell and what you are trying to fix with your ads.',
  alternates: {
    canonical: 'https://ephermal.app/contact',
  },
};

export default function ContactPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <nav className="legal-nav">
        <a href="/" className="legal-nav-logo">
          <img src="/ephermal.jpg" alt="Ephermal logo" />
          Ephermal
        </a>
        <a href="/" className="legal-back">← Back to site</a>
      </nav>

      <main className="contact-page" id="main-content">
        <div className="contact-label">Contact</div>
        <h1 className="contact-title">Let&apos;s get in touch.</h1>
        <p className="contact-sub">
          Tell us what you sell and what is not working in your ads. You will get a straight answer
          about whether Ephermal is the right fit, including when it is not.
        </p>

        <ContactForm />
      </main>
    </>
  );
}
