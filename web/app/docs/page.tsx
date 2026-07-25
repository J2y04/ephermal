import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation - Ephermal',
  description: 'Plain-English guide to every term in your Ephermal dashboard, and how to get the most out of the platform.',
  alternates: {
    canonical: 'https://ephermal.app/docs',
  },
};

export default function DocsPage() {
  return (
    <>
      <nav className="legal-nav">
        <a href="/" className="legal-nav-logo">
          <img src="/ephermal.jpg" alt="Ephermal" />
          Ephermal
        </a>
        <a href="/" className="legal-back">← Back to site</a>
      </nav>

      <div className="docs-shell">
        <aside className="docs-sidebar">
          <div className="docs-nav-group">
            <div className="docs-nav-label">Getting Started</div>
            <a className="docs-nav-link" href="#connect-shopify">Connect your Shopify store</a>
            <a className="docs-nav-link" href="#connect-ads">Connect Meta &amp; Google Ads</a>
            <a className="docs-nav-link" href="#first-campaign">Launch your first campaign</a>
            <a className="docs-nav-link" href="#reading-dashboard">Reading your dashboard</a>
            <a className="docs-nav-link" href="#metric-looks-bad">If a metric looks bad</a>
          </div>
          <div className="docs-nav-group">
            <div className="docs-nav-label">Performance Terms</div>
            <a className="docs-nav-link" href="#roas">ROAS</a>
            <a className="docs-nav-link" href="#blended-roas">Blended ROAS</a>
            <a className="docs-nav-link" href="#ctr">CTR</a>
            <a className="docs-nav-link" href="#impressions">Impressions</a>
            <a className="docs-nav-link" href="#clicks">Clicks</a>
            <a className="docs-nav-link" href="#conversions">Conversions</a>
            <a className="docs-nav-link" href="#creative-fatigue">Creative fatigue</a>
          </div>
          <div className="docs-nav-group">
            <div className="docs-nav-label">Money &amp; Revenue</div>
            <a className="docs-nav-link" href="#spend">Ad spend</a>
            <a className="docs-nav-link" href="#mrr">MRR</a>
            <a className="docs-nav-link" href="#orders">Orders</a>
          </div>
          <div className="docs-nav-group">
            <div className="docs-nav-label">Campaigns &amp; Creative</div>
            <a className="docs-nav-link" href="#campaign">Campaign</a>
            <a className="docs-nav-link" href="#creative">Creative</a>
            <a className="docs-nav-link" href="#campaign-status">Live / Paused / Draft</a>
          </div>
          <div className="docs-nav-group">
            <div className="docs-nav-label">Audience &amp; Targeting</div>
            <a className="docs-nav-link" href="#audience">Custom audience</a>
            <a className="docs-nav-link" href="#lookalike">Lookalike audience</a>
            <a className="docs-nav-link" href="#pixel">Meta Pixel</a>
          </div>
        </aside>

        <main className="docs-content">
          <div className="docs-label">Documentation</div>
          <h1 className="docs-title">Using Ephermal</h1>
          <p className="docs-intro">
            Everything you need to run your store&apos;s advertising without a marketing background: a plain-English
            walkthrough of the setup, and a glossary for every term you&apos;ll see on your dashboard.
          </p>

          {/* ── Getting Started ── */}
          <section className="docs-section" id="connect-shopify">
            <h2>1. Connect your Shopify store</h2>
            <p className="docs-section-sub">The first step of account setup.</p>
            <div className="docs-step">
              <div className="docs-step-num">1</div>
              <div className="docs-step-body">
                <h3>Enter your store URL</h3>
                <p>During setup, enter your <code>.myshopify.com</code> address (or just the subdomain) and click <strong>Connect with Shopify</strong>. You&apos;ll be redirected to Shopify to approve the connection. Ephermal never sees your Shopify password.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">2</div>
              <div className="docs-step-body">
                <h3>What gets synced</h3>
                <p>Once connected, Ephermal automatically pulls your products, orders and revenue so the AI can write ad copy, pick what to advertise, and measure how ad spend translates into real sales.</p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="connect-ads">
            <h2>2. Connect Meta Ads &amp; Google Ads</h2>
            <p className="docs-section-sub">The second and third steps of account setup.</p>
            <div className="docs-step">
              <div className="docs-step-num">1</div>
              <div className="docs-step-body">
                <h3>Meta Ads (all plans)</h3>
                <p>Click <strong>Connect Meta Ads</strong> and log in with Facebook to link your Meta Business ad account. No API keys or developer setup required.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">2</div>
              <div className="docs-step-body">
                <h3>Google Ads (Growth &amp; Scale plans)</h3>
                <p>Connect your Google Ads account the same way, from Settings → Integrations if you skipped it during setup. You can run Meta-only, Google-only, or both at once.</p>
              </div>
            </div>
            <div className="docs-callout">
              <strong>You can skip either step</strong> and connect later. Ephermal will show a reminder banner on your dashboard until at least one ad platform is linked.
            </div>
          </section>

          <section className="docs-section" id="first-campaign">
            <h2>3. Launch your first campaign</h2>
            <p className="docs-section-sub">From the <strong>Launch Ads</strong> page in the sidebar.</p>
            <div className="docs-step">
              <div className="docs-step-num">1</div>
              <div className="docs-step-body">
                <h3>Click + New Campaign</h3>
                <p>Ephermal&apos;s AI writes the ad copy, generates creative, and picks a starting audience for you based on your store and products, no ad manager experience needed.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">2</div>
              <div className="docs-step-body">
                <h3>Review before it goes live</h3>
                <p>Every AI-generated creative lands on the <strong>Creatives</strong> page for your review and approval first. Nothing is published to Meta or Google without your sign-off.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">3</div>
              <div className="docs-step-body">
                <h3>Turn it on</h3>
                <p>Once approved, use the On/Off toggle on the Launch Ads or Dashboard campaign table to start or pause spend at any time.</p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="reading-dashboard">
            <h2>4. Reading your dashboard</h2>
            <p className="docs-section-sub">The Dashboard page is your home screen: four numbers matter most.</p>
            <div className="docs-step">
              <div className="docs-step-num">1</div>
              <div className="docs-step-body">
                <h3>The four stat cards</h3>
                <p><strong>Average ROAS</strong>, <strong>Total Ad Spend</strong>, <strong>UGC Ads Created</strong> and <strong>Total Conversions</strong>, a 30-second snapshot of whether ads are making you money. See the glossary below for exactly what each one means.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">2</div>
              <div className="docs-step-body">
                <h3>Campaigns table</h3>
                <p>Every live and paused campaign with its ROAS, spend, CTR and status at a glance. Click any row to see full detail.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">3</div>
              <div className="docs-step-body">
                <h3>Deeper views</h3>
                <p>For trends over time, open <strong>Analytics</strong>. For revenue vs. spend combined, open <strong>MRR Tracker</strong>. For AI-recommended budget changes, open <strong>Budget AI</strong>.</p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="metric-looks-bad">
            <h2>5. What to do if a metric looks bad</h2>
            <p className="docs-section-sub">Common situations and where to go.</p>
            <div className="docs-step">
              <div className="docs-step-num">1</div>
              <div className="docs-step-body">
                <h3>ROAS is dropping</h3>
                <p>Open <strong>Launch Ads → Live Performance</strong> and click <strong>Optimize ROAS</strong> to have the AI re-balance budget toward your best-performing campaigns. Also check <strong>Creatives → Creative Fatigue Radar</strong>: a tired ad is a common cause.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">2</div>
              <div className="docs-step-body">
                <h3>CTR is low</h3>
                <p>Low CTR usually means the creative or audience isn&apos;t resonating. Generate a fresh creative from the Dashboard, or build a new audience on <strong>Audience Intel</strong>.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">3</div>
              <div className="docs-step-body">
                <h3>Not sure why? Ask Auren</h3>
                <p>Auren, Ephermal&apos;s built-in AI, has live context on your ROAS, creatives and audiences. Open it from the sidebar and ask directly, e.g. &quot;why is my CTR low?&quot;</p>
              </div>
            </div>
          </section>

          {/* ── Glossary ── */}
          <section className="docs-section" id="roas">
            <h2>Performance terms</h2>
            <div className="docs-term">
              <h3>ROAS <code>Return on Ad Spend</code></h3>
              <p>For every $1 you spend on ads, how many $ you get back in sales. A ROAS of <strong>3.0</strong> means $1 of ad spend generated $3 of revenue. Higher is better.</p>
            </div>
            <div className="docs-term" id="blended-roas">
              <h3>Blended ROAS <code>Combined</code></h3>
              <p>The same ROAS calculation, but combining <em>all</em> your ad spend (Meta + Google) against your total store revenue, rather than looking at one platform or one campaign alone. It&apos;s the truest picture of whether advertising overall is profitable.</p>
            </div>
            <div className="docs-term" id="ctr">
              <h3>CTR <code>Click-Through Rate</code></h3>
              <p>The percentage of people who saw your ad and actually clicked it. A higher CTR means your ad creative and targeting are catching attention.</p>
            </div>
            <div className="docs-term" id="impressions">
              <h3>Impressions</h3>
              <p>The number of times your ad was shown on screen, whether or not anyone clicked it. This measures reach, not engagement.</p>
            </div>
            <div className="docs-term" id="clicks">
              <h3>Clicks</h3>
              <p>The number of times someone tapped or clicked your ad to visit your store.</p>
            </div>
            <div className="docs-term" id="conversions">
              <h3>Conversions</h3>
              <p>The number of times a click actually turned into a result you care about, usually a completed purchase on your store.</p>
            </div>
            <div className="docs-term" id="creative-fatigue">
              <h3>Creative fatigue</h3>
              <p>What happens when an ad has been shown to the same people too many times: performance (CTR, ROAS) starts declining even though nothing about your store changed. The Creative Fatigue Radar on the Creatives page flags this automatically so you know when to refresh an ad.</p>
            </div>
          </section>

          <section className="docs-section" id="spend">
            <h2>Money &amp; revenue terms</h2>
            <div className="docs-term">
              <h3>Ad spend</h3>
              <p>The total amount of money paid to Meta and/or Google to run your ads, before accounting for any revenue those ads generated.</p>
            </div>
            <div className="docs-term" id="mrr">
              <h3>MRR <code>Monthly Recurring Revenue</code></h3>
              <p>Here, MRR tracks your Shopify store&apos;s revenue over a rolling 30-day window, shown alongside your ad spend for the same period so you can see the two side by side.</p>
            </div>
            <div className="docs-term" id="orders">
              <h3>Orders</h3>
              <p>The number of paid orders placed on your Shopify store in the selected time window.</p>
            </div>
          </section>

          <section className="docs-section" id="campaign">
            <h2>Campaigns &amp; creative terms</h2>
            <div className="docs-term">
              <h3>Campaign</h3>
              <p>A single advertising effort with its own budget, audience and creative, for example, "Summer Sale" or "Best Sellers Retarget". Campaigns live on Meta and/or Google but you manage them entirely from Ephermal.</p>
            </div>
            <div className="docs-term" id="creative">
              <h3>Creative</h3>
              <p>The actual ad itself: the video, image, headline and copy a shopper sees. Ephermal&apos;s AI generates creatives (including UGC-style video ads) for you to review before they go live.</p>
            </div>
            <div className="docs-term" id="campaign-status">
              <h3>Live / Paused / Draft / Failed</h3>
              <p><strong>Live</strong> means the campaign is actively spending and showing ads right now. <strong>Paused</strong> means it exists but isn&apos;t currently spending, you can resume it any time. <strong>Draft</strong> means it hasn&apos;t been launched yet. <strong>Failed</strong> means the ad platform rejected it, usually a policy issue worth reviewing before relaunching.</p>
            </div>
          </section>

          <section className="docs-section" id="audience">
            <h2>Audience &amp; targeting terms</h2>
            <div className="docs-term">
              <h3>Custom audience</h3>
              <p>A specific group of people you build to target with ads, for example, past customers or people who visited your site but didn&apos;t buy. Built on the Audience Intel page.</p>
            </div>
            <div className="docs-term" id="lookalike">
              <h3>Lookalike audience</h3>
              <p>A new audience Meta builds automatically by finding people who resemble an existing custom audience (e.g. your best customers), so you can find more shoppers likely to convert. A "0.02" similarity ratio means the top 2% most similar people to your source audience: smaller ratios are more precise but reach fewer people.</p>
            </div>
            <div className="docs-term" id="pixel">
              <h3>Meta Pixel</h3>
              <p>A small snippet of tracking code installed on your store that tells Meta when someone views a product, adds to cart, or completes a purchase after clicking your ad. It&apos;s what makes accurate ROAS reporting and audience building possible. Check its status on the Audience Intel page.</p>
            </div>
          </section>
        </main>
      </div>

      <footer className="legal-footer">
        <div className="legal-footer-logo">
          <img src="/ephermal.jpg" alt="Ephermal" />
          Ephermal
        </div>
        <div className="legal-footer-links">
          <a href="../privacy">Privacy Policy</a>
          <a href="../terms">Terms of Service</a>
          <a href="mailto:hello@ephermal.app">Contact</a>
        </div>
        <div className="legal-footer-copy">© 2026 Interlink Platforms. All rights reserved.</div>
      </footer>
    </>
  );
}
