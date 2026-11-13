const SECTIONS: { label: string; items: { id: string; name: string; ready?: boolean }[] }[] = [
  { label: 'Performance', items: [
    { id: 'geral', name: 'Visão geral', ready: true },
    { id: 'dash', name: 'Painel BI' }, { id: 'bi', name: 'Análise mensal' }, { id: 'maq', name: 'Máquinas' },
    { id: 'grp', name: 'Grupos de máquinas' }, { id: 'tl', name: 'Linha do tempo' } ] },
  { label: 'Perdas', items: [{ id: 'man', name: 'Manutenção' }, { id: 'imp', name: 'Improdutivas' }] },
  { label: 'Gestão', items: [{ id: 'cart', name: 'Carteira e prazos' }, { id: 'sim', name: 'Simulador' }, { id: 'opr', name: 'Operadores' }, { id: 'qual', name: 'Qualidade dos dados' }] },
  { label: 'Planejamento', items: [{ id: 'he', name: 'Horas extras' }, { id: 'cal', name: 'Calendário fabril' }, { id: 'cfg', name: 'Configurações' }] },
];

export function Sidebar({ source }: { source: string }) {
  return (
    <aside className="side">
      <div className="brand">
        <span className="mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M2 12h4l3-7 4 14 3-7h6" /></svg>
        </span>
        <div>
          <b>PULSO<sup>™</sup></b>
          <span>Performance da Produção</span>
        </div>
      </div>
      <nav aria-label="Seções">
        {SECTIONS.map((s) => (
          <div key={s.label} className="navgrp">
            <div className="navlbl">{s.label}</div>
            {s.items.map((it) => (
              <button key={it.id} type="button" disabled={!it.ready} aria-current={it.ready ? 'page' : undefined}>
                {it.name}
                {!it.ready && <em>em migração</em>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="credit">
        Desenvolvido por Gabriel Januário
        <span>{source}</span>
      </div>
    </aside>
  );
}
