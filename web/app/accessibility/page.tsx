import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accessibility Statement - Ephermal',
  description: 'Accessibility statement for the Ephermal platform: our WCAG 2.1 AA target, what we have done so far, and how to report a barrier.',
  alternates: {
    canonical: 'https://ephermal.app/accessibility',
  },
};

export default function AccessibilityPage() {
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

      <div className="legal-page" id="main-content">
        <div className="legal-label">Legal</div>
        <h1 className="legal-title">Accessibility Statement</h1>
        <div className="legal-date">Last updated: 16 August 2026</div>

        <div className="legal-highlight">
          Ephermal targets conformance with the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA,
          the standard most commonly used to measure web accessibility. This is an ongoing effort, not a
          claim of full compliance. We have reviewed, and continue to review, the site against these
          guidelines, and we welcome reports of anything that does not work well with assistive technology.
        </div>

        <div className="legal-section">
          <h2>1. Our Commitment</h2>
          <p>We want the Ephermal website and platform to be usable by as many people as possible, including people who use screen readers, keyboard-only navigation, voice control, or other assistive technology. We target conformance with WCAG 2.1 Level AA, the widely recognised benchmark for web accessibility.</p>
          <p>We are not claiming full, certified compliance with this standard. Accessibility is an ongoing effort for us, and this statement describes where that effort stands today.</p>
        </div>

        <div className="legal-section">
          <h2>2. What We Have Done So Far</h2>
          <p>Concretely, as of this statement:</p>
          <ul>
            <li><strong>Keyboard navigation</strong>: core interactive elements, including links, buttons, and forms, can be reached and operated using a keyboard alone, without requiring a mouse.</li>
            <li><strong>Alt text</strong>: content images carry descriptive alt text so screen readers can convey their meaning to users who cannot see them.</li>
            <li><strong>Colour contrast</strong>: text and background colour combinations across the site have been reviewed against WCAG contrast guidelines.</li>
            <li><strong>Semantic HTML</strong>: pages are built with semantic HTML, headings, landmarks, lists, and labelled form fields, so assistive technology can correctly interpret page structure.</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>3. Known Limitations</h2>
          <p>The review behind this statement is a basic, in-house review, not a full audit by an independent, professional accessibility auditor or testing lab. We have not yet tested every screen with every major screen reader, and we have not exhaustively verified every WCAG 2.1 AA success criterion across the platform.</p>
          <p>Some parts of the platform, particularly newer or more complex dashboard features, may not yet fully meet this standard. We treat every barrier that is reported to us as something to fix, not something to explain away.</p>
        </div>

        <div className="legal-section">
          <h2>4. Ongoing Effort</h2>
          <p>Accessibility is not a one-time project for us. As we add features and redesign parts of the site, we review the changes against WCAG 2.1 AA and correct issues we find. We intend to move toward a more thorough, professional accessibility audit as the platform matures, rather than relying solely on our own internal review.</p>
        </div>

        <div className="legal-section">
          <h2>5. Feedback &amp; Contact</h2>
          <p>If you run into an accessibility barrier anywhere on the Ephermal website or platform, or if something does not work the way it should with the assistive technology you use, please tell us. Email <a href="mailto:hello@ephermal.app">hello@ephermal.app</a> with a description of the page or feature involved and, where possible, the browser and assistive technology you were using.</p>
          <p>We will do our best to address genuine barriers and to respond to you directly.</p>
        </div>
      </div>

      <footer className="legal-footer">
        <div className="legal-footer-logo">
          <img src="/ephermal.jpg" alt="Ephermal logo" />
          Ephermal
        </div>
        <div className="legal-footer-links">
          <a href="../docs">Documentation</a>
          <a href="../privacy">Privacy Policy</a>
          <a href="../terms">Terms of Service</a>
          <a href="../accessibility">Accessibility Statement</a>
          <a href="mailto:hello@ephermal.app">Contact</a>
        </div>
        <div className="legal-footer-copy">© 2026 Interlink Platforms. All rights reserved.</div>
      </footer>
    </>
  );
}
