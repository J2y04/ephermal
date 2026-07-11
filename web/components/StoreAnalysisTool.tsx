'use client';
import { useState, useEffect, FormEvent } from 'react';

const SUPABASE_URL  = 'https://twfgnqddoqeqrjhgioxd.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZmducWRkb3FlcXJqaGdpb3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTk3MjMsImV4cCI6MjA5NTE5NTcyM30.Qosoe62X7ZyPEArhm5Tbg2p97LBo8KQ5NQu9SsqE8k4';

interface ScanResult {
  domain: string;
  summary?: string;
  target_audience?: string;
  ad_opportunities?: string;
  meta_strategy?: string;
  products?: string[];
  keywords?: string[];
  brand_vibe?: string;
  color_palette?: Record<string, string>;
  ugc_visual?: string;
  ugc_tone?: string;
  logo_url?: string | null;
  has_catalog?: boolean;
}

const SCAN_STEPS = [
  'Reading your storefront…',
  'Pulling your product catalog…',
  'Detecting brand colors…',
  'Analysing target audience…',
  'Writing your ad strategy…',
];

const HEX_RE = /^#[0-9A-Fa-f]{3,8}$/;

export default function StoreAnalysisTool() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    const t = setInterval(() => setStepIdx(i => Math.min(i + 1, SCAN_STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, [loading]);

  async function runScan(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/public-store-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not analyse this store. Try another URL.');
        return;
      }
      setResult(data as ScanResult);
    } catch {
      setError('Request failed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const palette = result?.color_palette || {};
  const swatches: { key: string; label: string }[] = [
    { key: 'primary', label: 'Primary' },
    { key: 'secondary', label: 'Secondary' },
    { key: 'accent', label: 'Accent' },
    { key: 'background', label: 'BG' },
    { key: 'text_on_bg', label: 'Text' },
  ];

  return (
    <section className="section store-scan-section" id="analyse">
      <div className="container">
        <div data-reveal style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 40px' }}>
          <div className="section-label" style={{ justifyContent: 'center', display: 'flex' }}>Free — no signup required</div>
          <h2 className="section-title">Analyse Your Store Now.</h2>
          <p className="section-sub" style={{ margin: '0 auto' }}>
            Paste your store URL. In seconds, see the exact brand brief, color palette, and ad strategy Ephermal would build for you, for free, right now.
          </p>
        </div>

        <div data-reveal data-spotlight className="store-scan-card">
          <form onSubmit={runScan} className="store-scan-form">
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="yourstore.com"
              className="store-scan-input"
              disabled={loading}
              aria-label="Store URL"
            />
            <button type="submit" className="btn-primary store-scan-btn" disabled={loading || !url.trim()}>
              {loading ? 'Analysing…' : 'Analyse Your Store Now'}
            </button>
          </form>

          {loading && (
            <div className="store-scan-loading">
              <div className="store-scan-loading-bar"><div className="store-scan-loading-fill" /></div>
              <p key={stepIdx} className="store-scan-loading-text">{SCAN_STEPS[stepIdx]}</p>
            </div>
          )}

          {error && !loading && (
            <div className="store-scan-error">{error}</div>
          )}

          {result && !loading && (
            <div className="store-scan-result fade-in-up">
              <div className="store-scan-result-top">
                <div>
                  <div className="store-scan-domain">{result.domain}</div>
                  {result.brand_vibe && <span className="store-scan-vibe">{result.brand_vibe}</span>}
                </div>
                {!result.has_catalog && (
                  <span className="store-scan-note">No public catalog found. Analysis based on homepage only</span>
                )}
              </div>

              {Object.keys(palette).length > 0 && (
                <div className="store-scan-swatches">
                  {swatches.map(({ key, label }) => {
                    const hex = palette[key];
                    if (!hex || !HEX_RE.test(hex)) return null;
                    return (
                      <div key={key} className="store-scan-swatch">
                        <div className="store-scan-swatch-dot" style={{ background: hex }} />
                        <span>{label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="store-scan-grid">
                {result.summary && (
                  <div className="store-scan-block">
                    <h4>Store Summary</h4>
                    <p>{result.summary}</p>
                  </div>
                )}
                {result.target_audience && (
                  <div className="store-scan-block">
                    <h4>Target Audience</h4>
                    <p>{result.target_audience}</p>
                  </div>
                )}
                {result.ad_opportunities && (
                  <div className="store-scan-block">
                    <h4>Ad Opportunities</h4>
                    <p>{result.ad_opportunities}</p>
                  </div>
                )}
                {result.meta_strategy && (
                  <div className="store-scan-block">
                    <h4>Recommended Strategy</h4>
                    <p>{result.meta_strategy}</p>
                  </div>
                )}
              </div>

              {result.keywords && result.keywords.length > 0 && (
                <div className="store-scan-tags">
                  {result.keywords.slice(0, 8).map((k, i) => <span key={i} className="tag-pill">{k}</span>)}
                </div>
              )}

              <div className="store-scan-cta">
                <p>This took Ephermal about 10 seconds, with zero setup. Connect your real store and Ephermal does this automatically, then writes your ads and launches them across Meta and Google.</p>
                <a href="/auth/register.html" className="btn-primary">Start Free, Automate This</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
