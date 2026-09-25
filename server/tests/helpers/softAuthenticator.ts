import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

/**
 * Software WebAuthn authenticator used ONLY by the automated tests. It emulates a platform
 * authenticator (Windows Hello) that verified the user (UV flag), producing the same JSON that
 * @simplewebauthn/browser sends. It is never shipped with the application.
 */
export class SoftAuthenticator {
  private readonly privateKey: KeyObject;
  private readonly publicJwk: { x: string; y: string };
  readonly credentialId: Buffer = randomBytes(32);
  counter = 0;

  constructor(
    private readonly origin: string,
    private readonly rpId: string,
    private readonly userVerified = true,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    this.publicJwk = { x: jwk.x, y: jwk.y };
  }

  get id(): string {
    return isoBase64URL.fromBuffer(this.credentialId);
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
    const parts = [rpIdHash, Buffer.from([this.flags(attested)]), counter];
    if (attested) {
      const cose = new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, isoBase64URL.toBuffer(this.publicJwk.x)],
        [-3, isoBase64URL.toBuffer(this.publicJwk.y)],
      ]);
      const idLength = Buffer.alloc(2);
      idLength.writeUInt16BE(this.credentialId.length);
      parts.push(Buffer.alloc(16), idLength, this.credentialId, Buffer.from(isoCBOR.encode(cose)));
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
        ['authData', new Uint8Array(this.authData(true))],
      ]) as never,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
        attestationObject: isoBase64URL.fromBuffer(Buffer.from(attestationObject)),
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
      this.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
        authenticatorData: isoBase64URL.fromBuffer(authenticatorData),
        signature: isoBase64URL.fromBuffer(signature),
      },
    };
  }
}
