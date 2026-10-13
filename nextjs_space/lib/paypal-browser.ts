'use client';

let loading: Promise<void> | null = null;

/** Public live PayPal app id. Next inlines NEXT_PUBLIC_PAYPAL_CLIENT_ID; the server can pass PAYPAL_CLIENT_ID. */
export function paypalPublicClientId(clientId?: string): string {
  return (clientId || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '').trim();
}

/**
 * Loads the PayPal JS SDK for subscription checkout on web and the phone webview.
 * A missing client id, or a failed script, resolves without throwing so checkout
 * can still use the server REST approval redirect.
 */
export function loadPaypalSdk(clientId?: string): Promise<void> {
  const id = paypalPublicClientId(clientId);
  if (typeof document === 'undefined') return Promise.resolve();
  if (!id) {
    console.error('PayPal SDK missing live PAYPAL_CLIENT_ID');
    return Promise.resolve();
  }
  if (document.querySelector('script[data-paypal-sdk="1"]')) return loading ?? Promise.resolve();
  loading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.dataset.paypalSdk = '1';
    script.async = true;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(id)}&vault=true&intent=subscription&currency=USD`;
    script.onload = () => resolve();
    script.onerror = () => {
      console.error('PayPal live SDK failed to load');
      loading = null;
      resolve();
    };
    document.head.appendChild(script);
  });
  return loading;
}
