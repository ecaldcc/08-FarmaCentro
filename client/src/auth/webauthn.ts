import { startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser';
import { http } from '../api/http';

export function webauthnSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

/** Human message for browser-side WebAuthn failures (cancelled prompt, no reader, etc.). */
export function describeWebAuthnError(error: unknown): string {
  if (error instanceof WebAuthnError) {
    if (error.code === 'ERROR_CEREMONY_ABORTED') return 'Se canceló la verificación.';
    return 'El dispositivo no pudo verificar tu huella.';
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Se canceló la verificación o se agotó el tiempo.';
  }
  return error instanceof Error ? error.message : 'No se pudo completar la verificación.';
}

type AuthOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];
type RegOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];

/** Asks the authenticator (Windows Hello) to sign the challenge obtained from `optionsPath`. */
export async function signChallenge(optionsPath: string, optionsBody: unknown = {}) {
  const optionsJSON = await http.post<AuthOptions>(optionsPath, optionsBody);
  return startAuthentication({ optionsJSON });
}

export async function createCredential(nickname: string) {
  const optionsJSON = await http.post<RegOptions>('/me/webauthn/register/options', { nickname });
  return startRegistration({ optionsJSON });
}
