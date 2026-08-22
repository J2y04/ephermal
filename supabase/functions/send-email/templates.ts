/**
 * Ephermal — Email template HTML, inlined as string constants.
 *
 * WHY inlined instead of read from ./templates/*.html at runtime: Supabase's CLI silently falls
 * back to server-side (--use-api) bundling whenever Docker isn't running locally (confirmed via
 * the "WARNING: Docker is not running" line on every deploy from this machine) - and --use-api
 * mode does not support static_files at all (Docker-based local bundling is required for that,
 * per Supabase's own docs). Every deploy of this function had silently omitted the templates/
 * directory entirely, so Deno.readTextFile() 404'd on every single invocation - confirmed live:
 * deployed function's file list contained only index.ts, and a real test send returned
 * "Template not found" with an 88ms execution time (too fast to have ever reached Resend). No
 * transactional email had ever actually been sent, for any user, ever, despite the calling code
 * (stripe-webhook, creative-fatigue, ai-usage's sendUsageEmail) being correctly wired throughout.
 *
 * Inlining as plain TS exports removes the dependency on static-asset bundling entirely - it's
 * ordinary code, which both bundling modes already handle correctly (proven by every
 * _shared/*.ts import working under the same --use-api fallback all session).
 *
 * Design-facing copies live in /email-templates at the repo root, extracted from the strings
 * below and byte-identical to them. They are for previewing and for Claude Design, and are NOT
 * read at runtime. If you change a template, change it here too, or customers keep receiving the
 * old one.
 *
 * There used to be a second copy at ./templates/ next to this file. It drifted: missing
 * contact_enquiry and tester_invite, still carrying a dead ai_limit_80. Removed 2026-08-21.
 */

export const TEMPLATE_HTML: Record<string, string> = {

campaign_ready: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e6ea">

        <tr><td style="padding:26px 28px 6px">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#06a99e">Ready to review</div>
          <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#14161a;line-height:1.3">Your campaign is built and waiting</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#5b6472">
            {{name}}, Ephermal finished writing and structuring your campaign. It is <strong style="color:#14161a">paused</strong>, so nothing is spending yet. It runs when you say so.
          </p>
        </td></tr>

        <tr><td style="padding:18px 28px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;border-radius:10px">
            <tr><td style="padding:16px 18px">
              <div style="font-size:15px;font-weight:650;color:#14161a">{{campaign_name}}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:13px;color:#5b6472">
                <tr>
                  <td style="padding:3px 0;width:110px;color:#8a93a0">Platform</td>
                  <td style="padding:3px 0;color:#22262e">{{platform}}</td>
                </tr>
                <tr>
                  <td style="padding:3px 0;color:#8a93a0">Product</td>
                  <td style="padding:3px 0;color:#22262e">{{product_name}}</td>
                </tr>
                <tr>
                  <td style="padding:3px 0;color:#8a93a0">Daily budget</td>
                  <td style="padding:3px 0;color:#22262e">{{daily_budget}}</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:20px 28px 6px" align="center">
          <a href="{{review_url}}" style="display:inline-block;padding:13px 30px;background:#06d6c7;color:#08080c;font-size:15px;font-weight:650;text-decoration:none;border-radius:100px">Review and launch</a>
        </td></tr>

        <tr><td style="padding:14px 28px 26px">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#5b6472">
            Read the copy, check the budget, change anything you disagree with. Nothing goes live until you launch it yourself.
          </p>
          <p style="margin:14px 0 0;padding-top:14px;border-top:1px solid #e9ebef;font-size:11px;line-height:1.5;color:#98a1ad">
            You are getting this because a campaign was created on your Ephermal account.
            <a href="{{unsubscribe_url}}" style="color:#98a1ad">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,

contact_enquiry: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e6ea">
        <tr><td style="padding:26px 28px 6px">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#06a99e">New enquiry</div>
          <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#14161a">{{name}}</h1>
          <div style="margin-top:4px;font-size:14px;color:#5b6472">{{from_email}}{{company_suffix}}</div>
        </td></tr>
        <tr><td style="padding:18px 28px 8px">
          <div style="white-space:pre-wrap;padding:16px 18px;background:#f6f7f9;border-radius:10px;font-size:15px;line-height:1.65;color:#22262e">{{message}}</div>
        </td></tr>
        <tr><td style="padding:8px 28px 26px">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#5b6472">Hit reply to answer them directly.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,

tester_invite: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
</head>
<body style="margin:0;padding:0;background:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#08080c;padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0f0f13;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden">
        <tr><td style="padding:36px 36px 8px">
          <div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#06d6c7;margin-bottom:18px">Ephermal</div>
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:800;color:#eef0f7">You're in, {{name}}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#a8adbd">
            This link creates your account with tester access already applied. No card, nothing to cancel.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a8adbd">
            You get the Growth plan free for three months: Google Search and Meta ads for small Shopify stores, optimised on real contribution margin rather than ROAS.
          </p>
        </td></tr>
        <tr><td style="padding:0 36px 28px">
          <a href="{{invite_url}}" style="display:block;background:#06d6c7;color:#08080c;text-decoration:none;text-align:center;padding:15px 24px;border-radius:12px;font-size:15px;font-weight:700">Create your account</a>
          <p style="margin:14px 0 0;font-size:12.5px;line-height:1.6;color:#6b7280;text-align:center">
            This link works once and expires in {{expires_days}} days.
          </p>
        </td></tr>
        <tr><td style="padding:0 36px 32px">
          <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:20px">
            <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#a8adbd"><strong style="color:#eef0f7">Two honest notes before you start.</strong></p>
            <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#a8adbd">
              UGC video generation is not switched on yet. Everything else is working and ready to use.
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#a8adbd">
              The Meta connection is still in app review, so reply and I'll add you as a tester on the app. The Google Search side works immediately.
            </p>
          </div>
        </td></tr>
        <tr><td style="padding:0 36px 34px">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280">
            If it turns out not to be useful, telling me why is worth as much to me as a signup.
          </p>
          <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#6b7280">Jamal, founder</p>
        </td></tr>
        <tr><td style="padding:20px 36px;background:#0b0b0f;border-top:1px solid rgba(255,255,255,0.06)">
          <p style="margin:0;font-size:11px;line-height:1.6;color:#4b5563">
            Sent because you were personally invited to test Ephermal.
            <a href="{{unsubscribe_url}}" style="color:#6b7280">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,

welcome: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Welcome to Ephermal</title>
  <style>
    /* ── Reset ── */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; background-color: #08080c; width: 100% !important; }

    /* ── Dark mode overrides ── */
    @media (prefers-color-scheme: dark) {
      .email-bg       { background-color: #08080c !important; }
      .card-bg        { background-color: #0f0f13 !important; }
      .inner-card     { background-color: #1a1a1f !important; }
      .text-main      { color: #eef0f7 !important; }
      .text-muted     { color: #6b7280 !important; }
      .border-line    { border-color: rgba(6,214,199,0.18) !important; }
    }

    /* ── Responsive ── */
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .card-pad        { padding: 32px 24px !important; }
      .stat-cell       { display: block !important; width: 100% !important; text-align: center !important; padding: 12px 0 !important; }
      .btn-cta         { width: 100% !important; display: block !important; }
      .logo-text       { font-size: 22px !important; }
      .headline        { font-size: 26px !important; }
    }
  </style>
</head>

<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <!-- ── Preheader (hidden preview text) ── -->
  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Your AI ad team is ready. Here's how to get your first win in the next 48 hours.
  </div>

  <!-- ── Outer wrapper ── -->
  <table class="email-bg" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr>
      <td align="center" style="padding:40px 16px 60px;">

        <!-- ── Email container ── -->
        <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;">

          <!-- ── Logo header ── -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="https://ephermal.app/ephermal.png"
                         alt="Ephermal"
                         width="40" height="40"
                         style="display:block;width:40px;height:40px;border-radius:10px;object-fit:cover;border:0;outline:none;text-decoration:none;">
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span class="logo-text" style="font-size:24px;font-weight:800;color:#eef0f7;letter-spacing:-0.5px;">Ephermal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Main card ── -->
          <tr>
            <td class="card-bg" style="background-color:#0f0f13;border-radius:24px;border:1px solid rgba(6,214,199,0.18);overflow:hidden;">

              <!-- ── Accent bar ── -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,#06d6c7,#34d399);"></td>
                </tr>
              </table>

              <!-- ── Card content ── -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="card-pad" style="padding:48px 48px 40px;">

                    <!-- ── Greeting ── -->
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#06d6c7;">
                      You're in.
                    </p>
                    <h1 class="headline text-main" style="margin:0 0 24px;font-size:32px;font-weight:900;color:#eef0f7;letter-spacing:-0.8px;line-height:1.2;">
                      Welcome to the team,<br>{{name}} 👋
                    </h1>

                    <!-- ── Divider ── -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
                      <tr><td style="height:1px;background:rgba(6,214,199,0.15);"></td></tr>
                    </table>

                    <!-- ── Main copy ── -->
                    <p class="text-main" style="margin:0 0 18px;font-size:16px;color:#eef0f7;line-height:1.75;font-weight:400;">
                      You just made the same move that the fastest-growing Shopify brands are making right now — putting AI between your store and your ad spend, so <em>every dollar works harder</em>.
                    </p>
                    <p class="text-muted" style="margin:0 0 18px;font-size:15px;color:#6b7280;line-height:1.75;">
                      Most founders are still doing it the hard way: bouncing between Meta Ads Manager, Canva, some UGC tool, and three spreadsheets — losing hours and leaving money on the table every single week.
                    </p>
                    <p class="text-main" style="margin:0 0 28px;font-size:15px;color:#eef0f7;line-height:1.75;">
                      Ephermal closes that loop. Your store's brand identity, your UGC, your campaigns, your ROAS — all in one place, optimized automatically. Brands on Growth typically see meaningful ROAS improvements within their first 30 days. That story can start for you today.
                    </p>

                    <!-- ── Insight callout box ── -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:32px;">
                      <tr>
                        <td class="inner-card" style="background-color:#1a1a1f;border-radius:14px;border-left:3px solid #06d6c7;padding:20px 24px;">
                          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06d6c7;">
                            Your first win
                          </p>
                          <p class="text-main" style="margin:0;font-size:14px;color:#eef0f7;line-height:1.65;">
                            Connect your Shopify store in the next <strong style="color:#06d6c7;">10 minutes</strong> and let Ephermal analyse your brand — it'll extract your color palette, tone, and UGC style automatically. That analysis powers every ad creative you generate from here on out.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- ── Stats row ── -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:36px;">
                      <tr>
                        <td class="stat-cell" align="center" width="33%" style="padding:16px;border-right:1px solid rgba(6,214,199,0.12);">
                          <p style="margin:0 0 4px;font-size:26px;font-weight:900;color:#06d6c7;letter-spacing:-1px;">2.4×</p>
                          <p class="text-muted" style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Avg ROAS lift</p>
                        </td>
                        <td class="stat-cell" align="center" width="33%" style="padding:16px;border-right:1px solid rgba(6,214,199,0.12);">
                          <p style="margin:0 0 4px;font-size:26px;font-weight:900;color:#34d399;letter-spacing:-1px;">5hrs</p>
                          <p class="text-muted" style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Saved per week</p>
                        </td>
                        <td class="stat-cell" align="center" width="33%" style="padding:16px;">
                          <p style="margin:0 0 4px;font-size:26px;font-weight:900;color:#fbbf24;letter-spacing:-1px;">&lt;48h</p>
                          <p class="text-muted" style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">To first creative</p>
                        </td>
                      </tr>
                    </table>

                    <!-- ── CTA button ── -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:12px;">
                      <tr>
                        <td style="border-radius:12px;background-color:#06d6c7;">
                          <a href="https://ephermal.app/setup.html" class="btn-cta" target="_blank"
                             style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#08080c;text-decoration:none;letter-spacing:-0.1px;border-radius:12px;mso-padding-alt:0;">
                            Set up your store →
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p class="text-muted" style="margin:0 0 0;font-size:12px;color:#6b7280;text-align:center;">
                      Takes under 10 minutes. No card required for setup.
                    </p>

                  </td>
                </tr>
              </table>

              <!-- ── Steps strip ── -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="background-color:#08080c;border-top:1px solid rgba(6,214,199,0.12);padding:28px 48px;">
                    <p style="margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06d6c7;">
                      What to do first
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td width="28" valign="top" style="padding-right:14px;padding-top:1px;">
                          <div style="width:24px;height:24px;border-radius:50%;background:rgba(6,214,199,0.15);border:1px solid rgba(6,214,199,0.35);text-align:center;line-height:22px;font-size:12px;font-weight:700;color:#06d6c7;">1</div>
                        </td>
                        <td style="padding-bottom:14px;">
                          <p class="text-main" style="margin:0 0 2px;font-size:14px;font-weight:600;color:#eef0f7;">Connect your Shopify store</p>
                          <p class="text-muted" style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Ephermal syncs your products and analyses your brand identity in seconds.</p>
                        </td>
                      </tr>
                      <tr>
                        <td width="28" valign="top" style="padding-right:14px;padding-top:1px;">
                          <div style="width:24px;height:24px;border-radius:50%;background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.35);text-align:center;line-height:22px;font-size:12px;font-weight:700;color:#34d399;">2</div>
                        </td>
                        <td style="padding-bottom:14px;">
                          <p class="text-main" style="margin:0 0 2px;font-size:14px;font-weight:600;color:#eef0f7;">Link your Meta Ads account</p>
                          <p class="text-muted" style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Your live ROAS, spend, and campaigns appear in the dashboard instantly.</p>
                        </td>
                      </tr>
                      <tr>
                        <td width="28" valign="top" style="padding-right:14px;padding-top:1px;">
                          <div style="width:24px;height:24px;border-radius:50%;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);text-align:center;line-height:22px;font-size:12px;font-weight:700;color:#fbbf24;">3</div>
                        </td>
                        <td>
                          <p class="text-main" style="margin:0 0 2px;font-size:14px;font-weight:600;color:#eef0f7;">Generate your first UGC creative</p>
                          <p class="text-muted" style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Hit Generate — your brand-aligned UGC script is written and queued for production.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td align="center" style="padding:32px 0 0;">
              <p class="text-muted" style="margin:0 0 8px;font-size:12px;color:#6b7280;line-height:1.6;">
                You're receiving this because you signed up at <a href="https://ephermal.app" style="color:#06d6c7;text-decoration:none;">ephermal.app</a>
              </p>
              <p class="text-muted" style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
                <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy Policy</a>
                &nbsp;·&nbsp;
                <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a>
                &nbsp;·&nbsp;
                <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
              </p>
              <p class="text-muted" style="margin:8px 0 0;font-size:11px;color:rgba(107,114,128,0.45);">
                © 2026 Interlink Platforms. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
        <!-- /email container -->

      </td>
    </tr>
  </table>

</body>
</html>
`,

payment_failed: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
  <title>Payment failed — Ephermal</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    body{margin:0!important;padding:0!important;background-color:#08080c;width:100%!important}
    @media screen and (max-width:600px){.email-container{width:100%!important}.card-pad{padding:32px 20px!important}}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    We couldn't process your latest payment. Update your card to keep your Ephermal subscription active.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr><td align="center" style="padding:40px 16px 60px;">
      <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="vertical-align:middle;"><img src="https://ephermal.app/ephermal.png" alt="Ephermal" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:9px;border:0;"></td>
            <td style="padding-left:9px;vertical-align:middle;"><span style="font-size:22px;font-weight:800;color:#eef0f7;letter-spacing:-0.4px;">Ephermal</span></td>
          </tr></table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background-color:#0f0f13;border-radius:20px;border:1px solid rgba(248,113,113,0.25);overflow:hidden;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="height:3px;background-color:#f87171;"></td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td class="card-pad" style="padding:40px 44px 36px;">

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">
                <tr><td style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:20px;padding:5px 14px;">
                  <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#f87171;">Payment Failed</span>
                </td></tr>
              </table>

              <h1 style="margin:0 0 16px;font-size:26px;font-weight:900;color:#eef0f7;letter-spacing:-0.6px;line-height:1.2;">
                We couldn't charge your card, {{name}}.
              </h1>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr><td style="height:1px;background:rgba(248,113,113,0.15);"></td></tr>
              </table>

              <p style="margin:0 0 16px;font-size:15px;color:#eef0f7;line-height:1.75;">
                Your latest payment for your Ephermal subscription didn't go through (attempt {{attempt}}). Your account and campaigns are still active for now, but access will be paused if the payment keeps failing.
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.75;">
                Update your payment method to keep everything running without interruption.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="border-radius:12px;background-color:#f87171;">
                  <a href="https://ephermal.app/dashboard.html" target="_blank"
                     style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#08080c;text-decoration:none;border-radius:12px;">
                    Update payment method →
                  </a>
                </td></tr>
              </table>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:28px 0 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
            <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy</a> &nbsp;·&nbsp;
            <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a> &nbsp;·&nbsp;
            <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
          </p>
          <p style="margin:0;font-size:11px;color:rgba(107,114,128,0.4);">© 2026 Interlink Platforms. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`,

fatigue_alert: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
  <title>Ad Fatigue Detected — Ephermal</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    body{margin:0!important;padding:0!important;background-color:#08080c;width:100%!important}
    @media screen and (max-width:600px){.email-container{width:100%!important}.card-pad{padding:32px 20px!important}}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    One or more of your creatives is showing fatigue signals. Act now before spend drops.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr><td align="center" style="padding:40px 16px 60px;">
      <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="vertical-align:middle;"><img src="https://ephermal.app/ephermal.png" alt="Ephermal" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:9px;border:0;"></td>
            <td style="padding-left:9px;vertical-align:middle;"><span style="font-size:22px;font-weight:800;color:#eef0f7;letter-spacing:-0.4px;">Ephermal</span></td>
          </tr></table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background-color:#0f0f13;border-radius:20px;border:1px solid rgba(248,113,113,0.25);overflow:hidden;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="height:3px;background-color:#f87171;"></td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td class="card-pad" style="padding:40px 44px 36px;">

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">
                <tr><td style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:20px;padding:5px 14px;">
                  <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#f87171;">⚠️ Fatigue Detected</span>
                </td></tr>
              </table>

              <h1 style="margin:0 0 16px;font-size:26px;font-weight:900;color:#eef0f7;letter-spacing:-0.6px;line-height:1.2;">
                Your audience is tuning out.<br>Time to refresh.
              </h1>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr><td style="height:1px;background:rgba(248,113,113,0.15);"></td></tr>
              </table>

              <p style="margin:0 0 18px;font-size:15px;color:#eef0f7;line-height:1.75;">
                Ephermal detected <strong style="color:#f87171;">creative fatigue</strong> signals on one or more of your active campaigns. CTR is declining and frequency is climbing — your audience has seen this creative too many times.
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.75;">
                If left unchecked, fatigued creatives drain budget on diminishing returns. Log in and refresh them before your ROAS takes a hit.
              </p>

              <!-- What to do -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:32px;">
                <tr><td style="background:#1a1a1f;border-radius:14px;border-left:3px solid #f87171;padding:20px 24px;">
                  <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#f87171;">What to do now</p>
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr><td style="padding:5px 0;font-size:14px;color:#eef0f7;"><span style="color:#f87171;margin-right:8px;">1.</span>Open Creatives → check fatigue scores</td></tr>
                    <tr><td style="padding:5px 0;font-size:14px;color:#eef0f7;"><span style="color:#f87171;margin-right:8px;">2.</span>Hit UGC Studio → generate fresh variants</td></tr>
                    <tr><td style="padding:5px 0;font-size:14px;color:#eef0f7;"><span style="color:#f87171;margin-right:8px;">3.</span>Approve and launch the new creative</td></tr>
                  </table>
                </td></tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="border-radius:12px;background-color:#f87171;">
                  <a href="https://ephermal.app/dashboard.html" target="_blank"
                     style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#08080c;text-decoration:none;border-radius:12px;">
                    Review fatigued creatives →
                  </a>
                </td></tr>
              </table>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:28px 0 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
            <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy</a> &nbsp;·&nbsp;
            <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a> &nbsp;·&nbsp;
            <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
          </p>
          <p style="margin:0;font-size:11px;color:rgba(107,114,128,0.4);">© 2026 Interlink Platforms. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`,

ai_limit_80: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
  <title>Running low on AI messages — Ephermal</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    body{margin:0!important;padding:0!important;background-color:#08080c;width:100%!important}
    @media screen and (max-width:600px){.email-container{width:100%!important}.card-pad{padding:32px 20px!important}}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    You've used 80% of your AI messages this week. Top up before you run out.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr><td align="center" style="padding:40px 16px 60px;">
      <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="vertical-align:middle;"><img src="https://ephermal.app/ephermal.png" alt="Ephermal" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:9px;border:0;"></td>
            <td style="padding-left:9px;vertical-align:middle;"><span style="font-size:22px;font-weight:800;color:#eef0f7;letter-spacing:-0.4px;">Ephermal</span></td>
          </tr></table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background-color:#0f0f13;border-radius:20px;border:1px solid rgba(251,191,36,0.25);overflow:hidden;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="height:3px;background-color:#fbbf24;"></td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td class="card-pad" style="padding:40px 44px 36px;">

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">
                <tr><td style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:20px;padding:5px 14px;">
                  <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#fbbf24;">⚠️ Usage Alert</span>
                </td></tr>
              </table>

              <h1 style="margin:0 0 16px;font-size:26px;font-weight:900;color:#eef0f7;letter-spacing:-0.6px;line-height:1.2;">
                You're at 80% of your<br>AI messages this week.
              </h1>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr><td style="height:1px;background:rgba(251,191,36,0.15);"></td></tr>
              </table>

              <p style="margin:0 0 16px;font-size:15px;color:#eef0f7;line-height:1.75;">
                You've used <strong style="color:#fbbf24;">80%</strong> of your weekly AI message allowance. Once you hit 100%, AI chat, UGC generation, and campaign copy will pause until next week.
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.75;">
                Top up now to keep the momentum going — or upgrade your plan for a higher weekly limit.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;background:#1a1a1f;border-radius:12px;overflow:hidden;">
                <tr><td style="padding:14px 20px;font-size:14px;color:#eef0f7;border-bottom:1px solid rgba(255,255,255,0.07);">
                  <strong style="color:#fbbf24;">€5</strong><span style="color:#6b7280;margin-left:4px;">→ 50 extra messages</span>
                </td></tr>
                <tr><td style="padding:14px 20px;font-size:14px;color:#eef0f7;border-bottom:1px solid rgba(255,255,255,0.07);">
                  <strong style="color:#fbbf24;">€10</strong><span style="color:#6b7280;margin-left:4px;">→ 120 extra messages</span>
                </td></tr>
                <tr><td style="padding:14px 20px;font-size:14px;color:#eef0f7;">
                  <strong style="color:#fbbf24;">€20</strong><span style="color:#6b7280;margin-left:4px;">→ 280 extra messages</span>
                </td></tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="border-radius:12px;background-color:#fbbf24;">
                  <a href="https://ephermal.app/dashboard.html" target="_blank"
                     style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#08080c;text-decoration:none;border-radius:12px;">
                    Top up now →
                  </a>
                </td></tr>
              </table>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:28px 0 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
            <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy</a> &nbsp;·&nbsp;
            <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a> &nbsp;·&nbsp;
            <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
          </p>
          <p style="margin:0;font-size:11px;color:rgba(107,114,128,0.4);">© 2026 Interlink Platforms. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`,

ai_limit_hit: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
  <title>AI message limit reached — Ephermal</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    body{margin:0!important;padding:0!important;background-color:#08080c;width:100%!important}
    @media screen and (max-width:600px){.email-container{width:100%!important}.card-pad{padding:32px 20px!important}}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    You've used all your AI messages this week. Top up now to keep going, or wait for next week's reset.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr><td align="center" style="padding:40px 16px 60px;">
      <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="vertical-align:middle;"><img src="https://ephermal.app/ephermal.png" alt="Ephermal" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:9px;border:0;"></td>
            <td style="padding-left:9px;vertical-align:middle;"><span style="font-size:22px;font-weight:800;color:#eef0f7;letter-spacing:-0.4px;">Ephermal</span></td>
          </tr></table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background-color:#0f0f13;border-radius:20px;border:1px solid rgba(248,113,113,0.25);overflow:hidden;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="height:3px;background-color:#f87171;"></td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td class="card-pad" style="padding:40px 44px 36px;">

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">
                <tr><td style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:20px;padding:5px 14px;">
                  <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#f87171;">Limit Reached</span>
                </td></tr>
              </table>

              <h1 style="margin:0 0 16px;font-size:26px;font-weight:900;color:#eef0f7;letter-spacing:-0.6px;line-height:1.2;">
                You're out of AI messages<br>for this week, {{name}}.
              </h1>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr><td style="height:1px;background:rgba(248,113,113,0.15);"></td></tr>
              </table>

              <p style="margin:0 0 16px;font-size:15px;color:#eef0f7;line-height:1.75;">
                You've used all of your weekly AI message allowance. AI chat, UGC script generation, store analysis, and campaign copy are paused until your limit resets.
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.75;">
                Top up now to keep going right away, or wait for next week's reset — whichever works for you.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;background:#1a1a1f;border-radius:12px;overflow:hidden;">
                <tr><td style="padding:14px 20px;font-size:14px;color:#eef0f7;border-bottom:1px solid rgba(255,255,255,0.07);">
                  <strong style="color:#f87171;">€5</strong><span style="color:#6b7280;margin-left:4px;">→ 50 extra messages</span>
                </td></tr>
                <tr><td style="padding:14px 20px;font-size:14px;color:#eef0f7;border-bottom:1px solid rgba(255,255,255,0.07);">
                  <strong style="color:#f87171;">€10</strong><span style="color:#6b7280;margin-left:4px;">→ 120 extra messages</span>
                </td></tr>
                <tr><td style="padding:14px 20px;font-size:14px;color:#eef0f7;">
                  <strong style="color:#f87171;">€20</strong><span style="color:#6b7280;margin-left:4px;">→ 280 extra messages</span>
                </td></tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="border-radius:12px;background-color:#f87171;">
                  <a href="https://ephermal.app/dashboard.html" target="_blank"
                     style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#08080c;text-decoration:none;border-radius:12px;">
                    Top up now →
                  </a>
                </td></tr>
              </table>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:28px 0 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
            <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy</a> &nbsp;·&nbsp;
            <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a> &nbsp;·&nbsp;
            <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
          </p>
          <p style="margin:0;font-size:11px;color:rgba(107,114,128,0.4);">© 2026 Interlink Platforms. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`,

ai_topup_receipt: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
  <title>AI Top-up Confirmed — Ephermal</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    body{margin:0!important;padding:0!important;background-color:#08080c;width:100%!important}
    @media screen and (max-width:600px){.email-container{width:100%!important}.card-pad{padding:32px 20px!important}}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    {{credits}} AI messages added to your account. You're back in business.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr><td align="center" style="padding:40px 16px 60px;">
      <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="vertical-align:middle;"><img src="https://ephermal.app/ephermal.png" alt="Ephermal" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:9px;border:0;"></td>
            <td style="padding-left:9px;vertical-align:middle;"><span style="font-size:22px;font-weight:800;color:#eef0f7;letter-spacing:-0.4px;">Ephermal</span></td>
          </tr></table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background-color:#0f0f13;border-radius:20px;border:1px solid rgba(52,211,153,0.25);overflow:hidden;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="height:3px;background:linear-gradient(90deg,#34d399,#06d6c7);"></td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td class="card-pad" style="padding:40px 44px 36px;">

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">
                <tr><td style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);border-radius:20px;padding:5px 14px;">
                  <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#34d399;">✓ Top-up Confirmed</span>
                </td></tr>
              </table>

              <h1 style="margin:0 0 16px;font-size:26px;font-weight:900;color:#eef0f7;letter-spacing:-0.6px;line-height:1.2;">
                {{credits}} messages added,<br>{{name}}. You're back.
              </h1>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr><td style="height:1px;background:rgba(52,211,153,0.15);"></td></tr>
              </table>

              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.75;">
                Your <strong style="color:#34d399;">{{credits}} AI messages</strong> are now live in your account. Use them for AI chat, UGC script generation, store analysis, or campaign copy — they don't expire this week.
              </p>

              <!-- Credits added callout -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:32px;">
                <tr><td style="background:#1a1a1f;border-radius:14px;border-left:3px solid #34d399;padding:20px 24px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#34d399;">Added to your account</p>
                  <p style="margin:0;font-size:32px;font-weight:900;color:#eef0f7;letter-spacing:-1px;">+{{credits}} messages</p>
                </td></tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="border-radius:12px;background-color:#06d6c7;">
                  <a href="https://ephermal.app/dashboard.html" target="_blank"
                     style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#08080c;text-decoration:none;border-radius:12px;">
                    Back to dashboard →
                  </a>
                </td></tr>
              </table>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:28px 0 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
            <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy</a> &nbsp;·&nbsp;
            <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a> &nbsp;·&nbsp;
            <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
          </p>
          <p style="margin:0;font-size:11px;color:rgba(107,114,128,0.4);">© 2026 Interlink Platforms. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`,

ugc_video_topup_receipt: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
  <title>UGC Video Top-up Confirmed — Ephermal</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    body{margin:0!important;padding:0!important;background-color:#08080c;width:100%!important}
    @media screen and (max-width:600px){.email-container{width:100%!important}.card-pad{padding:32px 20px!important}}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    {{credits}} UGC video credits added to your account. Ready to generate.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr><td align="center" style="padding:40px 16px 60px;">
      <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="vertical-align:middle;"><img src="https://ephermal.app/ephermal.png" alt="Ephermal" width="36" height="36" style="display:block;width:36px;height:36px;border-radius:9px;border:0;"></td>
            <td style="padding-left:9px;vertical-align:middle;"><span style="font-size:22px;font-weight:800;color:#eef0f7;letter-spacing:-0.4px;">Ephermal</span></td>
          </tr></table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background-color:#0f0f13;border-radius:20px;border:1px solid rgba(52,211,153,0.25);overflow:hidden;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td style="height:3px;background:linear-gradient(90deg,#34d399,#06d6c7);"></td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td class="card-pad" style="padding:40px 44px 36px;">

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">
                <tr><td style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);border-radius:20px;padding:5px 14px;">
                  <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#34d399;">✓ Top-up Confirmed</span>
                </td></tr>
              </table>

              <h1 style="margin:0 0 16px;font-size:26px;font-weight:900;color:#eef0f7;letter-spacing:-0.6px;line-height:1.2;">
                {{credits}} UGC video credits added,<br>{{name}}.
              </h1>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr><td style="height:1px;background:rgba(52,211,153,0.15);"></td></tr>
              </table>

              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.75;">
                Your <strong style="color:#34d399;">{{credits}} UGC video credits</strong> are now live in your account. Each one generates a finished 15-second, 1080p video ad built from your real product catalog. They stack on top of your monthly allowance and never expire.
              </p>

              <!-- Credits added callout -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:32px;">
                <tr><td style="background:#1a1a1f;border-radius:14px;border-left:3px solid #34d399;padding:20px 24px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#34d399;">Added to your account</p>
                  <p style="margin:0;font-size:32px;font-weight:900;color:#eef0f7;letter-spacing:-1px;">+{{credits}} video credits</p>
                </td></tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="border-radius:12px;background-color:#06d6c7;">
                  <a href="https://ephermal.app/dashboard.html" target="_blank"
                     style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#08080c;text-decoration:none;border-radius:12px;">
                    Back to dashboard →
                  </a>
                </td></tr>
              </table>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:28px 0 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
            <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy</a> &nbsp;·&nbsp;
            <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a> &nbsp;·&nbsp;
            <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
          </p>
          <p style="margin:0;font-size:11px;color:rgba(107,114,128,0.4);">© 2026 Interlink Platforms. All rights reserved.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`,

plan_activated_starter: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Starter Plan Active — Ephermal</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
    body{margin:0!important;padding:0!important;background-color:#08080c;width:100%!important}
    @media screen and (max-width:600px){
      .email-container{width:100%!important}
      .card-pad{padding:32px 24px!important}
      .headline{font-size:26px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Your Starter plan is live. Here's what to do first.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr>
      <td align="center" style="padding:40px 16px 60px;">
        <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="https://ephermal.app/ephermal.png" alt="Ephermal" width="40" height="40"
                         style="display:block;width:40px;height:40px;border-radius:10px;border:0;">
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:24px;font-weight:800;color:#eef0f7;letter-spacing:-0.5px;">Ephermal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background-color:#0f0f13;border-radius:24px;border:1px solid rgba(6,214,199,0.18);overflow:hidden;">

              <!-- Accent bar -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr><td style="height:3px;background:linear-gradient(90deg,#06d6c7,#34d399);"></td></tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="card-pad" style="padding:48px 48px 40px;">

                    <!-- Plan badge -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background:rgba(6,214,199,0.12);border:1px solid rgba(6,214,199,0.3);border-radius:20px;padding:5px 14px;">
                          <span style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06d6c7;">Starter Plan · €89/mo</span>
                        </td>
                      </tr>
                    </table>

                    <h1 class="headline" style="margin:0 0 16px;font-size:30px;font-weight:900;color:#eef0f7;letter-spacing:-0.8px;line-height:1.2;">
                      You're live, {{name}}.<br>Let's make your first ad.
                    </h1>

                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
                      <tr><td style="height:1px;background:rgba(6,214,199,0.15);"></td></tr>
                    </table>

                    <p style="margin:0 0 18px;font-size:15px;color:#eef0f7;line-height:1.75;">
                      Your Starter plan is active. You have <strong style="color:#06d6c7;">15 AI script credits</strong> this month and your Meta Ads account is ready to connect.
                    </p>
                    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.75;">
                      Starter is where most brands discover what's possible. Connect your store, run your first analysis, generate your first UGC creative — and see what automated ad management actually feels like.
                    </p>

                    <!-- What's included -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:32px;">
                      <tr>
                        <td style="background-color:#1a1a1f;border-radius:14px;padding:24px;">
                          <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06d6c7;">What's included</p>
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr><td style="padding:6px 0;font-size:14px;color:#eef0f7;border-bottom:1px solid rgba(6,214,199,0.08);">
                              <span style="color:#34d399;margin-right:10px;">✓</span>1 Shopify store connection
                            </td></tr>
                            <tr><td style="padding:6px 0;font-size:14px;color:#eef0f7;border-bottom:1px solid rgba(6,214,199,0.08);">
                              <span style="color:#34d399;margin-right:10px;">✓</span>15 UGC creatives / month
                            </td></tr>
                            <tr><td style="padding:6px 0;font-size:14px;color:#eef0f7;border-bottom:1px solid rgba(6,214,199,0.08);">
                              <span style="color:#34d399;margin-right:10px;">✓</span>Meta Ads automation
                            </td></tr>
                            <tr><td style="padding:6px 0;font-size:14px;color:#eef0f7;border-bottom:1px solid rgba(6,214,199,0.08);">
                              <span style="color:#34d399;margin-right:10px;">✓</span>Campaign dashboard &amp; live ROAS
                            </td></tr>
                            <tr><td style="padding:6px 0;font-size:14px;color:#eef0f7;">
                              <span style="color:#34d399;margin-right:10px;">✓</span>Creative approval workflow
                            </td></tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:12px;">
                      <tr>
                        <td style="border-radius:12px;background-color:#06d6c7;">
                          <a href="https://ephermal.app/setup.html" target="_blank"
                             style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#08080c;text-decoration:none;border-radius:12px;">
                            Go to dashboard →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Upgrade nudge -->
                    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;text-align:center;">
                      When you're ready for AI strategy chat, Google Ads, and automated ROAS optimization —<br>
                      <a href="https://ephermal.app/dashboard.html" style="color:#06d6c7;text-decoration:none;font-weight:600;">upgrade to Growth for €199/mo</a>
                    </p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:32px 0 0;">
              <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
                <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a>
                &nbsp;·&nbsp;
                <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
              </p>
              <p style="margin:0;font-size:11px;color:rgba(107,114,128,0.4);">© 2026 Interlink Platforms. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,

plan_activated_growth: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Growth Plan Active — Ephermal</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
    body{margin:0!important;padding:0!important;background-color:#08080c;width:100%!important}
    @media screen and (max-width:600px){
      .email-container{width:100%!important}
      .card-pad{padding:32px 24px!important}
      .headline{font-size:26px!important}
      .unlock-cell{display:block!important;width:100%!important;margin-bottom:12px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Growth is live. AI strategy, Google Ads, ROAS optimizer — all unlocked. Here's where to start.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr>
      <td align="center" style="padding:40px 16px 60px;">
        <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="https://ephermal.app/ephermal.png" alt="Ephermal" width="40" height="40"
                         style="display:block;width:40px;height:40px;border-radius:10px;border:0;">
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:24px;font-weight:800;color:#eef0f7;letter-spacing:-0.5px;">Ephermal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background-color:#0f0f13;border-radius:24px;border:1px solid rgba(6,214,199,0.25);overflow:hidden;">

              <!-- Accent bar -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr><td style="height:4px;background:linear-gradient(90deg,#06d6c7,#34d399,#06d6c7);"></td></tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="card-pad" style="padding:48px 48px 40px;">

                    <!-- Plan badge -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background:rgba(6,214,199,0.14);border:1px solid rgba(6,214,199,0.4);border-radius:20px;padding:5px 14px;">
                          <span style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06d6c7;">⚡ Growth Plan · €199/mo</span>
                        </td>
                      </tr>
                    </table>

                    <h1 class="headline" style="margin:0 0 10px;font-size:30px;font-weight:900;color:#eef0f7;letter-spacing:-0.8px;line-height:1.2;">
                      Serious mode: activated,<br>{{name}}.
                    </h1>
                    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                      You just unlocked the full AI engine. This is where the gap between you and your competitors starts to widen.
                    </p>

                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
                      <tr><td style="height:1px;background:rgba(6,214,199,0.15);"></td></tr>
                    </table>

                    <!-- Unlocks grid — 2x3 -->
                    <p style="margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06d6c7;">What just unlocked</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:32px;">
                      <tr>
                        <td class="unlock-cell" width="48%" valign="top" style="padding-right:8px;padding-bottom:12px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td style="background:#1a1a1f;border:1px solid rgba(6,214,199,0.2);border-radius:12px;padding:16px 18px;">
                                <p style="margin:0 0 4px;font-size:20px;">🤖</p>
                                <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#eef0f7;">Ephermal AI</p>
                                <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Your Meta Ads strategist. Ask anything.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td class="unlock-cell" width="48%" valign="top" style="padding-left:8px;padding-bottom:12px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td style="background:#1a1a1f;border:1px solid rgba(6,214,199,0.2);border-radius:12px;padding:16px 18px;">
                                <p style="margin:0 0 4px;font-size:20px;">🏪</p>
                                <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#eef0f7;">Store Analysis</p>
                                <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Brand identity powering every creative.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td class="unlock-cell" width="48%" valign="top" style="padding-right:8px;padding-bottom:12px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td style="background:#1a1a1f;border:1px solid rgba(6,214,199,0.2);border-radius:12px;padding:16px 18px;">
                                <p style="margin:0 0 4px;font-size:20px;">📈</p>
                                <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#eef0f7;">ROAS Optimizer</p>
                                <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Auto-shifts budget to your winners.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td class="unlock-cell" width="48%" valign="top" style="padding-left:8px;padding-bottom:12px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td style="background:#1a1a1f;border:1px solid rgba(6,214,199,0.2);border-radius:12px;padding:16px 18px;">
                                <p style="margin:0 0 4px;font-size:20px;">🎯</p>
                                <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#eef0f7;">Google Ads</p>
                                <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Meta + Google in one dashboard.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td class="unlock-cell" width="48%" valign="top" style="padding-right:8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td style="background:#1a1a1f;border:1px solid rgba(6,214,199,0.2);border-radius:12px;padding:16px 18px;">
                                <p style="margin:0 0 4px;font-size:20px;">👥</p>
                                <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#eef0f7;">Audience Intel</p>
                                <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Pixel segments + lookalike builder.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td class="unlock-cell" width="48%" valign="top" style="padding-left:8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                              <td style="background:#1a1a1f;border:1px solid rgba(6,214,199,0.2);border-radius:12px;padding:16px 18px;">
                                <p style="margin:0 0 4px;font-size:20px;">🎬</p>
                                <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#eef0f7;">75 UGC Credits</p>
                                <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">5× more creatives every month.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Insight callout -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:32px;">
                      <tr>
                        <td style="background:#1a1a1f;border-radius:14px;border-left:3px solid #06d6c7;padding:20px 24px;">
                          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06d6c7;">Start here</p>
                          <p style="margin:0;font-size:14px;color:#eef0f7;line-height:1.65;">
                            Open <strong>Ephermal AI</strong> in your dashboard and ask: <em style="color:#06d6c7;">"Analyse my current campaigns and tell me where I'm losing money."</em> That one conversation usually pays for the plan.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:12px;">
                      <tr>
                        <td style="border-radius:12px;background-color:#06d6c7;">
                          <a href="https://ephermal.app/dashboard.html" target="_blank"
                             style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#08080c;text-decoration:none;border-radius:12px;">
                            Open dashboard →
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:8px 0 0;font-size:12px;color:#6b7280;text-align:center;">75 AI script credits and 18 UGC video ads this month</p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:32px 0 0;">
              <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
                <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a>
                &nbsp;·&nbsp;
                <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
              </p>
              <p style="margin:0;font-size:11px;color:rgba(107,114,128,0.4);">© 2026 Interlink Platforms. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,

plan_activated_scale: `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Scale Plan Active — Ephermal</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
    body{margin:0!important;padding:0!important;background-color:#08080c;width:100%!important}
    @media screen and (max-width:600px){
      .email-container{width:100%!important}
      .card-pad{padding:32px 24px!important}
      .headline{font-size:26px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;">

  <div style="display:none;font-size:1px;color:#08080c;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Scale is live. Bulk management and the full operator stack are yours.
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#08080c;">
    <tr>
      <td align="center" style="padding:40px 16px 60px;">
        <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="https://ephermal.app/ephermal.png" alt="Ephermal" width="40" height="40"
                         style="display:block;width:40px;height:40px;border-radius:10px;border:0;">
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:24px;font-weight:800;color:#eef0f7;letter-spacing:-0.5px;">Ephermal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card — teal accent for Scale -->
          <tr>
            <td style="background-color:#0f0f13;border-radius:24px;border:1px solid rgba(6,214,199,0.2);overflow:hidden;">

              <!-- Premium shimmer bar -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr><td style="height:4px;background:linear-gradient(90deg,#06d6c7,#34d399,#fbbf24,#06d6c7);"></td></tr>
              </table>

              <!-- Hero section with dark teal bg -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="background:linear-gradient(180deg,rgba(6,214,199,0.06) 0%,transparent 100%);padding:48px 48px 32px;">

                    <!-- Plan badge -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background:rgba(6,214,199,0.1);border:1px solid rgba(6,214,199,0.35);border-radius:20px;padding:5px 14px;">
                          <span style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06d6c7;">🚀 Scale Plan · €349/mo</span>
                        </td>
                      </tr>
                    </table>

                    <h1 class="headline" style="margin:0 0 12px;font-size:30px;font-weight:900;color:#eef0f7;letter-spacing:-0.8px;line-height:1.2;">
                      You're operating at<br>a different level now, {{name}}.
                    </h1>
                    <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.75;">
                      Scale is the plan for serious operators. 350 AI script credits a month and the bulk campaign manager — everything you need to run a high-volume ad operation without the chaos.
                    </p>

                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="card-pad" style="padding:0 48px 40px;">

                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
                      <tr><td style="height:1px;background:rgba(6,214,199,0.12);"></td></tr>
                    </table>

                    <!-- Key numbers -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
                      <tr>
                        <td align="center" width="50%" style="padding:16px;border-right:1px solid rgba(6,214,199,0.1);">
                          <p style="margin:0 0 4px;font-size:28px;font-weight:900;color:#34d399;letter-spacing:-1px;">350</p>
                          <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">UGC / month</p>
                        </td>
                        <td align="center" width="50%" style="padding:16px;">
                          <p style="margin:0 0 4px;font-size:28px;font-weight:900;color:#06d6c7;letter-spacing:-1px;">∞</p>
                          <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">AI Messages</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Exclusive features -->
                    <p style="margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06d6c7;">Scale-exclusive features</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:32px;background:#1a1a1f;border-radius:14px;overflow:hidden;">
                      <tr><td style="padding:16px 20px;font-size:14px;color:#eef0f7;border-bottom:1px solid rgba(6,214,199,0.08);">
                        <span style="color:#06d6c7;margin-right:10px;">✦</span><strong>Bulk campaign manager</strong> — mass actions across your campaigns
                      </td></tr>
                      <tr><td style="padding:16px 20px;font-size:14px;color:#eef0f7;">
                        <span style="color:#06d6c7;margin-right:10px;">✦</span><strong>Slack support</strong> — Direct line to the Ephermal team
                      </td></tr>
                    </table>

                    <!-- CTA -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:12px;">
                      <tr>
                        <td style="border-radius:12px;background-color:#06d6c7;">
                          <a href="https://ephermal.app/dashboard.html" target="_blank"
                             style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#08080c;text-decoration:none;border-radius:12px;">
                            Open dashboard →
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:8px 0 0;font-size:12px;color:#6b7280;text-align:center;">Questions? Reply to this email or ping us on Slack.</p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:32px 0 0;">
              <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">
                <a href="https://ephermal.app/privacy" style="color:#6b7280;text-decoration:none;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="https://ephermal.app/terms" style="color:#6b7280;text-decoration:none;">Terms</a>
                &nbsp;·&nbsp;
                <a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
              </p>
              <p style="margin:0;font-size:11px;color:rgba(107,114,128,0.4);">© 2026 Interlink Platforms. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,

};
