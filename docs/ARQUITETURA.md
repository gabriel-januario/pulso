# Arquitetura e decisões técnicas

Registro das decisões que tomei na versão 3 do PULSO, com as alternativas que considerei.

## Contexto

A versão 2.2 era um arquivo HTML único (≈ 4.800 linhas de HTML, CSS e JavaScript, com 1,6 MB de dados embutidos),
usado diariamente. Funcionava, mas tinha três limites: nenhuma separação entre regra de negócio e tela, nenhum
teste e dados presos dentro do código. A versão 3 resolve os três sem mudar nenhum número.

## D1 · Banco SQLite consultado no navegador

**Decisão:** os apontamentos ficam em um arquivo SQLite (`public/pulso.db`) aberto no navegador com sql.js.

**Alternativas:** (a) JSON embutido, como na v2.2; (b) PostgreSQL com uma API.

**Por quê:** o SQLite me dá um modelo relacional de verdade (chaves estrangeiras, visões, SQL) sem exigir servidor.
A demo pode ficar em hospedagem estática, sempre no ar e sem custo — o que importa para um portfólio. O caminho para
um servidor continua aberto: o motor recebe uma base em memória e não sabe de onde ela veio.

**Custo:** o navegador baixa o banco inteiro (≈ 4 MB; menos de 1 MB com a compressão do servidor) e o WebAssembly do sql.js (≈ 340 kB compactado).
Para a escala de uma fábrica (dezenas de milhares de apontamentos por ano), é aceitável.

## D2 · Migração por paridade, não por reescrita

**Decisão:** extrair o motor da v2.2 sem alterar regras, envolvê-lo numa API tipada e travar os resultados com
testes antes de migrar cada tela.

**Por quê:** reescrever as regras do zero em TypeScript seria mais elegante, mas qualquer diferença de arredondamento
ou de ordem de cálculo mudaria números que a gestão já conhece. Capturei os resultados da v2.2 com o navegador em modo
automatizado (`tests/golden*.json`) e exijo igualdade em cada recorte. A conversão do núcleo para TypeScript estrito
será feita função a função, com esses testes sempre verdes.

## D3 · Motor sem estado global

**Decisão:** `createEngine(base, configuração)` devolve uma instância com seus próprios caches.

**Por quê:** na v2.2, base, configuração e caches eram variáveis globais. Isso impedia testar duas configurações lado a
lado e tornava o comportamento dependente da ordem de execução. Há um teste específico para garantir o isolamento.

## D4 · Cálculo de tela como função pura

**Decisão:** tudo o que uma tela calcula (filtro cruzado, pareto, cascata, série mensal, OPs, pedidos, diagnóstico de
baixo desempenho) fica em `src/analytics`, em funções que recebem a agregação e devolvem dados.

**Por quê:** os componentes React só desenham. Os números ficam testáveis sem navegador e reaproveitáveis nos
relatórios em PDF e Excel, que serão a próxima etapa.

## D5 · Gráficos em SVG próprio

**Alternativas:** Recharts, ECharts, D3.

**Por quê:** os gráficos do PULSO têm regras específicas — cor por status contra a meta, traço da capacidade, cascata
que fecha, pareto com a faixa dos motivos vitais. Escrevê-los em SVG me deu controle total do enquadramento:
cada gráfico mede a largura real do contêiner, nunca escala o texto e só desenha um rótulo se ele couber. O
JavaScript da aplicação inteira fica em ≈ 125 kB compactado, sem biblioteca de gráficos.

## D6 · Estado de filtros na URL

**Decisão:** período, grupo e máquinas selecionadas ficam no endereço (`#/painel?p=2026-10&g=…&m=…`).

**Por quê:** em gestão, o recorte é o que se discute. Com a URL, um supervisor envia exatamente o que está vendo.
O roteamento por `#` funciona em qualquer hospedagem estática, sem configuração de servidor.

## Modelo de dados

```
empresa
centro_recurso (cr) ──< recurso (codigo) ──┐
operador (id) ─────────────────────────────┼──< apontamento >── usuario (id)
origem (codigo) ───────────────────────────┤
categoria_parada ──< motivo_parada ────────┘   (em paradas, apontamento.operacao = código do motivo)
```

Visões: `vw_apontamento` (fato com dimensões), `vw_horas_maquina_mes`, `vw_paradas_motivo`. O esquema completo está
em [`db/schema.sql`](../db/schema.sql).

## Testes

| Arquivo | O que garante |
|---|---|
| `tests/engine.test.ts` | paridade do motor com a v2.2 em 5 recortes (totais, cada máquina, grupos, cada dia) e invariantes |
| `tests/dashboard.test.ts` | filtro cruzado e período de comparação iguais à v2.2; regras dos visuais do Painel BI |
| `tests/views.test.ts` | baixo desempenho, pedidos, OPs e análise mensal iguais à v2.2 |
| `tests/db.test.ts` | integridade referencial do banco e consultas SQL |
