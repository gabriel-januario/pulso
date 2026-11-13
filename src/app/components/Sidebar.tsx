export interface NavItem { id: string; name: string; ready?: boolean }
export const SECTIONS: { label: string; items: NavItem[] }[] = [
  { label: 'Performance', items: [
    { id: 'geral', name: 'Visão geral', ready: true }, { id: 'painel', name: 'Painel BI', ready: true },
    { id: 'mensal', name: 'Análise mensal' }, { id: 'maquinas', name: 'Máquinas' }, { id: 'grupos', name: 'Grupos de máquinas' }, { id: 'linha', name: 'Linha do tempo' } ] },
  { label: 'Perdas', items: [{ id: 'manutencao', name: 'Manutenção' }, { id: 'improdutivas', name: 'Improdutivas' }] },
  { label: 'Gestão', items: [{ id: 'carteira', name: 'Carteira e prazos' }, { id: 'simulador', name: 'Simulador' }, { id: 'operadores', name: 'Operadores' }, { id: 'qualidade', name: 'Qualidade dos dados' }] },
  { label: 'Planejamento', items: [{ id: 'horas-extras', name: 'Horas extras' }, { id: 'calendario', name: 'Calendário fabril' }, { id: 'configuracoes', name: 'Configurações' }] },
];

export function Sidebar({ source, current, onNavigate }: { source: string; current: string; onNavigate(id: string): void }) {
  return (
    <aside className="side">
      <div className="brand">
        <span className="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M2 12h4l3-7 4 14 3-7h6" /></svg></span>
        <div><b>PULSO<sup>™</sup></b><span>Performance da Produção</span></div>
      </div>
      <nav aria-label="Seções">
        {SECTIONS.map((s) => (
          <div key={s.label} className="navgrp">
            <div className="navlbl">{s.label}</div>
            {s.items.map((it) => (
              <button key={it.id} type="button" disabled={!it.ready} aria-current={current === it.id ? 'page' : undefined} onClick={() => onNavigate(it.id)}>
                {it.name}
                {!it.ready && <em>em migração</em>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="credit">Desenvolvido por Gabriel Januário<span>{source}</span></div>
    </aside>
  );
}
