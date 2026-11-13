<div align="center">

# PULSO™ — Performance da Produção

**Utilização, capacidade e perdas de um parque de usinagem, calculadas a partir dos apontamentos do ERP.**

React · TypeScript · SQLite no navegador · 68 testes automatizados · dados 100% fictícios

</div>

---

## Por que eu construí o PULSO

Trabalho com planejamento e operações industriais. Na usinagem, a pergunta central da gestão é simples —
*"quanto da nossa capacidade estamos usando de verdade?"* — e, sem uma ferramenta, respondê-la exige horas de
planilha a cada fechamento.

Os dados existiam. Cada operador aponta no coletor o início, o fim, a OP e a operação. O problema é que o
apontamento bruto não responde à pergunta de gestão, por quatro motivos que a rotina da usinagem deixa claros:

1. **Capacidade não é 24 horas.** Depende dos turnos de cada máquina, do calendário (feriados, pontes, sábados
   convocados) e da escala do mês. Uma máquina parada num turno que ela não tem não é perda.
2. **O dia da fábrica não é o dia do calendário.** O segundo turno termina de madrugada; um apontamento das
   02:00 pertence ao dia produtivo anterior. No PULSO, o dia vai das 06:00 às 06:00.
3. **Horas apontadas não são horas de máquina.** Dois operadores na mesma mandrilhadora não dobram a produção
   da máquina. A produção real é a união dos intervalos, não a soma.
4. **A manutenção some do apontamento.** O operador aponta a quebra e vai ajudar em outra máquina. A máquina
   continua parada até o próximo apontamento produtivo — e esse tempo precisa aparecer.

O PULSO transforma os apontamentos nessas respostas: utilização por dia, máquina e grupo; para onde vai cada
hora de capacidade; quais motivos concentram as perdas; e quais máquinas puxam o resultado para baixo.

## O que o sistema mostra

| Tela | Pergunta que responde |
|---|---|
| **Visão geral** | Como está o mês? Quais grupos estão abaixo da meta? |
| **Painel BI** | Onde exatamente está a perda? Filtro cruzado por grupo, máquina e dia, comparação com o período anterior |
| **Análise mensal** | Estamos melhorando? Visão por mês, trimestre ou ano, com memória de cálculo exportável |
| **Máquinas** | O que aconteceu nesta máquina, dia a dia, OP a OP? |
| **Grupos de máquinas** | A média do grupo esconde máquinas com problema? |
| **Linha do tempo** | Quem estava produzindo o quê, a cada hora? Quais pedidos consumiram mais máquina? |
| **Manutenção** | Qual é a disponibilidade real? Quanto da parada não foi apontado? Quais máquinas estão paradas agora? |
| **Improdutivas** | Quais motivos concentram as perdas? Quais máquinas e operadores são mais afetados? |
| **Carteira e prazos** | Quais pedidos vão atrasar no ritmo atual? Qual grupo de máquinas fica sobrecarregado nas próximas semanas? |
| **Simulador** | Quanto a utilização sobe se reduzirmos uma perda, ou se abrirmos um turno em algumas máquinas? |
| **Operadores** | Como cada pessoa aponta? Onde há registros esquecidos abertos ou sobrepostos? |
| **Qualidade dos dados** | Dá para confiar nos números deste período? Onde o registro tem lacunas? |
| **Horas extras** | Quanta HE foi realizada, em quais recursos? O que está programado para o mês? |
| **Calendário fabril** | Quais dias e turnos contam como capacidade? Quem cobre cada recurso no mês? Que exceções aconteceram? |
| **Configurações** | Metas, regras de manutenção, cadastro de máquinas, motivos de parada e backup da configuração |

Os filtros ficam na URL (`#/painel?p=2026-10&g=Mandrilhadoras&m=MHMC`): um recorte pode ser enviado por link.

## Regras de negócio

As definições abaixo são o coração do projeto. O detalhamento, com exemplos, está em
[`docs/REGRAS-DE-NEGOCIO.md`](docs/REGRAS-DE-NEGOCIO.md).

| Indicador | Definição |
|---|---|
| **Capacidade fixa** | Horas líquidas dos turnos validados na escala do mês, nos dias úteis do calendário fabril, multiplicadas pela disponibilidade cadastrada da máquina |
| **Produção real** | União dos intervalos apontados — apontamentos simultâneos na mesma máquina contam uma vez |
| **Utilização** | Produção dentro da capacidade fixa ÷ capacidade fixa. Hora extra não infla a utilização |
| **Hora extra realizada** | Produção em janelas de HE lançadas ou, no histórico, produção além da jornada líquida do dia |
| **Destino da capacidade** | Cada minuto de capacidade fixa recebe exatamente um destino: manutenção, sem cobertura, produção, improdutivo, sem programação ou sem apontamento. A soma fecha em 100% |
| **Parada de manutenção** | Abre no apontamento de manutenção e só fecha no próximo apontamento produtivo da máquina (limite de 5 dias). O tempo real é a capacidade de turno dentro desse intervalo |
| **Status** | No alvo ≥ 85% · atenção entre 65% e 85% · crítico < 65% (configurável) |

## Arquitetura

```
public/pulso.db ──► src/db ──────► src/engine ──────► src/analytics ──────► src/app
SQLite (30 mil       sql.js +       motor de           cálculos de cada       React +
apontamentos)        consultas SQL  indicadores        tela, funções puras    SVG próprio
```

- **Sem servidor.** O banco SQLite é baixado e consultado no próprio navegador com
  [sql.js](https://sql.js.org) (SQLite compilado para WebAssembly). A demo roda em qualquer hospedagem estática.
- **Motor de indicadores isolado da interface.** `src/engine` recebe a base e a configuração e devolve números;
  não conhece React nem o DOM. Cada instância tem seu próprio estado — nada global.
- **Cálculo de tela separado de desenho.** `src/analytics` reúne funções puras (filtro cruzado, pareto, cascata,
  séries mensais, OPs, pedidos). São elas que os testes validam.
- **Gráficos em SVG escritos à mão**, medidos pela largura real do contêiner: o texto nunca é escalado e nenhum
  rótulo é desenhado se não couber.

As decisões de arquitetura, com alternativas consideradas, estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Qualidade

A versão 2.2 do PULSO era um único arquivo HTML de 4.800 linhas, usado no dia a dia. Reescrever um sistema que
já está em uso tem um risco claro: mudar um número sem perceber. Por isso, antes de migrar cada tela, capturei os
resultados da v2.2 e transformei em teste.

```
npm test
 ✓ tests/engine.test.ts     paridade com a v2.2 em 5 recortes: totais, cada máquina, grupos, cada dia
 ✓ tests/dashboard.test.ts  filtro cruzado e período de comparação idênticos à v2.2; regras dos visuais
 ✓ tests/views.test.ts      baixo desempenho, pedidos, OPs e análise mensal idênticos à v2.2
 ✓ tests/losses.test.ts     manutenção (MTTR, MTBF, paradas a confirmar) e improdutivos idênticos à v2.2
 ✓ tests/management.test.ts carteira, carga semanal, simulador, operadores e qualidade idênticos à v2.2
 ✓ tests/planning.test.ts   capacidade do mês, HE realizada e programada, cópia de mês e escala idênticas à v2.2
 ✓ tests/db.test.ts         integridade referencial, consultas SQL e carteira de demonstração
 Tests  68 passed
```

Além da paridade, há testes de invariantes de negócio: o destino da capacidade soma exatamente a capacidade;
a cascata fecha; o pareto soma 100%; as horas distribuídas por hora do dia batem com os apontamentos.
A integração contínua (`.github/workflows/ci.yml`) roda checagem de tipos, testes e build a cada push.

## Como este projeto foi construído

O PULSO é fruto de uma colaboração entre mim e IA, e eu faço questão de deixar isso claro.

**O que é meu:** o problema, o conhecimento do processo e todas as regras de negócio — o dia produtivo de 06:00
a 06:00, a forma de tratar apontamentos simultâneos, a regra que mantém a máquina parada até o próximo
apontamento produtivo, a ideia de mostrar a utilização "sem o destaque" para revelar médias enganosas, o
desenho de cada tela a partir das perguntas que a gestão faz. Também é minha a validação: os critérios de cada
indicador e, nesta versão, a exigência de que todo número continue idêntico ao da versão anterior.

**Onde usei IA:** usei o Claude (Anthropic) como par de programação — para escrever e refatorar código, montar a
estrutura em React e TypeScript, escrever testes a partir dos critérios que defini e revisar o enquadramento
das telas. Os commits feitos nessa parceria trazem a linha `Co-Authored-By`.

Essa divisão é, na minha visão, o jeito certo de usar IA em transformação digital: quem conhece o processo
decide *o que* precisa ser verdade; a IA acelera o *como*; e testes garantem que o resultado continua correto.

## Rodar localmente

Requer Node 22 ou mais recente.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 68 testes
npm run build      # gera dist/ (site estático)
```

## Estrutura

```
db/              modelo de dados (schema.sql) e cadastros em CSV
public/pulso.db  base de demonstração
src/db/          abertura do banco e consultas SQL
src/engine/      motor de indicadores (regras de negócio)
src/analytics/   cálculos das telas — funções puras e testadas
src/app/         telas, componentes e gráficos em React
tests/           testes automatizados e valores de referência da v2.2
docs/            regras de negócio e decisões de arquitetura
legacy/          PULSO v2.2, referência até o fim da migração
```

## Roteiro

- [x] Banco de dados e camada de consultas
- [x] Motor de indicadores isolado e testado contra a v2.2
- [x] Visão geral · Painel BI · Análise mensal · Máquinas · Grupos · Linha do tempo
- [x] Manutenção (com quadro de máquinas paradas) e Improdutivas
- [x] Carteira e prazos · Simulador de capacidade · Operadores · Qualidade dos dados
- [x] Horas extras · Calendário fabril · Configurações
- [ ] Relatórios em PDF e Excel
- [ ] Conversão do núcleo do motor (`src/engine/core.js`) para TypeScript estrito

## Sobre os dados

Todos os dados são fictícios. A base foi derivada de uma exportação real e transformada: nomes de operadores e
logins inventados; chapas, OPs, pedidos e centros de custo renumerados; horários e durações alterados. Os
modelos de máquina são nomes de fabricantes de mercado. A "Metalúrgica Horizonte S.A." não existe.
A previsão da carteira (horas previstas e entrega de cada pedido, tabela `carteira_pv`) também é fictícia: foi
gerada a partir das horas apontadas para que a tela mostre pedidos em todas as situações.

---

Desenvolvido por **Gabriel Januário** · Planejamento e Operações Industriais · Melhoria de Processos · Dados e Digitalização

© 2026 Gabriel Januário
