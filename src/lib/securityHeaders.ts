/**
 * Response hardening headers, built per request so the CSP can carry a fresh nonce.
 *
 * The nonce is what makes the policy worth having: with `'strict-dynamic'`, only
 * scripts Next.js stamps with this request's nonce execute, so an injected
 * `<script>` is inert even if it reaches the HTML. Next reads the nonce from the
 * CSP header on the incoming request, which the middleware forwards.
 *
 * `style-src` keeps `'unsafe-inline'`: a nonce cannot apply to a `style="..."`
 * attribute, and the UI sets status and environment colours that way throughout.
 * Style injection is a much narrower problem than script injection.
 *
 * Pure so the policy is unit-testable, and free of Node built-ins so it can run in
 * the edge middleware.
 */
export function securityHeaders({ nonce, production }: { nonce: string; production: boolean }): Record<string, string> {
  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' in development only: Next's Fast Refresh runtime
    // (@next/react-refresh-utils) evaluates strings, and the policy without it
    // throws an EvalError while main-app.js is still initialising — which kills
    // hydration for the whole page, leaving every client component inert. A
    // production build ships no react-refresh, so the escape hatch never reaches
    // a deployed instance.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  return {
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    // Only meaningful over TLS, and pinning it from a plain-http dev server would
    // make localhost unreachable in that browser for a year.
    ...(production ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
  };
}

/** A fresh, edge-safe nonce for one response. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
