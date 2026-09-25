import { useEffect, useState } from 'react';
import { downloadFile, http, query } from '../../api/http';
import type { AuditEntry, Paged } from '../../api/types';
import { Badge, Button, DateTime, Empty, ErrorAlert, Loading, Modal, PageHeader, Pagination } from '../../components/ui';
import { todayGt } from '../../utils/format';

const RESULT_TONE = { success: 'success', failure: 'warning', denied: 'danger' } as const;
const RESULT_LABEL = { success: 'Éxito', failure: 'Fallo', denied: 'Denegado' } as const;

/** U1 — Audit log (Auditor): filters, detail with hashes and CSV export. */
export function AuditLogPage() {
  const [filters, setFilters] = useState({ from: todayGt(-7), to: todayGt(), action: '', username: '', result: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AuditEntry> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setData(null);
    http
      .get<Paged<AuditEntry>>(`/audit/logs${query({ ...applied, page })}`)
      .then(setData)
      .catch(setError);
  }, [applied, page]);

  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadFile(`/audit/logs/export${query(applied)}`, 'bitacora.csv');
    } catch (e) {
      setError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Bitácora de auditoría"
        subtitle="Registros de solo inserción encadenados por hash. Cada consulta y exportación también se registra."
        actions={
          <Button variant="secondary" onClick={() => void exportCsv()} busy={exporting}>
            Exportar CSV
          </Button>
        }
      />
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setPage(1);
          setApplied(filters);
        }}
      >
        <label>
          Desde <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </label>
        <label>
          Hasta <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </label>
        <input placeholder="Acción (p. ej. sale.voided)" maxLength={60} value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value.trim() })} />
        <input placeholder="Usuario" maxLength={32} value={filters.username} onChange={(e) => setFilters({ ...filters, username: e.target.value.trim().toLowerCase() })} />
        <select value={filters.result} onChange={(e) => setFilters({ ...filters, result: e.target.value })} aria-label="Resultado">
          <option value="">Todos los resultados</option>
          <option value="success">Éxito</option>
          <option value="failure">Fallo</option>
          <option value="denied">Denegado</option>
        </select>
        <Button type="submit" small>
          Filtrar
        </Button>
      </form>
      <ErrorAlert error={error} />
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty>Sin registros con esos filtros.</Empty>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Resultado</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry) => (
                <tr key={entry.seq} className="clickable" onClick={() => setDetail(entry)}>
                  <td>{entry.seq}</td>
                  <td>
                    <DateTime value={entry.timestamp} />
                  </td>
                  <td>{entry.username ?? '—'}</td>
                  <td>{entry.role ?? '—'}</td>
                  <td>
                    <code>{entry.action}</code>
                  </td>
                  <td>{entry.entity ?? '—'}</td>
                  <td>
                    <Badge tone={RESULT_TONE[entry.result]}>{RESULT_LABEL[entry.result]}</Badge>
                  </td>
                  <td>{entry.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {detail && (
        <Modal title={`Registro #${detail.seq}`} onClose={() => setDetail(null)}>
          <dl className="details">
            <dt>Fecha (UTC)</dt>
            <dd>{detail.timestamp}</dd>
            <dt>Usuario</dt>
            <dd>
              {detail.username ?? '—'} ({detail.role ?? 'sin rol'})
            </dd>
            <dt>Acción</dt>
            <dd>
              <code>{detail.action}</code>
            </dd>
            <dt>Entidad</dt>
            <dd>
              {detail.entity ?? '—'} {detail.entityId ?? ''}
            </dd>
            <dt>Resultado</dt>
            <dd>{RESULT_LABEL[detail.result]}</dd>
            <dt>Detalles</dt>
            <dd>
              <pre>{JSON.stringify(detail.details, null, 2)}</pre>
            </dd>
            <dt>IP / navegador</dt>
            <dd>
              {detail.ip ?? '—'} · <span className="small">{detail.userAgent ?? '—'}</span>
            </dd>
            <dt>Id de solicitud</dt>
            <dd>
              <code>{detail.requestId ?? '—'}</code>
            </dd>
            <dt>Hash anterior</dt>
            <dd>
              <code className="hash">{detail.prevHash}</code>
            </dd>
            <dt>Hash</dt>
            <dd>
              <code className="hash">{detail.hash}</code>
            </dd>
          </dl>
        </Modal>
      )}
    </>
  );
}
