import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Data Deletion Instructions - Ephermal',
  description: 'How to request deletion of your Ephermal account and data, including data connected via Meta and Google.',
  alternates: {
    canonical: 'https://ephermal.app/data-deletion',
  },
};

export default function DataDeletionPage() {
  return (
    <>
      <nav className="legal-nav">
        <a href="/" className="legal-nav-logo">
          <img src="/ephermal.jpg" alt="Ephermal" />
          Ephermal
        </a>
        <a href="/" className="legal-back">← Back to site</a>
      </nav>

      <div className="legal-page">
        <div className="legal-label">Legal</div>
        <h1 className="legal-title">Data Deletion Instructions</h1>
        <div className="legal-date">Last updated: 26 July 2026</div>

        <div className="legal-highlight">
          You can permanently delete your Ephermal account and all associated data at any time, either directly
          in the app or by emailing us. This includes any data Ephermal received via your Meta Ads or Google Ads
          connections.
        </div>

        <div className="legal-section">
          <h2>1. Delete your account in-app (fastest)</h2>
          <ol>
            <li>Sign in to your Ephermal dashboard.</li>
            <li>Go to <strong>Settings</strong>.</li>
            <li>Under Account, click <strong>Delete Account</strong>.</li>
            <li>Type <strong>DELETE</strong> to confirm, then click <strong>Delete My Account</strong>.</li>
          </ol>
          <p>This immediately and permanently:</p>
          <ul>
            <li>Cancels any active subscription.</li>
            <li>Deletes your Meta Ads and Google Ads access tokens and disconnects those integrations.</li>
            <li>Deletes your Shopify store connection and synced store data.</li>
            <li>Deletes all campaigns, creatives, audiences, analytics, and billing linkage stored in our database.</li>
            <li>Deletes your account identity, so you cannot sign back in to a lingering account.</li>
          </ul>
        </div>

        <div className="legal-section">
          <h2>2. Request deletion by email</h2>
          <p>
            If you cannot access your account, email <a href="mailto:hello@ephermal.app">hello@ephermal.app</a> from
            the address associated with your account and ask us to delete your data. We will verify your identity
            and complete the deletion within 30 days, per our <a href="/privacy">Privacy Policy</a>.
          </p>
        </div>

        <div className="legal-section">
          <h2>3. Disconnecting Meta or Google without deleting your account</h2>
          <p>
            If you only want to revoke Ephermal&apos;s access to your Meta Ads or Google Ads account without deleting
            your whole Ephermal account, you can either:
          </p>
          <ul>
            <li>Use the Disconnect button next to that integration in Ephermal&apos;s Settings, which deletes the stored access token immediately, or</li>
            <li>Revoke access directly from the platform: <a href="https://www.facebook.com/settings?tab=business_tools" target="_blank" rel="noopener noreferrer">Meta Business Integrations settings</a> or <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Google Account third-party access</a>.</li>
          </ul>
          <p>Revoking access this way does not delete data Ephermal has already stored — use options 1 or 2 above for full deletion.</p>
        </div>

        <div className="legal-section">
          <h2>4. What we retain after deletion</h2>
          <p>
            We retain billing records for 7 years where required by law, and may retain minimal logs for fraud
            prevention and security for a limited period. See the <a href="/privacy">Privacy Policy</a> (Section 7,
            Data Retention) for the complete breakdown by data category.
          </p>
        </div>
      </div>
    </>
  );
}
