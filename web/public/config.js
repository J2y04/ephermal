(function () {
  // PUBLISHABLE key — safe in client code. Never put sk_... here.
  window.CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuZXBoZXJtYWwuYXBwJA';

  // API base URL — hardcoded, NOT user-controllable via localStorage (prevents JWT theft)
  window.API_BASE = 'https://jamhich.de/webhook/ephermal';

  // Meta (Facebook) App ID — create at developers.facebook.com → My Apps → Create App
  // Set "App Domain" to ephermal.app and add "Facebook Login" product
  window.META_APP_ID = '37434197291344952';

  // Meta OAuth callback — n8n webhook that receives the code from Meta and exchanges it for a token
  // Add this URL to your Meta app: Facebook Login → Settings → Valid OAuth Redirect URIs
  window.META_CALLBACK_URL = 'https://jamhich.de/webhook/ephermal/meta/callback';

  // Google OAuth Client ID — create at console.cloud.google.com → APIs & Services → Credentials
  // Add https://ephermal.app and https://ephermal.app/setup.html to "Authorized JavaScript origins"
  window.GOOGLE_OAUTH_CLIENT_ID = '678288442294-2jush076ag5ltauja1aq6njdp96tvtm3.apps.googleusercontent.com';

  // Supabase — replace with your project values (safe to expose — RLS protects data)
  window.SUPABASE_URL = 'https://twfgnqddoqeqrjhgioxd.supabase.co';
  window.SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZmducWRkb3FlcXJqaGdpb3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTk3MjMsImV4cCI6MjA5NTE5NTcyM30.Qosoe62X7ZyPEArhm5Tbg2p97LBo8KQ5NQu9SsqE8k4';

  // Stripe payment links — replace with your actual Stripe payment links
  window.STRIPE_LINKS = {
    starter: 'https://buy.stripe.com/REPLACE_STARTER',
    growth: 'https://buy.stripe.com/REPLACE_GROWTH',
    scale: 'https://buy.stripe.com/REPLACE_SCALE',
  };

  // Shopify app credentials — set these after creating your Shopify Partner app
  window.SHOPIFY_APP_KEY = '1be2b522a704c34e1949034e774cf34d';
  // n8n webhook URL for Shopify OAuth callback (workflow 14)
  window.SHOPIFY_CALLBACK_URL = 'https://jamhich.de/webhook/ephermal/shopify/callback';
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
