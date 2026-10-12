'use client';

let loading: Promise<void> | null = null;

/** Public PayPal app id. Next inlines this only from the direct env read. */
export function paypalPublicClientId(): string {
  return process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ?? '';
}

/**
 * Loads the PayPal JS SDK for subscription checkout on web and the phone webview.
 * A missing client id, or a failed script, resolves without throwing so checkout
 * can still use the server REST approval redirect.
 */
export function loadPaypalSdk(): Promise<void> {
  const clientId = paypalPublicClientId();
  if (!clientId || typeof document === 'undefined') return Promise.resolve();
  if (document.querySelector('script[data-paypal-sdk="1"]')) return loading ?? Promise.resolve();
  loading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.dataset.paypalSdk = '1';
    script.async = true;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription&currency=USD`;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      resolve();
    };
    document.head.appendChild(script);
  });
  return loading;
}
