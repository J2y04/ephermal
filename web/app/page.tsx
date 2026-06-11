import FAQ from '../components/FAQ';
import ScrollReveal from '../components/ScrollReveal';
import NavScrolled from '../components/NavScrolled';
import NavAuth from '../components/NavAuth';
import AgentNetwork from '../components/AgentNetwork';
import HeroMotion from '../components/HeroMotion';
import StatsMotion from '../components/StatsMotion';
import ShopifyReveal from '../components/ShopifyReveal';

export default function Home() {
  return (
    <>
      <ScrollReveal />
      <NavScrolled />

      {/* ── Navigation ── */}
      <nav className="nav" id="main-nav">
        <a href="/" className="nav-logo">
          <img src="/ephermal.png" alt="Ephermal logo" />
          Ephermal
        </a>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#services">Features</a>
          <a href="/advertising.html" style={{ color: 'var(--accent)', fontWeight: 600 }}>Budget AI</a>
          <a href="#pricing">Pricing</a>
          <a href="#about">Results</a>
        </div>
        <div className="nav-actions">
          <NavAuth />
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <HeroMotion
          line1={['You', 'Build', 'It.']}
          line2={['We', 'Scale', 'It.']}
          sub={<>Stop paying $3,000/month for an agency that doesn&apos;t understand your store. Ephermal reads your Shopify catalog, writes AI-powered ads, and launches across Meta and Google, set up in minutes, not months.</>}
          cta={<><a href="/auth/register.html" className="btn-primary">Get Started</a><a href="#how-it-works" className="btn-secondary">See how it works</a></>}
        />
        <p className="hero-proof" data-reveal data-delay="3">
          <span>Meta &amp; Google Ads automated</span>
          <span className="dot" />
          <span>Setup in 3 minutes</span>
          <span className="dot" />
          <span>No agency needed</span>
        </p>

        {/* Hero visual */}
        <div className="hero-visual" data-reveal="scale" data-delay="3">
          <div className="hero-card">
            <div className="dashboard-row">
              <div className="dash-stat">
                <div className="label">ROAS</div>
                <div className="value">4.8×</div>
                <div className="change">↑ 127% vs last month</div>
              </div>
              <div className="dash-stat">
                <div className="label">Ad Spend</div>
                <div className="value">$12,400</div>
                <div className="change">↑ Optimized by AI</div>
              </div>
              <div className="dash-stat">
                <div className="label">UGC Ads Created</div>
                <div className="value">34</div>
                <div className="change">↑ 12 this week</div>
              </div>
            </div>
            <div className="progress-bars">
              <div className="pbar-row">
                <span style={{ width: '110px' }}>Meta Ads</span>
                <div className="pbar-track"><div className="pbar-fill" style={{ width: '84%' }} /></div>
                <span>84% efficiency</span>
              </div>
              <div className="pbar-row">
                <span style={{ width: '110px' }}>Google Ads</span>
                <div className="pbar-track"><div className="pbar-fill" style={{ width: '81%', background: 'linear-gradient(90deg, #4285F4, #34A853)' }} /></div>
                <span>81% efficiency</span>
              </div>
              <div className="pbar-row">
                <span style={{ width: '110px' }}>UGC Quality</span>
                <div className="pbar-track"><div className="pbar-fill" style={{ width: '96%' }} /></div>
                <span>96% approval rate</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {[
            ['$89/mo', 'vs $3k agencies'], ['Meta Ads', 'fully automated'], ['Google Ads', 'on Growth+'],
            ['AI-written', 'scripts & copy'], ['Zero', 'agency fees'], ['Live', 'Shopify data sync'],
            ['No brief', 'no onboarding call'], ['Cancel', 'any time'], ['Shopify', 'native integration'],
            ['$89/mo', 'vs $3k agencies'], ['Meta Ads', 'fully automated'], ['Google Ads', 'on Growth+'],
            ['AI-written', 'scripts & copy'], ['Zero', 'agency fees'], ['Live', 'Shopify data sync'],
            ['No brief', 'no onboarding call'], ['Cancel', 'any time'], ['Shopify', 'native integration'],
          ].map(([val, label], i) => (
            <span key={i} className="tick-item">
              <span className="tick-val">{val}</span> {label}
              <span className="tick-sep">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Pain vs Gain ── */}
      <div className="compare-bar">
        <div className="compare-grid">
          <div className="compare-card bad" data-reveal="left">
            <div className="compare-label">The Old Way</div>
            <ul className="compare-list">
              <li><span className="xi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>$3,000–$8,000/month agency retainer</li>
              <li><span className="xi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>2–4 weeks to launch a campaign</li>
              <li><span className="xi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>Generic creatives from a template library</li>
              <li><span className="xi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>Weekly reports, no real-time visibility</li>
              <li><span className="xi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>You explain your store to a stranger, again</li>
            </ul>
          </div>
          <div className="compare-card good" data-reveal="right">
            <div className="compare-label">The Ephermal Way</div>
            <ul className="compare-list">
              <li><span className="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></span>From $89/month, less than one bad ad</li>
              <li><span className="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></span>Live campaigns in under 60 seconds</li>
              <li><span className="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></span>Real UGC-style ads built from your products</li>
              <li><span className="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></span>Live ROAS dashboard, 24/7</li>
              <li><span className="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg></span>AI reads your store. You explain nothing.</li>
            </ul>
          </div>
        </div>
      </div>


      {/* ── How It Works ── */}
      <section className="section" id="how-it-works">
        <div className="container">
          <div data-reveal>
            <div className="section-label">How it works</div>
            <h2 className="section-title">From store to live ads<br />in under 60 seconds.</h2>
            <p className="section-sub">No agency. No brief. No guesswork. Ephermal reads your store and builds the entire ad operation for you.</p>
          </div>
          <div className="steps">
            <div className="step" data-reveal data-delay="1">
              <div className="step-num">01</div>
              <h3>Connect Your Store</h3>
              <p>Connect your Shopify store via OAuth. Link Meta Ads (all plans) or Google Ads (Growth+). Under 3 minutes from zero to ready.</p>
            </div>
            <div className="step" data-reveal data-delay="2">
              <div className="step-num">02</div>
              <h3>AI Reads Everything</h3>
              <p>Ephermal scans your products, pricing, bestsellers and brand voice, building a complete advertising strategy automatically.</p>
            </div>
            <div className="step" data-reveal data-delay="3">
              <div className="step-num">03</div>
              <h3>AI Ad Content Built</h3>
              <p>Creator-style scripts, hooks, headlines, and copy generated from your actual products. Not a template library. Every creative is specific to your store and audience.</p>
            </div>
            <div className="step" data-reveal data-delay="4">
              <div className="step-num">04</div>
              <h3>Launch &amp; Optimise</h3>
              <p>Campaigns go live across Meta and Google Ads. The AI monitors ROAS across placements, surfaces what&apos;s working, and tells you exactly where to scale.</p>
            </div>
          </div>
          {/* Agent summary */}
          <div className="hiw-agents" data-reveal data-delay="1">
            <p className="hiw-agents-label">7 specialized agents running on your store around the clock</p>
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="section" id="services" style={{ paddingTop: 0 }}>
        <div className="container">
          <div data-reveal>
            <div className="section-label">What Ephermal does</div>
            <h2 className="section-title">Every part of advertising.<br />Handled.</h2>
          </div>
          <div className="services-grid">
            {[
              {
                icon: <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
                title: 'Live Store Intelligence',
                desc: 'Ephermal reads your Shopify store in real time: inventory, pricing, bestsellers. Reflected live in every ad. When your price changes, your ad updates.',
                tag: 'Real-time sync', delay: '1',
              },
              {
                icon: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
                title: 'AI Content Engine',
                desc: 'Creator-style scripts, hooks, headlines, and ad copy generated from your actual product catalog. Every brief is unique to your store, not pulled from a template library.',
                tag: 'Script & Copy Engine', delay: '2',
              },
              {
                icon: <path d="M18 20V10M12 20V4M6 20v-6" />,
                title: 'Meta Ads Automation',
                desc: 'Full campaign creation on your Facebook & Instagram accounts. Copy, audiences, budgets, launch: all autonomous. You just watch the ROAS. Built on the official Meta Marketing API.',
                tag: 'Powered by Meta Ads API', delay: '3',
                cite: { label: 'Meta Marketing API', href: 'https://developers.facebook.com/docs/marketing-apis' },
              },
              {
                icon: <><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></>,
                title: 'Google Ads Automation',
                desc: 'Launch and scale Search, Shopping and Performance Max campaigns on Google. Ephermal handles keyword selection, bidding, creative and budget allocation. Growth+ only.',
                tag: 'Powered by Google Ads API', delay: '4',
                cite: { label: 'Google Ads API', href: 'https://developers.google.com/google-ads/api/docs/start' },
              },
              {
                icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
                title: 'Audience Intelligence',
                desc: 'Ephermal builds custom audiences from your store data, then finds similar buyers across Meta and Google. Lookalike audiences, retargeting, and Pixel + CAPI, all automated.',
                tag: 'Meta Pixel + CAPI · Google Signals', delay: '1',
              },
              {
                icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
                title: 'AI Copywriting Agent',
                desc: 'Every headline, description and CTA is written by a dedicated copywriting AI trained on high-converting DTC copy. Specific to your product. Not a template.',
                tag: 'Conversion-optimized', delay: '2',
              },
              {
                icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
                title: 'ROAS Optimisation',
                desc: 'Ephermal monitors performance across your campaigns and flags what&apos;s draining budget. Clear signals so you&apos;re always allocating spend where it actually converts.',
                tag: 'Performance-driven', delay: '3',
              },
            ].map((s: { icon: React.ReactNode; title: string; desc: string; tag: string; delay: string; cite?: { label: string; href: string } }, i) => (
              <div key={i} className="service-card" data-reveal data-delay={s.delay} data-spotlight>
                <div className="service-icon"><svg viewBox="0 0 24 24">{s.icon}</svg></div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                <div className="service-card-footer">
                  <span className="service-tag">{s.tag}</span>
                  {s.cite && (
                    <a href={s.cite.href} target="_blank" rel="noopener noreferrer" className="service-cite">
                      {s.cite.label} ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Shopify Section ── */}
      <ShopifyReveal />

      {/* ── Meta Section ── */}
      <section className="section meta-section">
        <div className="container">
          <div className="meta-inner">
            <div className="meta-logo-block" data-reveal="left">
              <h2>Powered by</h2>
              <img src="https://static.xx.fbcdn.net/rsrc.php/y3/r/y6QsbGgc866.svg" alt="Meta" width={300} height={200} />
            </div>
            <div className="meta-content" data-reveal="right" data-delay="1">
              <div className="section-label">Powered by Meta</div>
              <h2 className="section-title">Facebook &amp; Instagram,<br />natively integrated.</h2>
              <p className="section-sub" style={{ textAlign: 'left', margin: '0 0 28px' }}>
                Ephermal connects directly to Meta&apos;s official Ads API, the same infrastructure used by the world&apos;s largest advertisers. No scraping, no third-party middleware. Your campaigns run natively inside Meta&apos;s ad platform.
              </p>
              <div className="meta-platforms">
                <div className="meta-platform-card">
                  <svg className="meta-platform-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <div>
                    <div className="meta-platform-name">Facebook</div>
                    <div className="meta-platform-sub">Feed · Stories · Reels</div>
                  </div>
                </div>
                <div className="meta-platform-card">
                  <svg className="meta-platform-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  <div>
                    <div className="meta-platform-name">Instagram</div>
                    <div className="meta-platform-sub">Feed · Stories · Reels</div>
                  </div>
                </div>
              </div>
              <div className="meta-features">
                {[
                  'Native Meta Ads API: no third-party middleware',
                  'Automated campaign creation & budget management',
                  'Pixel + Conversions API for precise attribution',
                  'Dynamic creative testing across all placements',
                ].map((f, i) => (
                  <div key={i} className="meta-feat">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Google Ads Section ── */}
      <section className="section meta-section" style={{ background: 'linear-gradient(135deg, rgba(66,133,244,0.06) 0%, rgba(52,168,83,0.04) 100%)' }}>
        <div className="container">
          <div className="meta-inner">
            <div className="meta-content" data-reveal="left" data-delay="1">
              <div className="section-label">Growth &amp; Scale Plans</div>
              <h2 className="section-title">Google Ads,<br />fully automated.</h2>
              <p className="section-sub" style={{ textAlign: 'left', margin: '0 0 28px' }}>
                Unlock Google Search, Shopping and Performance Max campaigns on Growth and Scale. Ephermal connects to the official Google Ads API, selects keywords from your product catalog, allocates budget intelligently, and optimises bids in real time.
              </p>
              <div className="meta-platforms">
                <div className="meta-platform-card">
                  <svg className="meta-platform-icon" viewBox="0 0 24 24" fill="none" width="24" height="24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <div>
                    <div className="meta-platform-name">Search &amp; Shopping</div>
                    <div className="meta-platform-sub">Keywords · PMax · Smart Bidding</div>
                  </div>
                </div>
                <div className="meta-platform-card">
                  <svg className="meta-platform-icon" viewBox="0 0 24 24" fill="none" width="24" height="24">
                    <rect x="2" y="3" width="20" height="14" rx="2" fill="none" stroke="#EA4335" strokeWidth="1.5"/>
                    <path d="M8 21h8M12 17v4" stroke="#EA4335" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <div>
                    <div className="meta-platform-name">YouTube &amp; Display</div>
                    <div className="meta-platform-sub">Video · Responsive Display · Remarketing</div>
                  </div>
                </div>
              </div>
              <div className="meta-features">
                {[
                  'Google Ads API: native campaign creation',
                  'AI keyword research from your product catalog',
                  'Performance Max with your UGC creatives',
                  'Smart bidding: Target ROAS & Target CPA',
                ].map((f, i) => (
                  <div key={i} className="meta-feat">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '24px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'rgba(85,88,232,0.1)', border: '1px solid rgba(85,88,232,0.25)', borderRadius: '10px', fontSize: '13px', color: 'var(--primary, #5558e8)', fontWeight: 600 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Available on Growth &amp; Scale plans
              </div>
            </div>
            <div className="meta-logo-block" data-reveal="right">
              <h2>Also powered by</h2>
              <svg viewBox="0 0 272 92" width="240" height="80" xmlns="http://www.w3.org/2000/svg">
                <path d="M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18C71.25 34.32 81.24 25 93.5 25s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z" fill="#EA4335"/>
                <path d="M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z" fill="#FBBC05"/>
                <path d="M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.96h.34v-3.61h9.25zm-8.56 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z" fill="#4285F4"/>
                <path d="M225 3v65h-9.5V3h9.5z" fill="#34A853"/>
                <path d="M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.27-7.98l19.82-8.23c-1.09-2.77-4.37-4.7-8.23-4.7-4.95 0-11.84 4.37-11.59 12.93z" fill="#EA4335"/>
                <path d="M35.29 41.41V32H67c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 34.91.36 15.93 16.32.47 35.3.47c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65l-22.49.01z" fill="#4285F4"/>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ── Agent / Intelligence Section ── */}
      <section className="agent-section section">
        <div className="container">
          <div className="agent-wrap">
            <div className="agent-text" data-reveal="left">
              <div className="section-label">Under the hood</div>
              <h2 className="section-title">One brain.<br />Seven specialists.</h2>
              <p className="section-sub">The Ephermal Orchestrator coordinates a team of specialized AI agents, each one built for a specific part of running your ad operation.</p>
              <div className="feature-list">
                {[
                  { title: 'Orchestrator Agent', body: 'The core intelligence. Analyzes your store, plans strategy and coordinates every specialist agent in sequence.' },
                  { title: 'Performance Signals', body: 'Ephermal tracks results across your campaigns and refines its strategy based on what actually converts in your category.' },
                  { title: 'Full Transparency', body: 'See exactly what the AI decided and why. Approve creatives before launch. You are always in control.' },
                ].map((f, i) => (
                  <div key={i} className="feat-item" data-reveal data-delay={String(i + 1)}>
                    <div className="feat-dot" />
                    <div><h4>{f.title}</h4><p>{f.body}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <AgentNetwork />
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="section stats-section" id="about">
        <div className="container">
          <div data-reveal>
            <h2 className="section-title">What you actually get.</h2>
          </div>
          <div className="stats-grid">
            <StatsMotion stats={[
              { num: '3 min', label: 'From Shopify install to first campaign live' },
              { num: '$89',   label: 'Per month, a fraction of any agency retainer' },
              { num: '2',     label: 'Ad platforms automated: Meta and Google Ads' },
              { num: '$0',    label: 'Hidden fees, long contracts, or agency markups' },
            ]} />
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="section quotes-section">
        <div className="container">
          <div data-reveal>
            <div className="big-quote">
              &ldquo;The store doesn&apos;t sleep.<br />Neither should <span>your ads.</span>&rdquo;
            </div>
            <p className="quote-attr">Ephermal</p>
          </div>
          <div data-reveal style={{ maxWidth: '680px', margin: '0 auto 40px', textAlign: 'center' }}>
            <div className="section-label" style={{ marginBottom: '16px' }}>Early access</div>
            <h3 style={{ fontSize: 'clamp(22px,3vw,32px)', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '16px' }}>
              We just launched.<br />We want to work with you directly.
            </h3>
            <p style={{ fontSize: '15px', color: 'var(--muted)', lineHeight: 1.75 }}>
              Ephermal is new. We don&apos;t have hundreds of success stories. We have a product
              we believe in and a small group of Shopify brands testing it in real stores.
              If your store does $5k–$80k/month and you&apos;re tired of agency fees, we&apos;ll
              onboard you personally.
            </p>
          </div>
          <div className="quotes-grid" data-stagger>
            {[
              { title: 'Locked-in pricing', body: 'Early subscribers get today\'s prices locked. No increases when we scale up.', delay: '1' },
              { title: 'Direct founder access', body: 'Questions, setup, feature requests: you reach us directly. Not a support ticket queue.', delay: '2' },
              { title: 'Shape the roadmap', body: 'Your feedback drives what we build next. Early users have real influence on the product.', delay: '3' },
            ].map((p, i) => (
              <div key={i} className="quote-card" data-reveal="pop" data-delay={p.delay} style={{ textAlign: 'left' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px', color: 'var(--text)' }}>{p.title}</h4>
                <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.65 }}>{p.body}</p>
              </div>
            ))}
          </div>
          <div data-reveal style={{ textAlign: 'center', marginTop: '36px' }}>
            <a href="/auth/register.html" className="btn-primary" style={{ fontSize: '16px', padding: '16px 40px' }}>
              Get Early Access
            </a>
            <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted)' }}>
              Setup in 3 minutes · Founder onboarding included
            </p>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="section pricing-section" id="pricing">
        <div className="container">
          <div data-reveal>
            <div className="section-label">Pricing</div>
            <h2 className="section-title">Less than one bad ad.</h2>
            <p className="section-sub" style={{ margin: '0 auto' }}>Flat monthly rate. No long-term contracts. Cancel from your dashboard.</p>
          </div>
          <div className="pricing-grid">
            <div className="price-card" data-reveal="pop" data-delay="1" data-spotlight>
              <div className="price-badge">Starter</div>
              <div className="price-amount"><sup>$</sup>89</div>
              <div className="price-per">/ month, saves $2,911 vs an agency</div>
              <div className="price-credits">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" /></svg>
                15 UGC credits / month
              </div>
              <ul className="price-features">
                {([
                  {f:'1 Shopify store'},
                  {f:'15 UGC creatives / month'},
                  {f:'Meta Ads automation'},
                  {f:'Live store sync'},
                  {f:'Campaign dashboard'},
                  {f:'Creative approval workflow'},
                  {f:'Basic analytics'},
                  {f:'Google Ads automation',locked:true,badge:'Growth+'},
                  {f:'AI ad strategist chat',locked:true,badge:'Growth+'},
                  {f:'AI UGC script writer',locked:true,badge:'Growth+'},
                  {f:'Store intelligence & audiences',locked:true,badge:'Growth+'},
                  {f:'Closed-loop ROAS optimization',locked:true,badge:'Growth+'},
                  {f:'Bulk campaign management',locked:true,badge:'Scale'},
                  {f:'Multi-store consolidated view',locked:true,badge:'Scale'},
                  {f:'White-label option',locked:true,badge:'Scale'},
                ] as {f:string,locked?:boolean,badge?:string}[]).map(({f,locked,badge}) => (
                  <li key={f} style={locked?{opacity:0.42}:undefined}>
                    {locked
                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{flexShrink:0,marginTop:'1px'}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      : <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                    }
                    {f}{locked && <span style={{fontSize:'10px',marginLeft:'5px',color:badge==='Scale'?'#06d6c7':'#5558e8',fontWeight:700}}>{badge}</span>}
                  </li>
                ))}
              </ul>
              <a href="/auth/register.html" className="price-btn">Get Started</a>
            </div>
            <div className="price-card featured" data-reveal="pop" data-delay="2" data-spotlight>
              <div className="price-badge">Growth</div>
              <div className="price-amount"><sup>$</sup>199</div>
              <div className="price-per">/ month, saves $2,801 vs an agency</div>
              <div className="price-credits">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" /></svg>
                75 UGC credits / month
              </div>
              <ul className="price-features">
                {([
                  {f:'3 Shopify stores'},
                  {f:'75 UGC creatives / month'},
                  {f:'Meta Ads automation'},
                  {f:'Live store sync'},
                  {f:'Campaign dashboard'},
                  {f:'Creative approval workflow'},
                  {f:'Google Ads automation'},
                  {f:'AI ad strategist chat'},
                  {f:'AI UGC script writer'},
                  {f:'Store intelligence & audiences'},
                  {f:'Full campaign analytics'},
                  {f:'Closed-loop ROAS optimization'},
                  {f:'Priority AI agents'},
                  {f:'Bulk campaign management', locked:true, badge:'Scale'},
                  {f:'Multi-store consolidated view', locked:true, badge:'Scale'},
                  {f:'White-label option', locked:true, badge:'Scale'},
                  {f:'Dedicated AI instance', locked:true, badge:'Scale'},
                ] as {f:string,locked?:boolean,badge?:string}[]).map(({f,locked,badge}) => (
                  <li key={f} style={locked?{opacity:0.42}:undefined}>
                    {locked
                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{flexShrink:0,marginTop:'1px'}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      : <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                    }
                    {f}{locked && <span style={{fontSize:'10px',marginLeft:'5px',color:'#06d6c7',fontWeight:700}}>{badge}</span>}
                  </li>
                ))}
              </ul>
              <a href="/auth/register.html" className="price-btn primary">Subscribe now</a>
            </div>
            <div className="price-card" data-reveal="pop" data-delay="3" data-spotlight>
              <div className="price-badge">Scale</div>
              <div className="price-amount"><sup>$</sup>349</div>
              <div className="price-per">/ month, white-label available</div>
              <div className="price-credits">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 12h8M12 8v8" /></svg>
                350 UGC credits / month
              </div>
              <ul className="price-features">
                {['Unlimited stores','350 UGC creatives / month','Meta + Google Ads automation','Live store sync','Campaign dashboard','Creative approval workflow','AI ad strategist chat','AI UGC script writer','Store intelligence & audiences','Full campaign analytics','Closed-loop ROAS optimization','Priority AI agents','Bulk campaign management','Multi-store consolidated view','White-label option','Dedicated AI instance','Custom integrations','Slack support'].map(f => (
                  <li key={f}><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>{f}</li>
                ))}
              </ul>
              <a href="mailto:hello@ephermal.app" className="price-btn">Contact Sales</a>
            </div>
          </div>
          <div className="risk-row" data-reveal data-delay="1">
            {[
              { icon: <polyline points="20 6 9 17 4 12" />, label: 'No hidden fees or ad account charges' },
              { icon: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></>, label: 'Setup in under 3 minutes' },
              { icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, label: 'Cancel any time, no penalty' },
            ].map((r, i) => (
              <div key={i} className="risk-badge">
                <svg viewBox="0 0 24 24">{r.icon}</svg>
                {r.label}
              </div>
            ))}
          </div>
          <p className="price-credits-note">
            Each plan includes monthly UGC credits as shown. Additional credit packs are available from inside your dashboard.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <FAQ />

      {/* ── Final CTA ── */}
      <section className="cta-section">
        <div className="cta-wrap" data-reveal>
          <h2>Your next customer<br />is one ad away.</h2>
          <p>Install once. Your campaigns run 24/7.</p>
          <a href="/auth/register.html" className="btn-primary" style={{ fontSize: '18px', padding: '20px 48px' }}>
            Get Started
          </a>
          <p className="cta-note">Shopify OAuth takes 90 seconds. Cancel from settings.</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer>
        <div className="footer-logo">
          <img src="/ephermal.png" alt="Ephermal" />
          Ephermal
        </div>
        <div className="footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:hello@ephermal.app">Contact</a>
        </div>
        <div className="footer-copy">© 2026 Ephermal. All rights reserved.</div>
      </footer>
    </>
  );
}
