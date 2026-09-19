import { Link } from 'react-router-dom';
import { ACCESS_AREA_LABEL, pathToAccessArea } from '../../data/erpRegistry';

export function AccessDeniedPage({ pathname }: { pathname: string }) {
  const area = pathToAccessArea(pathname);

  return (
    <section className="admin-page">
      <article className="admin-card admin-card--form">
        <h2>Acesso bloqueado</h2>
        <p>
          Seu usuário não tem permissão para{' '}
          <strong>{area ? ACCESS_AREA_LABEL[area] : 'esta área'}</strong>.
        </p>
        <p>
          Peça a um administrador para liberar a área no cadastro de{' '}
          <Link to="/painel/funcionarios">Funcionários</Link>, vinculando o e-mail do seu login.
        </p>
        <div className="admin-toolbar admin-toolbar--stack">
          <Link to="/painel" className="btn btn--primary">
            Voltar ao painel
          </Link>
        </div>
      </article>
    </section>
  );
}
