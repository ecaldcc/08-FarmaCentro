import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiError, http } from '../api/http';
import type { SecondFactorMethod } from '../api/types';
import { Alert, Button, ErrorAlert, Field, Modal } from '../components/ui';
import { describeWebAuthnError, signChallenge, webauthnSupported } from './webauthn';

export interface StepUpRequest {
  action: string;
  targetId: string | null;
  label: string;
}

interface StepUpContextValue {
  /** Runs `operation`; if the API answers STEP_UP_REQUIRED, asks for the second factor and retries once. */
  withStepUp: <T>(request: StepUpRequest, operation: () => Promise<T>) => Promise<T>;
}

const StepUpContext = createContext<StepUpContextValue | null>(null);

interface Pending extends StepUpRequest {
  /** Methods the API accepts for this action and user (from the STEP_UP_REQUIRED answer). */
  methods: SecondFactorMethod[];
  resolve: () => void;
  reject: (error: Error) => void;
}

export class StepUpCancelled extends Error {
  constructor() {
    super('Operación cancelada: no se confirmó la identidad.');
  }
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const ask = useCallback(
    (request: StepUpRequest, methods: SecondFactorMethod[]) =>
      new Promise<void>((resolve, reject) => {
        const entry = { ...request, methods, resolve, reject };
        pendingRef.current = entry;
        setPending(entry);
      }),
    [],
  );

  const withStepUp = useCallback(
    async <T,>(request: StepUpRequest, operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'STEP_UP_REQUIRED') throw error;
        await ask(request, (error.extra.methods as SecondFactorMethod[] | undefined) ?? []);
        return operation();
      }
    },
    [ask],
  );

  const close = (ok: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (ok) current?.resolve();
    else current?.reject(new StepUpCancelled());
  };

  return (
    <StepUpContext.Provider value={{ withStepUp }}>
      {children}
      {pending && <StepUpModal request={pending} onDone={() => close(true)} onCancel={() => close(false)} />}
    </StepUpContext.Provider>
  );
}

export function useStepUp(): StepUpContextValue {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error('useStepUp must be used inside StepUpProvider');
  return ctx;
}

/** C6 — "Esta operación requiere confirmar tu identidad". */
function StepUpModal({ request, onDone, onCancel }: { request: Pending; onDone: () => void; onCancel: () => void }) {
  const allowEmail = request.methods.includes('email_otp');
  const hasTotp = request.methods.includes('totp');
  const hasFingerprint = request.methods.includes('webauthn');
  const [appCode, setAppCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const target = { action: request.action, targetId: request.targetId };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof ApiError ? e : new Error(describeWebAuthnError(e)));
    } finally {
      setBusy(false);
    }
  };

  const useFingerprint = () =>
    run(async () => {
      const response = await signChallenge('/auth/step-up/webauthn/options', target);
      await http.post('/auth/step-up/webauthn/verify', { response });
      onDone();
    });

  const verifyAppCode = () =>
    run(async () => {
      await http.post('/auth/step-up/totp/verify', { ...target, code: appCode });
      onDone();
    });

  const sendCode = () =>
    run(async () => {
      const res = await http.post<{ sentTo: string }>('/auth/step-up/email-otp/send', target);
      setCodeSentTo(res.sentTo);
    });

  const verifyCode = () =>
    run(async () => {
      await http.post('/auth/step-up/email-otp/verify', { ...target, code });
      onDone();
    });

  return (
    <Modal title="Confirma tu identidad" onClose={busy ? undefined : onCancel}>
      <p>
        La operación <strong>{request.label}</strong> requiere volver a verificar tu identidad. El permiso sirve para una
        sola operación y vence en 2 minutos.
      </p>
      {hasTotp && (
        <div className="stack">
          <Field label="Código de tu app autenticadora">
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={appCode}
                onChange={(e) => setAppCode(e.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>
          <Button onClick={verifyAppCode} disabled={appCode.length !== 6} busy={busy}>
            Confirmar
          </Button>
        </div>
      )}
      {hasFingerprint && webauthnSupported() && (
        <Button variant={hasTotp ? 'secondary' : 'primary'} onClick={useFingerprint} busy={busy}>
          Usar mi huella
        </Button>
      )}
      {request.methods.length === 0 && (
        <Alert kind="warning">
          Las operaciones críticas se confirman con la app autenticadora.{' '}
          <Link to="/mi-cuenta" onClick={onCancel}>
            Configúrala en Mi cuenta
          </Link>{' '}
          y vuelve a intentarlo.
        </Alert>
      )}
      {allowEmail && (
        <Alert kind="info">Como aún no tienes app autenticadora ni huella, esta vez confirmas con un código por correo.</Alert>
      )}
      {allowEmail && (
        <div className="stack">
          {!codeSentTo ? (
            <Button variant="secondary" onClick={sendCode} busy={busy}>
              Enviarme un código por correo
            </Button>
          ) : (
            <>
              <Alert kind="info">Enviamos un código de 6 dígitos a {codeSentTo}. Vence en 5 minutos.</Alert>
              <Field label="Código de verificación">
                {(id) => (
                  <input
                    id={id}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                )}
              </Field>
              <Button onClick={verifyCode} disabled={code.length !== 6} busy={busy}>
                Confirmar
              </Button>
            </>
          )}
        </div>
      )}
      <ErrorAlert error={error} />
      <div className="modal-footer-inline">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}
