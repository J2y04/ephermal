import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Ephermal',
  description: 'Terms and conditions for using the Ephermal platform.',
};

export default function TermsPage() {
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
        <h1 className="legal-title">Terms of Service</h1>
        <div className="legal-date">Last updated: 25 May 2026 &nbsp;·&nbsp; Effective: 25 May 2026</div>

        <div className="legal-highlight">
          By creating an account or using any part of the Ephermal platform, you agree to be bound by these
          Terms of Service. Please read them carefully. If you do not agree, do not use the service.
          These Terms constitute a B2B agreement between you (the merchant) and Ephermal; EU consumer protection law does not apply.
        </div>

        <div className="legal-section">
          <h2>1. The Service</h2>
          <p>Ephermal provides an AI-powered advertising automation platform that connects to your Shopify store, Meta Ads account, and Google Ads account to generate creative assets and manage paid advertising campaigns on your behalf (&quot;the Service&quot;).</p>
          <p>We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time, with reasonable notice where practicable. Ephermal is not affiliated with or endorsed by Shopify Inc., Meta Platforms, Inc., or Google LLC, each of which is solely responsible for their own services.</p>
        </div>

        <div className="legal-section">
          <h2>2. Eligibility &amp; Account</h2>
          <ul>
            <li>You must be at least 18 years of age and have the legal authority to enter into a binding contract on behalf of a business.</li>
            <li>You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.</li>
            <li>You must notify us immediately at <a href="mailto:hello@ephermal.app">hello@ephermal.app</a> if you suspect unauthorised access to your account.</li>
            <li>One account per merchant unless a multi-store plan is purchased.</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>3. Subscriptions &amp; Billing</h2>
          <p>Ephermal operates on a monthly subscription model billed in advance. Prices are displayed on our pricing page in USD and are subject to change with 30 days&apos; notice. For EU/EEA merchants, currency conversion rates may affect the local-currency equivalent cost.</p>
          <ul>
            <li><strong>No free trial</strong> — all plans require payment upfront. Subscriptions begin immediately upon checkout completion.</li>
            <li><strong>Renewals</strong> — subscriptions renew automatically each billing period. You may cancel at any time; cancellation takes effect at the end of the current billing period with no pro-rata refund.</li>
            <li><strong>UGC credit packs</strong> — supplementary credit packs are a one-time purchase and are non-refundable once any credits have been consumed.</li>
            <li><strong>Refunds</strong> — subscription payments are non-refundable except where required by applicable law.</li>
          </ul>
          <p>All payments are processed by Stripe. By providing payment information, you also agree to <a href="https://stripe.com/legal/ssa" target="_blank" rel="noopener noreferrer">Stripe&apos;s terms</a>.</p>
          <p>From February 2027, in accordance with Meta Developer Policy Section 10.6a, you have the right to request a statement of the exact amount spent on Meta ads on your behalf through our platform, separate from Ephermal subscription fees. Contact <a href="mailto:hello@ephermal.app">hello@ephermal.app</a> to request this at any time.</p>
        </div>

        <div className="legal-section">
          <h2>4. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Advertise products that are illegal, counterfeit, or violate the policies of Meta, Google, or Shopify.</li>
            <li>Generate or distribute misleading, defamatory, or fraudulent advertising content.</li>
            <li>Circumvent, disable, or interfere with any security or rate-limiting features of the platform.</li>
            <li>Attempt to reverse-engineer, decompile, or extract proprietary source code or AI models.</li>
            <li>Use the Service in any way that violates applicable laws, including data protection legislation.</li>
            <li>Generate content that constitutes prohibited AI practices under Article 5 of the EU AI Act (e.g. subliminal manipulation or exploitation of vulnerabilities).</li>
          </ul>
          <p>We reserve the right to suspend or terminate accounts that violate these terms without refund.</p>
        </div>

        <div className="legal-section">
          <h2>5. Your Content &amp; Permissions</h2>
          <p>You retain full ownership of your store data, product content, and any creatives generated using your brand assets. By using the Service, you grant Ephermal a limited, non-exclusive licence to access, process, and use your content solely to deliver the Service to you.</p>
          <p>This licence explicitly excludes any use of your store data, customer data, or advertising content to train, fine-tune, or improve any AI or machine learning model, large language model, or other AI system, except with your prior written consent.</p>
          <p>You represent and warrant that you have the legal right to advertise all products promoted through our platform, that doing so does not infringe any third-party intellectual property rights, and that you have obtained all necessary consents from your customers for any personal data processed by Ephermal on your behalf.</p>
        </div>

        <div className="legal-section">
          <h2>6. Data Processing (GDPR Article 28)</h2>
          <p>Where Ephermal processes personal data on your behalf as a data processor (including Shopify customer data and advertising performance data), the following terms apply in accordance with GDPR Article 28:</p>
          <ul>
            <li>Ephermal will process personal data only on your documented instructions and for no other purpose.</li>
            <li>All personnel with access to personal data are bound by confidentiality obligations.</li>
            <li>Ephermal implements appropriate technical and organisational security measures under GDPR Article 32, including AES-256 encryption of OAuth tokens and bcrypt hashing of passwords.</li>
            <li>By accepting these Terms, you provide general consent to the sub-processors listed in our Privacy Policy. We will notify you of any changes with at least 30 days&apos; notice.</li>
            <li>Ephermal will assist you in responding to data subject rights requests and in meeting GDPR obligations under Articles 32–36.</li>
            <li>Upon termination, all personal data processed on your behalf will be deleted within 30 days, unless retention is required by applicable law.</li>
            <li>Ephermal will make available information necessary to demonstrate compliance with this clause and will support audits with reasonable prior notice.</li>
          </ul>
          <p>Merchants requiring a standalone Data Processing Agreement (DPA) for enterprise procurement may contact <a href="mailto:hello@ephermal.app">hello@ephermal.app</a>.</p>
        </div>

        <div className="legal-section">
          <h2>7. Ad Platform Compliance</h2>
          <p>You are solely responsible for ensuring that campaigns launched via Ephermal comply with the advertising policies of Meta (Facebook/Instagram) and Google. Ephermal is not liable for ad account suspensions, policy violations, or rejected creatives resulting from the content of your products or your account&apos;s prior history with these platforms. Meta and Google may unilaterally change their policies at any time; Ephermal is not responsible for the impact of such changes on approved campaigns or campaign performance data accuracy.</p>
        </div>

        <div className="legal-section">
          <h2>8. AI-Generated Content</h2>
          <p>Creatives produced by our AI are provided for your review and approval before launch. You retain the right to reject any creative. By approving a creative for launch, you accept responsibility for its content and compliance with applicable advertising standards.</p>
          <p>We do not guarantee specific performance outcomes (ROAS, conversions, or impressions) from any campaign. Past performance metrics shown on our website are illustrative examples and not a guarantee of future results.</p>
        </div>

        <div className="legal-section">
          <h2>9. EU AI Act &amp; AI Content Labelling</h2>
          <p>From 2 August 2026, Article 50 of the EU AI Act (Regulation (EU) 2024/1689) requires machine-readable labelling of AI-generated content. Ephermal will implement compliant labelling mechanisms ahead of this deadline.</p>
          <p>As a merchant who approves and publishes AI-generated creatives, you are also a &quot;deployer&quot; under the EU AI Act and bear independent obligations to ensure AI-generated advertising content is appropriately disclosed to end consumers in your jurisdiction. You are responsible for monitoring and complying with applicable AI transparency requirements in your territory, including any FTC disclosure obligations if you sell to US consumers.</p>
          <p>Ephermal&apos;s AI systems are not classified as &quot;high-risk&quot; under Annex III of the EU AI Act. We maintain internal AI governance documentation as required by EU AI Act Article 4 (in force since 2 February 2025).</p>
        </div>

        <div className="legal-section">
          <h2>10. Intellectual Property</h2>
          <p>The Ephermal platform, including its software, design, AI models, and branding, is the exclusive intellectual property of Ephermal. Nothing in these Terms grants you any ownership of or licence to our proprietary technology beyond what is necessary to use the Service.</p>
        </div>

        <div className="legal-section">
          <h2>11. Limitation of Liability</h2>
          <p>To the maximum extent permitted by applicable law, Ephermal&apos;s total liability to you for any claims arising from use of the Service shall not exceed the amount you paid us in the twelve (12) months preceding the claim.</p>
          <p>We are not liable for indirect, incidental, consequential, or punitive damages, including loss of profits, loss of data, or business interruption.</p>
          <p>The limitations in this section do not apply to: (a) liability arising from gross negligence or wilful misconduct by Ephermal; (b) death or personal injury caused by Ephermal&apos;s negligence; (c) fraud or fraudulent misrepresentation; or (d) any liability that cannot be excluded or limited under applicable law, including GDPR Article 82.</p>
        </div>

        <div className="legal-section">
          <h2>12. Indemnification</h2>
          <p>You agree to indemnify and hold harmless Ephermal and its officers, employees, and contractors from any claims, damages, or expenses (including legal fees) arising from your use of the Service, your content, or your breach of these Terms. This obligation does not apply to the extent a claim results from Ephermal&apos;s gross negligence or wilful misconduct.</p>
        </div>

        <div className="legal-section">
          <h2>13. Force Majeure</h2>
          <p>Neither party shall be liable for any failure or delay in performance caused by circumstances beyond their reasonable control, including outages or policy changes imposed by Meta, Google, or Shopify; acts of God; governmental actions; cyberattacks; or disruptions to internet infrastructure. The affected party will notify the other as soon as reasonably practicable. If the force majeure event continues for more than 30 consecutive days, either party may terminate the agreement without penalty.</p>
        </div>

        <div className="legal-section">
          <h2>14. Data Portability &amp; Switching (EU Data Act)</h2>
          <p>In accordance with the EU Data Act (Regulation (EU) 2023/2854, in force since 12 September 2025), you have the right to switch to an alternative service or port your data:</p>
          <ul>
            <li>You may initiate data porting or switching at any time by contacting <a href="mailto:hello@ephermal.app">hello@ephermal.app</a>. We will complete the transition within 30 days of the end of any applicable notice period.</li>
            <li>Upon request, we will provide your data (account information, campaign history, creative assets) in a machine-readable format.</li>
            <li>We will not impose obstacles or excessive fees that would prevent or deter switching. Any switching fees will be disclosed in advance and will phase to zero by September 2027 in accordance with EU Data Act transition rules.</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>15. Termination</h2>
          <p>Either party may terminate the agreement at any time. We may suspend or terminate your account immediately if you breach these Terms or if continued service poses legal or security risk. Upon termination, your access to the platform ceases and your data will be deleted within 30 days in accordance with our Privacy Policy.</p>
        </div>

        <div className="legal-section">
          <h2>16. Governing Law</h2>
          <p>These Terms are governed by the laws of the jurisdiction in which Ephermal is incorporated (details to be confirmed upon company registration). The courts of that jurisdiction shall have exclusive jurisdiction over disputes arising from these Terms. Disputes will first be attempted to be resolved amicably over a period of 30 days before either party may commence proceedings.</p>
        </div>

        <div className="legal-section">
          <h2>17. Changes to These Terms</h2>
          <p>We may update these Terms from time to time. We will provide at least 14 days&apos; notice of material changes via email or in-platform notification. If you object to a material change, you may terminate your account without penalty before the change takes effect. Continued use of the Service after that notice period constitutes acceptance of the revised Terms.</p>
        </div>

        <div className="legal-section">
          <h2>18. Contact</h2>
          <p>Questions or legal notices: <a href="mailto:hello@ephermal.app">hello@ephermal.app</a></p>
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
