import { PUBLIC_APP_URL } from '../config';

const STORAGE_PREFIX = 'short_url_cache_v1_';

export async function shortenUrl(
  longUrl: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  if (!longUrl) return longUrl;

  const forceRefresh = Boolean(options?.forceRefresh);

  if (forceRefresh) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + longUrl);
    } catch (e) {}
  } else {
    try {
      const cached = localStorage.getItem(STORAGE_PREFIX + longUrl);
      if (cached && cached.length < longUrl.length) {
        return cached;
      }
    } catch (e) {}
  }

  try {
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const apiBase = isLocalhost ? PUBLIC_APP_URL.replace(/\/+$/, '') : '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const freshParam = forceRefresh ? '&fresh=1' : '';
    const res = await fetch(`${apiBase}/api/shorten?url=${encodeURIComponent(longUrl)}${freshParam}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data?.shortUrl && typeof data.shortUrl === 'string' && data.shortUrl.startsWith('http')) {
        if (data.shortUrl.length < longUrl.length) {
          try {
            localStorage.setItem(STORAGE_PREFIX + longUrl, data.shortUrl);
          } catch (e) {}
          return data.shortUrl;
        }
      }
    }
  } catch (e) {
    // Fallback to original URL silently
  }

  return longUrl;
}
