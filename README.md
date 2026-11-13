# PULSO™ — Performance da Produção

Sistema de acompanhamento de **utilização, capacidade e perdas** de um parque de usinagem, calculado a partir
dos apontamentos de produção exportados do ERP.

Desenvolvido por **Gabriel Januário**. Todos os dados deste repositório são **fictícios**.

## O problema

A fábrica apontava horas no ERP, mas não tinha resposta rápida para três perguntas:

1. Quanto da capacidade instalada de cada máquina está sendo usado?
2. Para onde vai a capacidade que não vira produção — parada, manutenção, falta de programação ou falta de apontamento?
3. Quais máquinas e grupos puxam o resultado para baixo?

O PULSO responde a essas perguntas por dia, máquina, grupo e mês.

## Como funciona

```
public/pulso.db (SQLite)  →  src/db  →  src/engine  →  src/app (React)
     30 mil apontamentos       SQL        indicadores     telas
```

- **Banco de dados** — SQLite com modelo normalizado (`db/schema.sql`). O arquivo é aberto no próprio navegador
  com [sql.js](https://sql.js.org); não há servidor.
- **Motor de indicadores** (`src/engine`) — regras de negócio isoladas da interface: capacidade por turno e
  calendário, dia produtivo de 06:00 a 06:00, hora extra, eventos de parada e destino da capacidade.
- **Interface** (`src/app`) — React + TypeScript, gráficos em SVG sem biblioteca externa.

### Principais regras de negócio

| Indicador | Definição |
|---|---|
| Utilização | produção dentro da capacidade fixa ÷ capacidade fixa |
| Capacidade fixa | horas líquidas dos turnos validados na escala mensal, nos dias úteis do calendário fabril |
| Produção real | tempo de máquina produzindo; apontamentos simultâneos contam uma vez |
| Destino da capacidade | produção + improdutivo + manutenção + sem cobertura + sem programação + sem apontamento = 100 % |
| Status | no alvo ≥ 85 % · atenção 65–85 % · crítico < 65 % (configurável) |

## Estado da migração

A versão 2.2 era um único arquivo HTML (`legacy/PULSO_v2.2.html`). Esta versão 3 reescreve o sistema por etapas,
mantendo os números idênticos:

- [x] Banco de dados SQLite e camada de consultas
- [x] Motor de indicadores isolado, com testes contra a v2.2
- [x] Visão geral
- [x] Painel BI (filtros cruzados por grupo, máquina e dia; comparação com o período anterior)
- [ ] Análise mensal, Máquinas, Grupos, Linha do tempo
- [ ] Manutenção e Improdutivas
- [ ] Carteira, Simulador, Operadores, Qualidade dos dados
- [ ] Horas extras, Calendário fabril, Configurações
- [ ] Relatórios em PDF e Excel

O núcleo do motor (`src/engine/core.js`) foi extraído da v2.2 sem mudar regra nenhuma e é exposto por uma API
tipada (`src/engine/index.ts`). Ele será convertido para TypeScript estrito aos poucos, sempre com os testes verdes.

## Rodar

```bash
npm install
npm run dev      # desenvolvimento
npm test         # testes do motor e do banco
npm run build    # gera dist/
```

Requer Node 22 ou mais recente.

## Testes

- `tests/engine.test.ts` compara o motor com valores de referência capturados da v2.2 (`tests/golden.json`) em cinco
  recortes de período e grupo: totais, cada máquina, grupos e evolução diária.
- `tests/dashboard.test.ts` confere o filtro cruzado e o período de comparação contra a v2.2 e as regras dos
  visuais do Painel BI (a cascata fecha, o pareto soma 100%, as horas por hora do dia batem com os apontamentos).
- `tests/db.test.ts` valida a integridade do banco e as consultas SQL.

Os filtros ficam na URL (`#/painel?p=2026-10&g=Mandrilhadoras&m=MHMC`), então um recorte pode ser compartilhado por link.

## Estrutura

```
db/        modelo de dados (schema.sql) e tabelas de cadastro em CSV
public/    pulso.db — a base de demonstração
src/db/    abertura do banco e consultas SQL
src/engine motor de indicadores
src/analytics cálculos das telas (filtro cruzado, pareto, cascata, séries) — funções puras e testadas
src/app/   telas e componentes React
tests/     testes automáticos
legacy/    PULSO v2.2 (referência até o fim da migração)
```

## Sobre os dados

A base foi gerada a partir de uma exportação real e transformada: nomes de operadores e usuários inventados;
chapas, ordens, pedidos e centros de custo renumerados; horários e durações alterados. Os modelos de máquina são
nomes de mercado. A empresa "Metalúrgica Horizonte S.A." não existe.

© 2026 Gabriel Januário.
