import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

const bytes = (buffer: Buffer): Uint8Array<ArrayBuffer> => new Uint8Array(buffer);

interface KeyMaterial {
  privateKey: KeyObject;
  x: string;
  y: string;
  credentialId: Buffer;
}

/**
 * Software WebAuthn authenticator used ONLY by the automated tests. It emulates a platform
 * authenticator (Windows Hello) that verified the user (UV flag), producing the same JSON that
 * @simplewebauthn/browser sends. It is never shipped with the application.
 */
export class SoftAuthenticator {
  private readonly keys: KeyMaterial;
  counter = 0;

  constructor(
    private readonly origin: string,
    private readonly rpId: string,
    private readonly userVerified = true,
    keys?: KeyMaterial,
  ) {
    if (keys) {
      this.keys = keys;
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
      this.keys = { privateKey, x: jwk.x, y: jwk.y, credentialId: randomBytes(32) };
    }
  }

  /** Same credential, but the device reports that the user was NOT verified (no fingerprint). */
  withoutUserVerification(): SoftAuthenticator {
    const clone = new SoftAuthenticator(this.origin, this.rpId, false, this.keys);
    clone.counter = this.counter;
    return clone;
  }

  get id(): string {
    return isoBase64URL.fromBuffer(bytes(this.keys.credentialId));
  }

  private flags(attested: boolean): number {
    let flags = 0x01; // user present
    if (this.userVerified) flags |= 0x04; // user verified (fingerprint on the device)
    if (attested) flags |= 0x40;
    return flags;
  }

  private authData(attested: boolean): Buffer {
    const rpIdHash = createHash('sha256').update(this.rpId).digest();
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const parts: Buffer[] = [rpIdHash, Buffer.from([this.flags(attested)]), counter];
    if (attested) {
      const cose = new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, isoBase64URL.toBuffer(this.keys.x)],
        [-3, isoBase64URL.toBuffer(this.keys.y)],
      ]);
      const idLength = Buffer.alloc(2);
      idLength.writeUInt16BE(this.keys.credentialId.length);
      parts.push(Buffer.alloc(16), idLength, this.keys.credentialId, Buffer.from(isoCBOR.encode(cose)));
    }
    return Buffer.concat(parts);
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }

  /** Response to navigator.credentials.create() */
  register(options: { challenge: string }) {
    const clientDataJSON = this.clientData('webauthn.create', options.challenge);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', bytes(this.authData(true))],
      ]) as never,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(bytes(clientDataJSON)),
        attestationObject: isoBase64URL.fromBuffer(bytes(Buffer.from(attestationObject))),
        transports: ['internal'],
      },
    };
  }

  /** Response to navigator.credentials.get() */
  authenticate(options: { challenge: string }, overrides: { counter?: number } = {}) {
    this.counter = overrides.counter ?? this.counter + 1;
    const authenticatorData = this.authData(false);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge);
    const signature = sign(
      'sha256',
      Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()]),
      this.keys.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(bytes(clientDataJSON)),
        authenticatorData: isoBase64URL.fromBuffer(bytes(authenticatorData)),
        signature: isoBase64URL.fromBuffer(bytes(signature)),
      },
    };
  }
}
