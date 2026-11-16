import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { PUBLIC_APP_URL } from '../config';

const STORAGE_PREFIX = 'short_url_cache_v1_';

function shortenViaJsonp(longUrl: string, timeoutMs = 5000): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const cbName = `__isgd_cb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      try {
        delete (window as any)[cbName];
      } catch {
        (window as any)[cbName] = undefined;
      }
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(null);
      }
    }, timeoutMs);

    (window as any)[cbName] = (data: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      const short = typeof data?.shorturl === 'string' ? data.shorturl.trim() : '';
      resolve(short.startsWith('http') ? short : null);
    };

    script.src = `https://is.gd/create.php?format=json&callback=${cbName}&url=${encodeURIComponent(longUrl)}`;
    script.async = true;
    script.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(null);
      }
    };
    document.head.appendChild(script);
  });
}

async function shortenViaCapacitorNative(longUrl: string): Promise<string | null> {
  try {
    const res = await CapacitorHttp.get({
      url: `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`,
      connectTimeout: 5000,
      readTimeout: 5000
    });
    const text = typeof res.data === 'string' ? res.data.trim() : '';
    if (res.status >= 200 && res.status < 300 && (text.startsWith('https://is.gd/') || text.startsWith('http://is.gd/'))) {
      return text;
    }
  } catch {}

  try {
    const res2 = await CapacitorHttp.get({
      url: `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
      connectTimeout: 5000,
      readTimeout: 5000
    });
    const text2 = typeof res2.data === 'string' ? res2.data.trim() : '';
    if (res2.status >= 200 && res2.status < 300 && (text2.startsWith('https://tinyurl.com/') || text2.startsWith('http://tinyurl.com/'))) {
      return text2;
    }
  } catch {}

  return null;
}

export async function shortenUrl(
  longUrl: string,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  if (!longUrl) return longUrl;

  const forceRefresh = Boolean(options?.forceRefresh);

  if (forceRefresh) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + longUrl);
    } catch {}
  } else {
    try {
      const cached = localStorage.getItem(STORAGE_PREFIX + longUrl);
      if (cached && cached.length < longUrl.length) {
        return cached;
      }
    } catch {}
  }

  const saveAndReturn = (short: string): string => {
    try {
      localStorage.setItem(STORAGE_PREFIX + longUrl, short);
    } catch {}
    return short;
  };

  // 1. Native Android/iOS APK: use CapacitorHttp (completely bypasses WebView CORS)
  if (Capacitor.isNativePlatform()) {
    const nativeShort = await shortenViaCapacitorNative(longUrl);
    if (nativeShort && nativeShort.length < longUrl.length) {
      return saveAndReturn(nativeShort);
    }
  }

  // 2. Backend proxy (/api/shorten)
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
          return saveAndReturn(data.shortUrl);
        }
      }
    }
  } catch {}

  // 3. Universal JSONP fallback via is.gd (works across CORS-restricted WebViews & browsers)
  const jsonpShort = await shortenViaJsonp(longUrl);
  if (jsonpShort && jsonpShort.length < longUrl.length) {
    return saveAndReturn(jsonpShort);
  }

  return longUrl;
}
