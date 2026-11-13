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

## 10. Carteira e prazos

Entram na carteira os pedidos (PV) com usinagem nos últimos 30 dias da base e os que o usuário cadastrou.

- **Ritmo** = horas usinadas no PV nos últimos 14 dias ÷ 14. É o ritmo real, não o planejado.
- **Término previsto**: o restante (`horas previstas − usinado`) é consumido no ritmo, só em dias úteis
  (segunda a sexta, fora dos feriados). Como o ritmo é por dia corrido, cada dia útil consome `ritmo × 7 ÷ 5`.
- **Situação**, nesta ordem: *concluído* (marcado ou usinado ≥ previsto) · *atrasado* (entrega já passou) ·
  *sem ritmo* (nada usinado em 14 dias) · *em risco* (término previsto depois da entrega) · *no prazo*.
  Sem horas ou sem entrega, o PV fica *sem previsão*.
- **Carga semanal**: o restante de cada PV é distribuído por igual nos dias úteis até a entrega (PV atrasado cai
  todo na primeira semana), repartido entre os grupos de máquinas na proporção das horas já usinadas. A capacidade
  usa a escala validada; onde não há escala, a média do mesmo dia da semana nas últimas 4 semanas.

## 11. Simulador

Responde "quanto ganharíamos se…" sem prometer mais do que os dados sustentam:

- reduzir X% de uma categoria de improdutivo devolve X% das horas dessa categoria **na conta da máquina**
  (a mesma régua do destino da capacidade, sem contar duas vezes paradas sobrepostas);
- reduzir manutenção e capacidade sem apontamento funciona igual, sobre essas parcelas;
- um turno extra soma `horas do turno × dias úteis` à capacidade das máquinas escolhidas e produz na utilização
  atual de cada uma (60% da meta, se a máquina não tem histórico no período).

O resultado mostra a utilização antes e depois, o ganho em horas e a equivalência em dias de produção média.

## 12. Índice de apontamento por operador

Quatro pilares de 25%, de 0 a 100: motivos de improdutivo classificados; horas fora de apontamentos com mais de
10 h; ausência de sobreposição (dois registros do mesmo operador ao mesmo tempo, com 5 min de tolerância; os minutos
sobrepostos pesam três vezes); apontamentos feitos pelo coletor, não lançados à mão. O índice mede a qualidade do
registro, não o desempenho da pessoa.

## 13. Qualidade dos dados

Índice de 0 a 100 por máquina, consolidado pela capacidade de cada uma e acompanhado semana a semana:

| Pilar | Peso | Mede |
|---|---|---|
| Cobertura | 40% | capacidade com algum apontamento (produção ou parada) |
| Classificação | 20% | improdutivo com categoria de motivo |
| Sem excesso | 15% | produção fora de apontamentos com mais de 10 h |
| Sem conflito | 15% | produção que não se sobrepõe a uma parada na mesma máquina |
| Via coletor | 10% | apontamentos não lançados à mão |

Notas: A ≥ 90 · B 80–89 · C 70–79 · D 60–69 · E < 60. Abaixo de B, as outras telas devem ser lidas com cautela.

## 14. Calendário, escala e exceções

- **Tipo de dia.** Sem alteração, segunda a sexta é dia útil com os turnos marcados como padrão; sábado, domingo e
  feriados (nacionais, estaduais de SP e o aniversário do município) são folga ou feriado. O calendário permite
  mudar qualquer data, um intervalo ou todos os sábados, por exemplo.
- **Escala do mês.** Cada recurso precisa de uma escala validada: *fixo* ou *compartilhado* (geram capacidade nos
  turnos marcados), *eventual*, *sem turno* ou *inativo* (não geram). Recurso sem escala fica *a validar* e sem
  capacidade fixa. A base de demonstração traz a escala de janeiro a outubro de 2026 pré-validada a partir dos
  próprios apontamentos; os meses seguintes começam a partir de **Copiar mês**.
- **Copiar mês** leva, para cada dia da semana, o tipo de dia e os turnos mais frequentes no mês de origem
  (feriados continuam feriados), e a escala de cada recurso, mantendo a carga já informada no destino.
- **Sugestão de titular.** Para cada turno, a tela sugere as duas chapas que mais apareceram no recurso no miolo do
  turno (sem a primeira e a última hora), em dias úteis, com pelo menos 1 h no dia.
- **Exceções** mudam a capacidade operacional, nunca a fixa: remanejamento sem substituto, falta de operador e
  quebra tiram a janela do recurso de origem; remanejamento e cobertura eventual somam no destino; quebra também
  abre uma parada de manutenção no período; *sem programação* marca a janela como sem carga.

## 15. Horas extras

- **Programada:** por período e alvo (todas as máquinas, um grupo ou uma máquina). As horas de segunda a sexta são do
  período inteiro, divididas pelos dias úteis; sábado e domingo são horas em cada dia. Na capacidade, a janela de
  HE começa no fim do último turno do dia e respeita a disponibilidade da máquina.
- **Realizada:** produção dentro das janelas de HE. Até outubro de 2026, quando não havia lançamento, a HE é
  inferida do histórico: a produção além da jornada líquida do dia. A inferência pode ser desligada por mês, e
  um lançamento manual para o recurso e o dia sempre substitui a estimativa.

