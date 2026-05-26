(function () {
  // PUBLISHABLE key — safe in client code. Never put sk_... here.
  window.CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuZXBoZXJtYWwuYXBwJA';

  // API base URL — hardcoded, NOT user-controllable via localStorage (prevents JWT theft)
  window.API_BASE = 'https://YOUR_BACKEND/webhook/ephermal';

  // Supabase — replace with your project values (safe to expose — RLS protects data)
  window.SUPABASE_URL = 'https://twfgnqddoqeqrjhgioxd.supabase.co';
  window.SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZmducWRkb3FlcXJqaGdpb3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MTk3MjMsImV4cCI6MjA5NTE5NTcyM30.Qosoe62X7ZyPEArhm5Tbg2p97LBo8KQ5NQu9SsqE8k4';

  // Stripe payment links — replace with your actual Stripe payment links
  window.STRIPE_LINKS = {
    starter: 'https://buy.stripe.com/REPLACE_STARTER',
    growth: 'https://buy.stripe.com/REPLACE_GROWTH',
    scale: 'https://buy.stripe.com/REPLACE_SCALE',
  };

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
