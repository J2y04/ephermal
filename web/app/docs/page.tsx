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
          <img src="/ephermal.jpg" alt="Ephermal logo" />
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
            <a className="docs-nav-link" href="#cogs">Cost of Goods (COGS)</a>
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
          <div className="docs-nav-group">
            <div className="docs-nav-label">Google Search Ads</div>
            <a className="docs-nav-link" href="#google-vs-meta">How it&apos;s different from Meta</a>
            <a className="docs-nav-link" href="#keywords">Keywords &amp; match types</a>
            <a className="docs-nav-link" href="#negative-keywords">Negative keywords</a>
            <a className="docs-nav-link" href="#ad-extensions">Ad extensions</a>
            <a className="docs-nav-link" href="#google-not-yet">What&apos;s not supported yet</a>
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
              <p>Here, MRR tracks your Shopify store&apos;s revenue over a rolling 30-day window, shown alongside your ad spend and estimated margin for the same period so you can see all three side by side. Margin only shows once you&apos;ve entered <a href="#cogs">Cost of Goods</a> for at least one product.</p>
            </div>
            <div className="docs-term" id="orders">
              <h3>Orders</h3>
              <p>The number of paid orders placed on your Shopify store in the selected time window.</p>
            </div>
            <div className="docs-term" id="cogs">
              <h3>COGS <code>Cost of Goods Sold</code></h3>
              <p>What it actually costs you to have one unit of a product ready to sell: manufacturing or wholesale price, plus freight and packaging per unit. It does not include ad spend, Shopify fees, or overhead like rent, those come out of margin separately.</p>
              <p>COGS auto-fills from Shopify&apos;s own &quot;Cost per item&quot; field when you&apos;ve set it there, or you can enter it directly on the Profit Tracker page. It&apos;s the input that makes margin tracking work at all: without it, Profit Tracker and MRR Tracker have no way to know what any of your revenue actually cost you.</p>
              <p>Margin shown across Ephermal is a <strong>catalog-average estimate</strong> (your entered costs, averaged across products, applied to revenue), not exact per-order accounting, since Shopify doesn&apos;t report which specific products made up a given order&apos;s revenue. Treat it as directionally useful, not penny-precise.</p>
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
              <p>The actual ad itself: the headline, copy, and (on Meta) image a shopper sees. Ephermal&apos;s AI generates ad copy and UGC-style scripts for you to review before anything goes live. Video ad generation is coming soon and not yet available.</p>
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

          {/* ── Google Search Ads ── */}
          <section className="docs-section" id="google-vs-meta">
            <h2>Google Search Ads</h2>
            <p className="docs-section-sub">A genuinely different kind of advertising from Meta &mdash; worth understanding before you launch your first one.</p>
            <div className="docs-step">
              <div className="docs-step-num">1</div>
              <div className="docs-step-body">
                <h3>Meta is asset-based. Google Search is intent-based.</h3>
                <p>On Meta, you upload an image or video and Meta shows it to people it thinks will like it, based on interests and behavior. There&apos;s no equivalent creative to upload for Google Search: instead, your ad is a few lines of text that appears when someone types a search that matches your chosen keywords. You&apos;re not interrupting a scroll, you&apos;re answering a search someone already typed. Same product, completely different mechanic and completely different ad format.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">2</div>
              <div className="docs-step-body">
                <h3>Ranking works differently too</h3>
                <p>A Meta ad&apos;s reach depends on your budget and the algorithm&apos;s read on relevance to an audience. A Google Search ad&apos;s position on the results page depends on your bid <em>and</em> Google&apos;s Quality Score, how well your keywords, ad copy, and landing page all match the searcher&apos;s intent. A well-matched, lower-bid ad can outrank a poorly-matched, higher-bid one.</p>
              </div>
            </div>
          </section>

          <section className="docs-section" id="keywords">
            <h2>Keywords &amp; match types</h2>
            <div className="docs-term">
              <h3>Keyword</h3>
              <p>A word or phrase you&apos;re telling Google to show your ad for, e.g. &quot;waterproof running shoes.&quot; Ephermal&apos;s AI generates these from your product catalog when it builds a campaign.</p>
            </div>
            <div className="docs-term">
              <h3>Match type</h3>
              <p>How closely a shopper&apos;s search has to match your keyword for your ad to show. Ephermal uses a deliberate mix, not one blanket setting:</p>
              <p><strong>Exact match</strong> &mdash; only very close variations of the keyword trigger your ad. Tightest control, used for your highest-intent, most specific terms.<br/>
              <strong>Phrase match</strong> &mdash; searches containing your keyword phrase (with extra words before or after) trigger your ad. Broader reach while staying relevant.<br/>
              <strong>Broad match</strong> &mdash; Google has the most latitude to match related searches. Used sparingly, only for genuine discovery terms, since it carries the most risk of showing your ad for an irrelevant search.</p>
            </div>
          </section>

          <section className="docs-section" id="negative-keywords">
            <h2>Negative keywords</h2>
            <div className="docs-term">
              <p>Terms you explicitly tell Google <em>not</em> to show your ad for, even if they&apos;d otherwise match. For example, if you sell full-price running shoes, you might exclude searches containing &quot;free&quot; or &quot;jobs&quot; or &quot;diy repair.&quot; Ephermal generates a negative keyword list automatically for every campaign it builds &mdash; without one, an account can burn real budget on clicks that were never going to buy anything.</p>
            </div>
          </section>

          <section className="docs-section" id="ad-extensions">
            <h2>Ad extensions</h2>
            <div className="docs-term">
              <p>Extra pieces of information Google can attach to your text ad to make it larger and more useful, at no extra cost. Ephermal generates three kinds for every campaign:</p>
            </div>
            <div className="docs-term">
              <h3>Sitelinks</h3>
              <p>Extra clickable links to specific pages on your store, e.g. Best Sellers, New Arrivals, Sale &mdash; letting a shopper jump straight to what they actually want instead of landing on your homepage.</p>
            </div>
            <div className="docs-term">
              <h3>Callouts</h3>
              <p>Short, non-clickable highlights like &quot;Free Shipping&quot; or &quot;30-Day Returns&quot; that add credibility and detail to the ad itself.</p>
            </div>
            <div className="docs-term">
              <h3>Structured snippets</h3>
              <p>A themed list under a fixed header (like Brands, Styles, or Types) showing specific things your store offers.</p>
            </div>
          </section>

          <section className="docs-section" id="google-not-yet">
            <h2>What&apos;s not supported yet</h2>
            <div className="docs-callout">
              Ephermal&apos;s Google integration currently builds <strong>Search</strong> campaigns only. Shopping, Performance Max, Display, and YouTube campaigns are not yet supported &mdash; if you&apos;ve used other tools that offer those, you won&apos;t find them here today. Search alone is genuinely useful (it&apos;s how your store shows up when a customer is actively searching for what you sell), but it&apos;s narrower than the full Google Ads product suite.
            </div>
          </section>
        </main>
      </div>

      <footer className="legal-footer">
        <div className="legal-footer-logo">
          <img src="/ephermal.jpg" alt="Ephermal logo" />
          Ephermal
        </div>
        <div className="legal-footer-links">
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
