export type PaypalCredentialPair = {
  id: string;
  secret: string;
  idName: string;
  secretName: string;
};

function cleanEnv(name: string): string {
  return (process.env[name] ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim().replace(/\s+/g, '');
}

/** Complete id/secret pairs only. A new id is never sent with an older secret. */
export function paypalCredentialPairs(): PaypalCredentialPair[] {
  const specs = [
    ['paypal_client_ID', 'paypal_client_secret'],
    ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
  ] as const;
  const pairs: PaypalCredentialPair[] = [];
  for (const [idName, secretName] of specs) {
    const id = cleanEnv(idName);
    const secret = cleanEnv(secretName);
    if (id && secret) pairs.push({ id, secret, idName, secretName });
  }
  return pairs;
}

export function paypalPublicClientId(): string {
  return paypalCredentialPairs()[0]?.id || cleanEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID');
}
