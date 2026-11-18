import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { PUBLIC_APP_URL } from '../config';

export interface ActiveLinkRegistration {
  targetId: string;
  imei?: string;
  token: string;
}

export interface ActiveLinkRecord {
  token: string;
  imei?: string;
  updatedAt: number;
}

export function resolveLinkApiBase(): string {
  if (typeof window === 'undefined') return PUBLIC_APP_URL.replace(/\/+$/, '');
  const host = window.location.hostname;
  if (
    Capacitor.isNativePlatform() ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    window.location.protocol === 'file:'
  ) {
    return PUBLIC_APP_URL.replace(/\/+$/, '');
  }
  return '';
}

export async function fetchActiveLinks(): Promise<Record<string, ActiveLinkRecord>> {
  const url = `${resolveLinkApiBase()}/api/links/active`;
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url,
        connectTimeout: 4000,
        readTimeout: 4000
      });
      if (res.status >= 200 && res.status < 300 && res.data?.links) {
        return res.data.links;
      }
      return {};
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return data?.links && typeof data.links === 'object' ? data.links : {};
    }
  } catch {}
  return {};
}

export async function registerActiveLinks(
  links: ActiveLinkRegistration[],
  options?: { onlyIfMissing?: boolean }
): Promise<Record<string, ActiveLinkRecord> | null> {
  if (!links || links.length === 0) return null;
  const url = `${resolveLinkApiBase()}/api/links/register`;
  const body = {
    links,
    onlyIfMissing: Boolean(options?.onlyIfMissing)
  };

  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.post({
        url,
        headers: { 'Content-Type': 'application/json' },
        data: body,
        connectTimeout: 5000,
        readTimeout: 5000
      });
      if (res.status >= 200 && res.status < 300) {
        return res.data?.links || null;
      }
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return data?.links || null;
    }
  } catch {}
  return null;
}

export async function validateActiveLink(params: {
  targetId: string;
  imei?: string;
  token: string;
}): Promise<{ valid: boolean; reason: string }> {
  const qs = new URLSearchParams({
    targetId: params.targetId || '',
    imei: params.imei || '',
    token: params.token || ''
  });
  const url = `${resolveLinkApiBase()}/api/links/validate?${qs.toString()}`;

  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url,
        connectTimeout: 4000,
        readTimeout: 4000
      });
      if (res.status >= 200 && res.status < 300 && typeof res.data?.valid === 'boolean') {
        return { valid: res.data.valid, reason: String(res.data.reason || 'ok') };
      }
      return { valid: true, reason: 'network_fallback' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.valid === 'boolean') {
        return { valid: data.valid, reason: String(data.reason || 'ok') };
      }
    }
  } catch {}
  return { valid: true, reason: 'network_fallback' };
}
