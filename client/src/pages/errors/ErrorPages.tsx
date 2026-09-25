import { Link } from 'react-router';

export function ForbiddenPage() {
  return (
    <section className="card narrow">
      <h1>Acceso denegado</h1>
      <p>No tienes permiso para ver esta pantalla. Si crees que es un error, consulta al Administrador.</p>
      <Link to="/" className="btn btn-primary">
        Ir a mi pantalla de inicio
      </Link>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="card narrow">
      <h1>Página no encontrada</h1>
      <p>La dirección que buscas no existe.</p>
      <Link to="/" className="btn btn-primary">
        Ir a mi pantalla de inicio
      </Link>
    </section>
  );
}
