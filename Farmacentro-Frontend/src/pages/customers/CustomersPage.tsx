import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, http, query } from '../../api/http';
import type { CustomerSummary } from '../../api/types';
import { Alert, Button, ErrorAlert, Field, PageHeader } from '../../components/ui';

/** K4 — Customer search by phone or e-mail (exact match through the blind index). */
export function CustomersPage() {
  const [by, setBy] = useState<'phone' | 'email'>('phone');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<CustomerSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotFound(false);
    setResult(null);
    try {
      setResult(await http.get<CustomerSummary>(`/customers/lookup${query({ [by]: value.trim() })}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(e);
    }
  };

  return (
    <>
      <PageHeader
        title="Clientes de fidelización"
        subtitle="Los datos de contacto se guardan cifrados; la búsqueda es exacta."
        actions={
          <Link to="/clientes/nuevo" className="btn btn-primary">
            Registrar cliente
          </Link>
        }
      />
      <form className="card narrow stack" onSubmit={search}>
        <div className="segmented" role="radiogroup" aria-label="Buscar por">
          <button type="button" className={by === 'phone' ? 'active' : ''} onClick={() => { setBy('phone'); setValue(''); }}>
            Teléfono
          </button>
          <button type="button" className={by === 'email' ? 'active' : ''} onClick={() => { setBy('email'); setValue(''); }}>
            Correo
          </button>
        </div>
        <Field label={by === 'phone' ? 'Teléfono (8 dígitos)' : 'Correo'}>
          {(id) =>
            by === 'phone' ? (
              <input id={id} inputMode="numeric" maxLength={8} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} />
            ) : (
              <input id={id} type="email" maxLength={254} value={value} onChange={(e) => setValue(e.target.value)} />
            )
          }
        </Field>
        <Button type="submit" disabled={by === 'phone' ? value.length !== 8 : !value.includes('@')}>
          Buscar
        </Button>
        {notFound && <Alert kind="info">No hay un cliente activo con ese dato.</Alert>}
        <ErrorAlert error={error} />
        {result && (
          <div className="result-card">
            <strong>{result.fullName}</strong>
            <span>
              {result.phoneMasked} · {result.pointsBalance} puntos
            </span>
            <Link to={`/clientes/${result.id}`}>Ver detalle</Link>
          </div>
        )}
      </form>
    </>
  );
}
