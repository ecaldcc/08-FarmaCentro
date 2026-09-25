/**
 * E-mail through Brevo's HTTPS API (https://developers.brevo.com/reference/sendtransacemail).
 * Used in production because Render's free instances block outbound SMTP (ports 25/465/587).
 */
export const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export interface Sender {
  name: string;
  email: string;
}

/** Parses "FarmaCentro <no-reply@example.com>" or a bare address. */
export function parseSender(from: string): Sender {
  const match = /^\s*(.*?)\s*<\s*([^>\s]+)\s*>\s*$/.exec(from);
  if (match?.[2]) return { name: match[1] || 'FarmaCentro', email: match[2] };
  return { name: 'FarmaCentro', email: from.trim() };
}

export async function sendViaBrevo(
  apiKey: string,
  sender: Sender,
  message: { to: string; subject: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(BREVO_ENDPOINT, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender,
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Only the status is reported: never the API key nor the message body (it may contain a code).
    throw new Error(`Brevo rejected the e-mail (HTTP ${res.status})`);
  }
}
