# Regras de negócio do PULSO

Este documento descreve como o PULSO transforma apontamentos em indicadores. São as regras que eu defini a partir
da rotina da usinagem; o código em `src/engine` as implementa, e `tests/` garante que continuam valendo.

## 1. O que entra

Cada apontamento traz: data e hora de início, duração, operador, OP, pedido (PV) e item, operação, recurso
(máquina) e quem lançou (coletor de chão de fábrica ou digitação manual).

- **Produção:** apontamentos em recursos dos centros de usinagem.
- **Parada (improdutivo):** apontamentos com origem 900 ou no recurso genérico `IMP`. Nesse caso, o campo
  "operação" guarda o código do motivo.
- **Operadores de usinagem:** quem tem pelo menos 50% das horas apontadas na usinagem. Só as paradas desses
  operadores entram na análise — o objetivo é não misturar perdas de outros setores.
- **Parada sem máquina:** quando o operador aponta a parada no recurso genérico, o PULSO atribui a parada à
  máquina do último apontamento produtivo daquele operador no mesmo dia. Essas paradas aparecem como
  *inferidas* (mais claras na linha do tempo).

## 2. O dia produtivo

O dia da fábrica vai das **06:00 às 06:00** do dia seguinte. Um apontamento às 02:00 de terça pertence à
segunda-feira. Um apontamento que atravessa as 06:00 é dividido entre os dois dias.

## 3. Capacidade

A capacidade de uma máquina em um dia é a soma das janelas dos turnos que ela tem, nos dias úteis do calendário:

```
capacidade do dia = Σ (horas líquidas de cada turno da máquina, se o dia tiver aquele turno) × disponibilidade %
```

- **Turnos** têm início, fim e intervalo (o padrão é 07:00–16:48 e 16:48–02:30, com 1 h de intervalo cada).
- **Calendário fabril** define o tipo de cada dia (útil, sábado convocado, feriado, ponte) e quais turnos rodam.
- **Escala mensal** diz, mês a mês, se a máquina tem turno fixo, compartilhado, eventual ou não tem turno.
  Só turnos **validados** geram capacidade: uma máquina eventual não conta como capacidade ociosa.
- **Corte da base:** a capacidade só é contada até o último apontamento importado. Assim, um mês em andamento
  não aparece com utilização artificialmente baixa.

> Na base de demonstração, a escala de jan–out/2026 vem pré-validada: máquinas com produção em 12 ou mais dias do
> mês ficam com turno fixo; as demais, eventuais.

## 4. Produção e utilização

- **Produção real (`union`):** a união dos intervalos apontados na máquina. Dois operadores ao mesmo tempo na
  mesma máquina contam uma vez.
- **Produção dentro da escala (`fixedProd`):** a parte da produção real que cai dentro das janelas de turno.
- **Utilização = produção dentro da escala ÷ capacidade fixa.**

Produção fora do turno ou em hora extra é mostrada à parte e **não** aumenta a utilização. A utilização mede o uso
da capacidade que a fábrica decidiu ter, não o esforço extra para compensá-la.

## 5. Hora extra

- **Lançada:** um período com horas por máquina, grupo ou para todas, distribuídas em dias úteis, sábados e domingos.
  Vira uma janela de capacidade adicional (`capHE`) logo após o último turno do dia.
- **Inferida (histórico):** quando não há lançamento, a produção além da jornada líquida do dia, fora das janelas
  normais, é contada como hora extra realizada.

## 6. Paradas de manutenção

O operador aponta a quebra e, em geral, vai trabalhar em outra máquina. Se o PULSO olhasse só o apontamento, a
máquina pareceria ter parado 30 minutos quando ficou parada dois dias. A regra:

1. Um apontamento com motivo da categoria **manutenção** abre uma parada na máquina.
2. A parada só termina no **próximo apontamento produtivo** naquela máquina — ou na liberação registrada no quadro.
3. Se não houver retorno, a parada é limitada a **5 dias** (configurável) e marcada como "limite".
4. **Tempo real parado** = capacidade de turno dentro do intervalo da parada (madrugada sem turno não conta).
5. **Manutenção não apontada** = tempo real − tempo apontado.
6. O PULSO também mostra para qual máquina o operador foi deslocado durante a parada.

Paradas que se sobrepõem na mesma máquina são unidas em um único evento.

**Indicadores:** disponibilidade = 1 − manutenção ÷ capacidade fixa; **MTTR** = parada real ÷ nº de eventos;
**MTBF** = horas produzidas ÷ nº de eventos.

**Quadro de máquinas paradas.** A supervisão registra uma parada com início e, quando houver, a liberação. Uma
parada aberta no quadro vira evento de manutenção até ser liberada, mesmo sem nenhum apontamento.

**Paradas a confirmar.** Um improdutivo que *não* é de manutenção, seguido de pelo menos 4 horas de turno sem
produção na máquina enquanto o operador foi apontar em outra, é uma provável quebra não declarada. O PULSO lista
essas ocorrências; a supervisão confirma como manutenção (passa a contar como parada) ou descarta.

## 7. Destino da capacidade

Cada minuto de capacidade fixa recebe **um único** destino, nesta ordem de prioridade:

| Ordem | Destino | Significado |
|---|---|---|
| 1 | Manutenção | máquina dentro de uma parada de manutenção |
| 2 | Sem cobertura | turno sem operador (registrado no calendário) |
| 3 | Produção | máquina produzindo dentro da escala |
| 4 | Improdutivo | parada apontada |
| 5 | Sem programação | sem carga registrada no calendário |
| 6 | Sem apontamento | o que sobra: turno disponível sem nenhum registro |

Por construção, a soma dos destinos é exatamente a capacidade fixa (há um teste para isso). "Sem apontamento"
costuma ser o maior bloco — e é o indicador mais útil para disciplina de apontamento.

## 8. Diagnóstico de baixo desempenho

Para cada máquina abaixo da meta, o PULSO mostra quanto falta para a meta (`capacidade × meta − produção na escala`),
a principal perda (improdutivo, manutenção não apontada ou sem apontamento) e os três maiores motivos.

Para cada grupo, calcula também a **utilização sem as máquinas de destaque** (as que estão na meta). Quando o grupo
está na meta mas, sem o destaque, cai 5 pontos ou mais, o grupo é marcado como *puxado por destaque*: a média esconde
máquinas com problema.

## 9. Comparação entre períodos

O Painel BI compara cada indicador com o período anterior: o mês anterior completo, quando o período é um mês
fechado; senão, uma janela do mesmo tamanho imediatamente antes. Utilização e disponibilidade variam em pontos
percentuais; horas, em %.
