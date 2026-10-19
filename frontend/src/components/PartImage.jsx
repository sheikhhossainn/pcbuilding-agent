import { useState } from 'react';

// Product photo, or `fallback` when there is none or it fails to load. Some stores (Ryans) put
// their images behind Cloudflare and a same-origin policy, so the browser gets a 403 instead.
export default function PartImage({ src, className, fallback }) {
  // Remembered per URL, so swapping to another part tries its photo again.
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) return fallback;
  return <img src={src} alt="" className={className} onError={() => setFailedSrc(src)} />;
}
