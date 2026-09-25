import { useState } from 'react';
import { http } from '../../api/http';
import type { ChainVerification } from '../../api/types';
import { Alert, Button, ErrorAlert, PageHeader } from '../../components/ui';

const REASONS = { hash: 'un registro fue modificado', prevHash: 'se rompió el enlace con el registro anterior', gap: 'falta un registro' };

/** U2 — Hash chain verification. The last seq/hash is the anchor to write down outside the system. */
export function VerifyChainPage() {
  const [result, setResult] = useState<ChainVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await http.get<ChainVerification>('/audit/verify'));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Verificación de integridad" subtitle="Recalcula el hash SHA-256 de cada registro y comprueba el encadenamiento." />
      <section className="card narrow stack">
        <Button onClick={() => void verify()} busy={busy}>
          Verificar cadena
        </Button>
        <ErrorAlert error={error} />
        {result &&
          (result.ok ? (
            <Alert kind="success">
              <strong>Cadena íntegra.</strong> {result.checked} registros verificados.
            </Alert>
          ) : (
            <Alert kind="error">
              <strong>Cadena rota en el registro #{result.brokenAtSeq}</strong>: {result.reason ? REASONS[result.reason] : ''}. Reporta
              este hallazgo.
            </Alert>
          ))}
        {result?.ok && result.lastHash && (
          <div className="anchor">
            <p>Ancla para anotar fuera del sistema (acta o correo al equipo):</p>
            <p>
              <strong>seq:</strong> {result.lastSeq}
            </p>
            <p>
              <strong>hash:</strong> <code className="hash">{result.lastHash}</code>
            </p>
            <p className="muted small">
              Si en una verificación posterior este registro ya no existe o su hash cambió, la bitácora fue alterada.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
