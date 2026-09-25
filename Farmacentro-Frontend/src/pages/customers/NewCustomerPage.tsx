import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { http } from '../../api/http';
import type { CustomerSummary, PrivacyNotice } from '../../api/types';
import { Button, ErrorAlert, Field, Loading, PageHeader } from '../../components/ui';

/** K5 — Register a loyalty customer. The privacy notice must be accepted (control 5.34). */
export function NewCustomerPage() {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    http.get<PrivacyNotice>('/privacy-notice/current').then(setNotice).catch(setError);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!notice) return;
    setBusy(true);
    setError(null);
    try {
      const created = await http.post<CustomerSummary>('/customers', {
        fullName,
        phone,
        ...(email.trim() ? { email: email.trim() } : {}),
        consent: { accepted, noticeVersion: notice.version },
      });
      navigate(`/clientes/${created.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Registrar cliente" subtitle="Solo se recogen los datos mínimos" />
      <form className="card narrow stack" onSubmit={submit}>
        <Field label="Nombre completo">
          {(id) => <input id={id} maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} required />}
        </Field>
        <Field label="Teléfono (8 dígitos)">
          {(id) => (
            <input id={id} inputMode="numeric" maxLength={8} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} required />
          )}
        </Field>
        <Field label="Correo (opcional)">
          {(id) => <input id={id} type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        {!notice ? (
          <Loading />
        ) : (
          <div className="privacy-notice">
            <h2>{notice.title}</h2>
            {notice.text.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <p className="muted small">Versión del aviso: {notice.version}</p>
            <label className="checkbox">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              El cliente leyó y acepta el aviso de privacidad.
            </label>
          </div>
        )}
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy} disabled={!accepted || !notice || phone.length !== 8 || fullName.trim().length < 3}>
          Guardar cliente
        </Button>
      </form>
    </>
  );
}
