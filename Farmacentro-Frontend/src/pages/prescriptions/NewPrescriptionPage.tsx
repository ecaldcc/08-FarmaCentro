import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, http, query } from '../../api/http';
import type { CustomerSummary, Paged, Product } from '../../api/types';
import { Badge, Button, ErrorAlert, Field, PageHeader } from '../../components/ui';
import { todayGt } from '../../utils/format';

interface ItemDraft {
  product: Product;
  dosage: string;
  quantityPrescribed: number;
}

/** R5 — Register a prescription. Clinical fields are encrypted by the API before storage. */
export function NewPrescriptionPage() {
  const navigate = useNavigate();
  const [patientName, setPatientName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorLicense, setDoctorLicense] = useState('');
  const [issuedAt, setIssuedAt] = useState(todayGt());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const handle = window.setTimeout(() => {
      http
        .get<Paged<Product>>(`/products${query({ q: search.trim(), pageSize: 8 })}`)
        .then((d) => setResults(d.items.filter((p) => p.category === 'medicamento')))
        .catch(setError);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const linkCustomer = async () => {
    try {
      setCustomer(await http.get<CustomerSummary>(`/customers/lookup${query({ phone })}`));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? new Error('No hay un cliente con ese teléfono.') : e);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await http.post<{ id: string; folio: string }>('/prescriptions', {
        ...(customer ? { customerId: customer.id } : {}),
        patientName,
        doctorName,
        doctorLicense,
        issuedAt,
        items: items.map((i) => ({ productId: i.product.id, dosage: i.dosage, quantityPrescribed: i.quantityPrescribed })),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      navigate(`/recetas/${created.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const valid = patientName.trim().length >= 3 && doctorName.trim().length >= 3 && doctorLicense.trim() && items.length > 0 && items.every((i) => i.dosage.trim() && i.quantityPrescribed > 0);

  return (
    <>
      <PageHeader title="Registrar receta" subtitle="Los datos del paciente, del médico y los medicamentos se guardan cifrados." />
      <form className="card stack" onSubmit={submit}>
        <div className="grid-2">
          <Field label="Paciente">{(id) => <input id={id} maxLength={100} value={patientName} onChange={(e) => setPatientName(e.target.value)} />}</Field>
          <Field label="Fecha de emisión">{(id) => <input id={id} type="date" max={todayGt()} value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />}</Field>
          <Field label="Médico">{(id) => <input id={id} maxLength={100} value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />}</Field>
          <Field label="Número de colegiado">{(id) => <input id={id} maxLength={20} value={doctorLicense} onChange={(e) => setDoctorLicense(e.target.value)} />}</Field>
        </div>
        <div className="customer-box">
          <h3>Vincular cliente de fidelización (opcional)</h3>
          {customer ? (
            <div className="stack-inline">
              <span>{customer.fullName} · {customer.phoneMasked}</span>
              <Button small variant="ghost" onClick={() => setCustomer(null)}>Quitar</Button>
            </div>
          ) : (
            <div className="stack-inline">
              <input aria-label="Teléfono del cliente" placeholder="Teléfono" inputMode="numeric" maxLength={8} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
              <Button small variant="secondary" onClick={() => void linkCustomer()} disabled={phone.length !== 8}>Buscar</Button>
            </div>
          )}
        </div>
        <h3>Medicamentos</h3>
        <Field label="Agregar medicamento">{(id) => <input id={id} value={search} maxLength={50} placeholder="Nombre o principio activo" onChange={(e) => setSearch(e.target.value)} />}</Field>
        {results.length > 0 && (
          <ul className="product-results">
            {results.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name} {p.isControlled && <Badge tone="danger">Controlado</Badge>}
                </span>
                <Button
                  small
                  disabled={items.some((i) => i.product.id === p.id)}
                  onClick={() => {
                    setItems([...items, { product: p, dosage: '', quantityPrescribed: 1 }]);
                    setSearch('');
                  }}
                >
                  Agregar
                </Button>
              </li>
            ))}
          </ul>
        )}
        {items.map((item, index) => (
          <div key={item.product.id} className="prescription-item">
            <strong>{item.product.name}</strong>
            <input
              aria-label={`Dosis de ${item.product.name}`}
              placeholder="Dosis e indicaciones"
              maxLength={200}
              value={item.dosage}
              onChange={(e) => setItems(items.map((it, i) => (i === index ? { ...it, dosage: e.target.value } : it)))}
            />
            <input
              aria-label={`Cantidad de ${item.product.name}`}
              type="number"
              min={1}
              className="qty"
              value={item.quantityPrescribed}
              onChange={(e) => setItems(items.map((it, i) => (i === index ? { ...it, quantityPrescribed: Number(e.target.value) } : it)))}
            />
            <button type="button" className="icon-btn" aria-label="Quitar" onClick={() => setItems(items.filter((_, i) => i !== index))}>
              ×
            </button>
          </div>
        ))}
        <Field label="Notas (opcional)">{(id) => <textarea id={id} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <ErrorAlert error={error} />
        <Button type="submit" busy={busy} disabled={!valid}>
          Guardar receta
        </Button>
      </form>
    </>
  );
}
