import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - Ephermal',
  description: 'How Ephermal collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <>
      <nav className="legal-nav">
        <a href="/" className="legal-nav-logo">
          <img src="/ephermal.png" alt="Ephermal" />
          Ephermal
        </a>
        <a href="/" className="legal-back">← Back to site</a>
      </nav>

      <div className="legal-page">
        <div className="legal-label">Legal</div>
        <h1 className="legal-title">Privacy Policy</h1>
        <div className="legal-date">Last updated: 25 May 2026 &nbsp;·&nbsp; Effective: 25 May 2026</div>

        <div className="legal-highlight">
          This policy explains how Ephermal (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) collects, uses, and protects the personal
          data of merchants and visitors who use our platform. We are committed to full compliance with the
          General Data Protection Regulation (GDPR), UK GDPR, and the California Consumer Privacy Act /
          California Privacy Rights Act (CCPA/CPRA).
        </div>

        <div className="legal-section">
          <h2>1. Who We Are</h2>
          <p>Ephermal is an AI-powered advertising automation platform for Shopify merchants. Our service connects to your Shopify store, Meta Ads, and Google Ads accounts to autonomously generate creatives and manage campaigns on your behalf.</p>
          <p>Data controller: <strong>Ephermal</strong> &nbsp;·&nbsp; Contact: <a href="mailto:hello@ephermal.app">hello@ephermal.app</a><br /><em>Full company registration details will be published upon incorporation. For any data protection queries in the interim, contact us at the email above.</em></p>
        </div>

        <div className="legal-section">
          <h2>2. Data We Collect</h2>
          <p>We collect only what is necessary to operate the service:</p>
          <ul>
            <li><strong>Account data</strong>: name, email address, password (hashed with bcrypt), and optionally a Google account ID when using Google Sign-In.</li>
            <li><strong>Shopify store data</strong>: store domain, products, orders, and customer analytics accessed via the Shopify Admin API under your authorised OAuth permissions.</li>
            <li><strong>Ad account data</strong>: Meta Ads and Google Ads access tokens (encrypted at rest using AES-256 Fernet), ad account IDs, campaign performance metrics.</li>
            <li><strong>Billing data</strong>: payment is processed entirely by Stripe. We store only a Stripe customer ID and subscription status; we never see or store your card details.</li>
            <li><strong>Usage data</strong>: pages visited, features used, and session metadata for platform improvement.</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>3. Legal Basis for Processing (GDPR Art. 6)</h2>
          <p>Under the General Data Protection Regulation (GDPR) and UK GDPR, we rely on the following lawful bases for processing your personal data:</p>
          <ul>
            <li><strong>Performance of contract (Art. 6(1)(b))</strong>: Core service delivery: generating ad creatives, launching campaigns, managing integrations with Shopify/Meta/Google, sending transactional emails, and processing payments via Stripe.</li>
            <li><strong>Legal obligation (Art. 6(1)(c))</strong>: Retaining billing records for tax and accounting purposes as required by applicable law.</li>
            <li><strong>Legitimate interests (Art. 6(1)(f))</strong>: Analysing platform usage data to improve reliability and performance. You may object to this processing at any time by contacting us.</li>
            <li><strong>Consent (Art. 6(1)(a))</strong>: Where you choose to use Google Sign-In, we process your Google account ID on the basis of your consent. You may withdraw this consent at any time by contacting <a href="mailto:hello@ephermal.app">hello@ephermal.app</a>; withdrawal does not affect the lawfulness of prior processing.</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>4. How We Use Your Data</h2>
          <ul>
            <li>To deliver the core service: generating ad creatives, launching and optimising campaigns on your behalf.</li>
            <li>To manage your subscription and process payments via Stripe.</li>
            <li>To send transactional emails (account verification, billing receipts, campaign alerts). We do not send marketing emails without your explicit consent.</li>
            <li>To improve platform reliability and performance.</li>
          </ul>
          <p>We do not sell, rent, or share your personal data with third parties for their own marketing purposes. We do not share personal information for cross-context behavioural advertising.</p>
          <p>We do not use your store data, customer data, or advertising performance data to train, fine-tune, or improve any AI or machine learning model. Data is used solely to generate creatives and manage campaigns on your behalf as part of the Service.</p>
        </div>

        <div className="legal-section">
          <h2>5. Third-Party Services &amp; Sub-Processors</h2>
          <p>The following third-party processors handle data on our behalf under appropriate Data Processing Agreements, identifying their role, data received, and transfer safeguard:</p>
          <ul>
            <li><strong>Stripe, Inc.</strong> (US): payment processing; billing information. Safeguard: EU–US Data Privacy Framework (DPF). <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe Privacy Policy</a></li>
            <li><strong>Shopify Inc.</strong> (Canada): store data via OAuth; store domain, products, orders, customer analytics. Safeguard: EU adequacy decision for Canada. <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">Shopify Privacy Policy</a></li>
            <li><strong>Meta Platforms Ireland Ltd</strong> (EU entity): ad account management; ad account IDs and campaign data. Safeguard: Standard Contractual Clauses (SCCs) for onward transfers. <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer">Meta Privacy Policy</a></li>
            <li><strong>Google Ireland Ltd</strong> (EU entity): Google Ads management and optional Sign-In; ad account data and Google account ID. Safeguard: SCCs for onward transfers. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a></li>
            <li><strong>Clerk.com, Inc.</strong> (US): authentication and user account management; name, email, session data. Safeguard: Standard Contractual Clauses. <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer">Clerk Privacy Policy</a></li>
            <li><strong>Supabase, Inc.</strong> (US; EU-region data hosting): database infrastructure; all account and operational data. Safeguard: Standard Contractual Clauses. <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabase Privacy Policy</a></li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>6. International Data Transfers</h2>
          <p>Your personal data is stored on our EU-hosted infrastructure. Some sub-processors are incorporated outside the EEA; appropriate safeguards are in place for each as described in Section 5 (DPF adequacy, EU adequacy decisions, or Standard Contractual Clauses).</p>
          <p>For users in the United Kingdom, transfers to non-UK countries are governed by UK International Data Transfer Agreements (IDTAs) or EU SCCs with the ICO&apos;s UK Addendum, as applicable to each processor.</p>
          <p>EU–UK data flows rely on the European Commission&apos;s adequacy decision for the UK. We will update this policy promptly if that adequacy status changes.</p>
        </div>

        <div className="legal-section">
          <h2>7. Data Storage, Security &amp; Retention</h2>
          <p>All data is stored on EU-hosted infrastructure (Supabase EU region). OAuth tokens are encrypted at rest using AES-256 (Fernet). Passwords are hashed using bcrypt. All data in transit is protected by TLS 1.3.</p>
          <p>Retention periods by data category:</p>
          <ul>
            <li><strong>Account data</strong> (name, email, password hash): retained for the duration of your account; deleted within 30 days of account closure.</li>
            <li><strong>Shopify store data</strong> (products, orders, customer analytics): retained for the duration of your Shopify integration; deleted within 30 days of disconnection or account closure.</li>
            <li><strong>Ad account tokens &amp; campaign data</strong>: tokens deleted immediately on disconnection; campaign metrics retained for the duration of your account, deleted within 30 days of closure. Google Ads data is subject to Google&apos;s 37-month retention limit.</li>
            <li><strong>Usage data</strong> (session metadata, feature usage): retained on a rolling 12-month basis.</li>
            <li><strong>Billing data</strong> (Stripe customer ID, subscription status): retained for 7 years as required by applicable tax law.</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>8. Automated Processing &amp; Decision-Making</h2>
          <p>Ephermal uses automated processing, including analysis of your Shopify store data, product catalogue, and advertising performance metrics, to autonomously generate ad creatives and optimise campaign targeting. This constitutes automated decision-making within the meaning of GDPR Article 22.</p>
          <p>The logic analyses product attributes, historical performance, and audience signals to select creative formats, copy, and targeting parameters. The envisaged consequences are adjustments to how your advertising budget is deployed across Meta and Google.</p>
          <p>You retain the right to review and approve all AI-generated creatives before publication, reject any automated output, and request human review of any decision by contacting <a href="mailto:hello@ephermal.app">hello@ephermal.app</a>.</p>
        </div>

        <div className="legal-section">
          <h2>9. Your Rights (GDPR &amp; UK GDPR)</h2>
          <p>Under GDPR and UK GDPR, you have the right to:</p>
          <ul>
            <li><strong>Access</strong>: request a copy of the personal data we hold about you.</li>
            <li><strong>Rectification</strong>: correct inaccurate data.</li>
            <li><strong>Erasure (&quot;Right to be forgotten&quot;)</strong>: request deletion of your data.</li>
            <li><strong>Portability</strong>: receive your data in a machine-readable format.</li>
            <li><strong>Objection / Restriction</strong>: object to or restrict certain processing, including processing based on legitimate interests.</li>
            <li><strong>Withdraw consent</strong>: at any time where processing is based on consent (e.g. Google Sign-In), without affecting the lawfulness of prior processing.</li>
          </ul>
          <p>To exercise any of these rights, email <a href="mailto:hello@ephermal.app">hello@ephermal.app</a>. We will respond within one month (extendable by a further two months for complex requests, with notice within the first month).</p>
        </div>

        <div className="legal-section">
          <h2>10. Additional Rights for California Residents (CCPA/CPRA)</h2>
          <p>If you are a California resident, the CCPA and CPRA grant you the following additional rights:</p>
          <ul>
            <li><strong>Right to Know</strong>: request the categories and specific pieces of personal information collected, used, or disclosed about you in the preceding 12 months.</li>
            <li><strong>Right to Delete</strong>: request deletion of your personal information, subject to certain exceptions.</li>
            <li><strong>Right to Correct</strong>: request correction of inaccurate personal information.</li>
            <li><strong>Right to Opt-Out of Sale or Sharing</strong>: We do not sell personal information. We do not share personal information for cross-context behavioural advertising. No opt-out action is required, but you may contact us to confirm at any time.</li>
            <li><strong>Right to Limit Sensitive Personal Information</strong>: We do not process sensitive personal information beyond what is necessary to provide the Service.</li>
            <li><strong>Right to Non-Discrimination</strong>: We will not discriminate against you for exercising any CCPA/CPRA right.</li>
            <li><strong>Right to Use an Authorised Agent</strong>: You may designate an authorised agent to submit requests on your behalf.</li>
          </ul>
          <p>To submit a CCPA/CPRA request, email <a href="mailto:hello@ephermal.app">hello@ephermal.app</a>. We will respond within 45 days, with a possible 45-day extension for complex requests.</p>
        </div>

        <div className="legal-section">
          <h2>11. Cookies</h2>
          <p>We use only strictly necessary cookies for authentication (session tokens) and security. We do not use third-party tracking cookies or advertising pixels on our own website. You may disable cookies in your browser settings, though this will prevent you from remaining logged in.</p>
          <p>No cookie consent banner is shown because we rely solely on cookies that are strictly necessary for a service you have explicitly requested, which are exempt from consent requirements under the EU ePrivacy Directive and UK PECR.</p>
        </div>

        <div className="legal-section">
          <h2>12. AI-Generated Content &amp; EU AI Act</h2>
          <p>Ephermal uses artificial intelligence to generate advertising creatives on your behalf. In compliance with Article 50 of the EU AI Act (Regulation (EU) 2024/1689, applicable from 2 August 2026), AI-generated content will be marked with machine-readable provenance metadata, in line with technical standards adopted by the European Commission.</p>
          <p>As a merchant who approves and publishes AI-generated creatives, you also bear disclosure obligations as a &quot;deployer&quot; under the EU AI Act. We will provide guidance on meeting these obligations as the relevant standards are finalised.</p>
          <p>We do not use your data to train, fine-tune, or improve any third-party AI models. All AI processing is solely to generate creatives and manage campaigns on your behalf.</p>
        </div>

        <div className="legal-section">
          <h2>13. Changes to This Policy</h2>
          <p>We may update this policy periodically. We will notify you of material changes by email or via a notice within the platform at least 14 days before they take effect.</p>
        </div>

        <div className="legal-section">
          <h2>14. Contact &amp; Complaints</h2>
          <p>Questions about this policy: <a href="mailto:hello@ephermal.app">hello@ephermal.app</a></p>
          <p>If you believe we have not handled your data appropriately, you have the right to lodge a complaint:</p>
          <ul>
            <li><strong>EU data subjects:</strong> Contact our lead supervisory authority (to be confirmed upon company incorporation), or the DPA in your own EU member state of residence.</li>
            <li><strong>UK data subjects:</strong> Contact the Information Commissioner&apos;s Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.</li>
          </ul>
        </div>
      </div>

      <footer className="legal-footer">
        <div className="legal-footer-logo">
          <img src="/ephermal.png" alt="Ephermal" />
          Ephermal
        </div>
        <div className="legal-footer-links">
          <a href="../privacy">Privacy Policy</a>
          <a href="../terms">Terms of Service</a>
          <a href="mailto:hello@ephermal.app">Contact</a>
        </div>
        <div className="legal-footer-copy">© 2026 Ephermal. All rights reserved.</div>
      </footer>
    </>
  );
}
