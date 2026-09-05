"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
// Bundled by the build rather than linked from public/: webpack fingerprints it
// and it goes out under our own origin, which style-src 'self' already allows.
import "swagger-ui-dist/swagger-ui.css";

declare global {
  interface Window {
    SwaggerUIBundle?: (opts: { url: string; dom_id: string }) => unknown;
  }
}

/**
 * Swagger UI, served from our own origin.
 *
 * next/script rather than a raw tag: the CSP carries 'strict-dynamic', under
 * which host allowlists — 'self' included — are ignored and only a script
 * bearing the request's nonce runs. Next stamps that nonce on the scripts it
 * renders; a hand-written <script> gets none and is refused.
 *
 * The previous page put its markup through dangerouslySetInnerHTML, which
 * cannot work either way: scripts inserted through innerHTML never execute.
 */
export function SwaggerUI({ specUrl }: { specUrl: string }) {
  const started = useRef(false);

  // Covers the case where the bundle is already cached and the load event has
  // fired before this mounts.
  useEffect(() => {
    if (!started.current && window.SwaggerUIBundle) {
      started.current = true;
      window.SwaggerUIBundle({ url: specUrl, dom_id: "#swagger-ui" });
    }
  }, [specUrl]);

  return (
    <>
      <div id="swagger-ui" />
      <Script
        src="/swagger/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (started.current) return;
          started.current = true;
          window.SwaggerUIBundle?.({ url: specUrl, dom_id: "#swagger-ui" });
        }}
      />
    </>
  );
}
