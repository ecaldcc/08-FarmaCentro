import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, http, query } from '../../api/http';
import type { CustomerSummary, Paged, Product } from '../../api/types';
import { QuantityInput } from '../../components/QuantityInput';
import { Alert, Badge, Button, ErrorAlert, Field, PageHeader } from '../../components/ui';
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
  const [searchedTerm, setSearchedTerm] = useState('');
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      setSearchedTerm('');
      return undefined;
    }
    const handle = window.setTimeout(() => {
      http
        .get<Paged<Product>>(`/products${query({ q: search.trim(), pageSize: 8 })}`)
        .then((d) => {
          setResults(d.items.filter((p) => p.category === 'medicamento'));
          setSearchedTerm(search.trim());
        })
        .catch(setError);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const linkCustomer = async () => {
    setCustomerError(null);
    try {
      setCustomer(await http.get<CustomerSummary>(`/customers/lookup${query({ phone })}`));
    } catch (e) {
      setCustomerError(
        e instanceof ApiError && e.status === 404
          ? 'No hay un cliente con ese teléfono. El vínculo es opcional: puedes guardar la receta sin él.'
          : 'No se pudo buscar el cliente.',
      );
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

  // Tell the Regente exactly what is missing instead of only disabling the button.
  const missing: string[] = [];
  if (patientName.trim().length < 3) missing.push('Nombre del paciente (mínimo 3 caracteres)');
  if (doctorName.trim().length < 3) missing.push('Nombre del médico (mínimo 3 caracteres)');
  if (!doctorLicense.trim()) missing.push('Número de colegiado');
  if (items.length === 0) missing.push('Al menos un medicamento: búscalo y pulsa "Agregar"');
  if (items.some((i) => !i.dosage.trim())) missing.push('La dosis e indicaciones de cada medicamento');
  if (items.some((i) => !(i.quantityPrescribed > 0))) missing.push('Una cantidad mayor que cero en cada medicamento');
  const valid = missing.length === 0;

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
          {customerError && <small className="field-error">{customerError}</small>}
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
        {results.length === 0 && searchedTerm && searchedTerm === search.trim() && (
          <Alert kind="warning">
            No se encontró "{searchedTerm}" en el catálogo de medicamentos. Solo se pueden recetar productos que existen en
            el inventario: el Bodeguero debe crearlo en <em>Inventario → Nuevo producto</em>.
          </Alert>
        )}
        {items.length === 0 && <p className="muted small">Aún no hay medicamentos en la receta.</p>}
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
            <QuantityInput
              value={item.quantityPrescribed}
              min={1}
              max={10000}
              label={`cantidad de ${item.product.name}`}
              onChange={(quantity) => setItems(items.map((it, i) => (i === index ? { ...it, quantityPrescribed: quantity } : it)))}
            />
            <button type="button" className="icon-btn" aria-label="Quitar" onClick={() => setItems(items.filter((_, i) => i !== index))}>
              ×
            </button>
          </div>
        ))}
        <Field label="Notas (opcional)">{(id) => <textarea id={id} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <ErrorAlert error={error} />
        {!valid && (
          <div className="alert alert-info" role="status">
            <strong>Para guardar la receta falta:</strong>
            <ul>
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <Button type="submit" busy={busy} disabled={!valid}>
          Guardar receta
        </Button>
      </form>
    </>
  );
}
