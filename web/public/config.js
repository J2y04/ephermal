(function () {
  // PUBLISHABLE key — safe in client code. Never put sk_... here.
  window.CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuZXBoZXJtYWwuYXBwJA';

  // API base URL — fallback when cache-proxy is unavailable (not normally used)
  window.API_BASE = 'https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1';

  // Cache proxy Edge Function — routes all API calls through Redis + Supabase functions
  window.CACHE_PROXY_URL = 'https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/cache-proxy';

  // Meta (Facebook) App ID — create at developers.facebook.com → My Apps → Create App
  // Set "App Domain" to ephermal.app and add "Facebook Login" product
  window.META_APP_ID = '1504672747779574';
  // META_APP_SECRET must NEVER go here — set it only in n8n environment variables

  // Meta OAuth callback — Supabase Edge Function that receives the code from Meta and exchanges it for a token
  // Add this URL to your Meta app: Facebook Login → Settings → Valid OAuth Redirect URIs
  window.META_CALLBACK_URL = 'https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/meta-oauth-callback';

  // Google OAuth Client ID — create at console.cloud.google.com → APIs & Services → Credentials
  // Add https://ephermal.app and https://ephermal.app/setup.html to "Authorized JavaScript origins"
  window.GOOGLE_OAUTH_CLIENT_ID = '678288442294-2jush076ag5ltauja1aq6njdp96tvtm3.apps.googleusercontent.com';

  // Supabase — replace with your project values (safe to expose — RLS protects data)
  window.SUPABASE_URL = 'https://twfgnqddoqeqrjhgioxd.supabase.co';
  window.SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZmducWRkb3FlcXJqaGdpb3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTk3MjMsImV4cCI6MjA5NTE5NTcyM30.Qosoe62X7ZyPEArhm5Tbg2p97LBo8KQ5NQu9SsqE8k4';

  // Stripe payment links — fallback if Edge Function checkout is unavailable
  window.STRIPE_LINKS = {
    starter:   'https://buy.stripe.com/REPLACE_STARTER',
    growth:    'https://buy.stripe.com/REPLACE_GROWTH',
    scale:     'https://buy.stripe.com/REPLACE_SCALE',
    ai_topup:  'https://buy.stripe.com/REPLACE_AI_TOPUP',  // $5 = 50 AI messages
  };

  // Stripe Price IDs — used by create-checkout Edge Function for server-side sessions
  // Replace these with your actual Price IDs from Stripe Dashboard → Products
  window.STRIPE_PRICES = {
    starter:    'price_REPLACE_STARTER',   // $89/mo recurring
    growth:     'price_REPLACE_GROWTH',    // $199/mo recurring
    scale:      'price_REPLACE_SCALE',     // $349/mo recurring
    topup_5:    'price_REPLACE_TOPUP5',    // $5 one-time = 50 AI messages
    topup_10:   'price_REPLACE_TOPUP10',   // $10 one-time = 120 AI messages
    topup_20:   'price_REPLACE_TOPUP20',   // $20 one-time = 280 AI messages
  };

  // Supabase Edge Function base (auto-constructed from SUPABASE_URL after it's set below)
  window.SUPABASE_FN = 'https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1';

  // Shopify app credentials — set these after creating your Shopify Partner app
  window.SHOPIFY_APP_KEY = '1be2b522a704c34e1949034e774cf34d';
  // Supabase Edge Function for Shopify OAuth callback
  window.SHOPIFY_CALLBACK_URL = 'https://twfgnqddoqeqrjhgioxd.supabase.co/functions/v1/shopify-oauth-callback';
  // Where n8n sends the user back after OAuth completes
  window.SHOPIFY_SETUP_RETURN_URL = 'https://ephermal.app/setup.html';

  // Client-side rate limiter — real protection must be at CDN/backend level
  const _buckets = {};
  window.RateLimit = {
    check(key, maxPerMinute) {
      const max = maxPerMinute || 20;
      const now = Date.now();
      _buckets[key] = (_buckets[key] || []).filter(t => now - t < 60000);
      if (_buckets[key].length >= max) throw new Error('Rate limit exceeded — please wait a moment.');
      _buckets[key].push(now);
    },
    remaining(key, maxPerMinute) {
      const max = maxPerMinute || 20;
      const now = Date.now();
      _buckets[key] = (_buckets[key] || []).filter(t => now - t < 60000);
      return Math.max(0, max - (_buckets[key] || []).length);
    },
  };
})();
