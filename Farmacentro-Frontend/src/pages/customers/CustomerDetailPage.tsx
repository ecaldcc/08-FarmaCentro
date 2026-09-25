import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { http } from '../../api/http';
import type { CustomerDetail } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Badge, Button, DateTime, ErrorAlert, Field, Loading, Modal, PageHeader, ReasonDialog } from '../../components/ui';

/** K6 — Customer detail (every view is audited), rectification and consent withdrawal. */
export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => setCustomer(await http.get<CustomerDetail>(`/customers/${id}`)), [id]);
  useEffect(() => {
    load().catch(setError);
  }, [load]);

  if (error && !customer) return <ErrorAlert error={error} />;
  if (!customer) return <Loading />;

  return (
    <>
      <PageHeader
        title={customer.fullName}
        subtitle="La consulta de este detalle queda registrada en la bitácora."
        actions={
          customer.status === 'active' && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Corregir datos
              </Button>
              {can('customers.withdrawConsent') && (
                <Button variant="danger" onClick={() => setWithdrawing(true)}>
                  Retiro de consentimiento
                </Button>
              )}
            </>
          )
        }
      />
      {customer.status === 'withdrawn' && <Alert kind="warning">El cliente retiró su consentimiento: sus datos fueron anonimizados.</Alert>}
      <div className="grid-2">
        <section className="card">
          <dl className="details">
            <dt>Teléfono</dt>
            <dd>{customer.phone ?? '—'}</dd>
            <dt>Correo</dt>
            <dd>{customer.email ?? '—'}</dd>
            <dt>Puntos</dt>
            <dd>
              <Badge tone="info">{customer.pointsBalance}</Badge>
            </dd>
            <dt>Consentimiento</dt>
            <dd>
              Aviso {customer.consent.noticeVersion}, aceptado el <DateTime value={customer.consent.acceptedAt} />
            </dd>
          </dl>
        </section>
        <section className="card">
          <h2>Movimientos de puntos</h2>
          {customer.pointsHistory.length === 0 ? (
            <p className="muted">Sin movimientos.</p>
          ) : (
            <ul className="list">
              {customer.pointsHistory.map((m) => (
                <li key={m.id}>
                  <span>
                    <DateTime value={m.createdAt} /> · {m.type === 'earn' ? 'Acumulación' : 'Reversión por anulación'}
                  </span>
                  <strong>{m.points > 0 ? `+${m.points}` : m.points}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {editing && <EditCustomerDialog customer={customer} onClose={() => setEditing(false)} onSaved={setCustomer} />}
      {withdrawing && (
        <ReasonDialog
          title="Registrar retiro de consentimiento"
          description={<p>Se anonimizarán el nombre y los datos de contacto. El historial de puntos se conserva sin identificación.</p>}
          confirmLabel="Anonimizar datos"
          danger
          onClose={() => setWithdrawing(false)}
          onConfirm={async (reason) => {
            await http.post(`/customers/${customer.id}/consent-withdrawal`, { reason });
            navigate('/clientes');
          }}
        />
      )}
    </>
  );
}

function EditCustomerDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerDetail;
  onClose: () => void;
  onSaved: (c: CustomerDetail) => void;
}) {
  const [fullName, setFullName] = useState(customer.fullName);
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [email, setEmail] = useState(customer.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (fullName !== customer.fullName) body.fullName = fullName;
      if (phone !== (customer.phone ?? '')) body.phone = phone;
      if (email && email !== (customer.email ?? '')) body.email = email;
      onSaved(await http.patch<CustomerDetail>(`/customers/${customer.id}`, body));
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Corregir datos"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={save} busy={busy}>
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Nombre completo">{(fid) => <input id={fid} maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} />}</Field>
      <Field label="Teléfono">
        {(fid) => <input id={fid} inputMode="numeric" maxLength={8} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />}
      </Field>
      <Field label="Correo">{(fid) => <input id={fid} type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <ErrorAlert error={error} />
    </Modal>
  );
}
