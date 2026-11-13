-- =====================================================================
-- PULSO · Performance da Produção — modelo de dados
-- Base de demonstração com dados fictícios.
-- Desenvolvido por Gabriel Januário.
-- =====================================================================
PRAGMA foreign_keys = ON;

-- Empresa e arquivo de origem da carga
CREATE TABLE empresa (
  id      INTEGER PRIMARY KEY,
  nome    TEXT NOT NULL,
  fonte   TEXT NOT NULL
);

-- Centros de recurso (CR). usinagem = 1 → entra nos indicadores de máquina
CREATE TABLE centro_recurso (
  cr        TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  usinagem  INTEGER NOT NULL DEFAULT 0 CHECK (usinagem IN (0,1))
);

-- Máquinas e postos de trabalho
CREATE TABLE recurso (
  codigo   TEXT PRIMARY KEY,
  nome     TEXT NOT NULL,
  cr       TEXT NOT NULL REFERENCES centro_recurso(cr),
  familia  TEXT NOT NULL,
  inativo  INTEGER NOT NULL DEFAULT 0 CHECK (inativo IN (0,1))
);

-- Operadores (minutos_total = horas apontadas em todos os CRs, inclusive fora da usinagem)
CREATE TABLE operador (
  id            INTEGER PRIMARY KEY,
  nome          TEXT NOT NULL UNIQUE,
  chapa         INTEGER,
  minutos_total INTEGER NOT NULL DEFAULT 0
);

-- Quem lançou o apontamento: coletor de chão de fábrica ou digitação manual
CREATE TABLE usuario (
  id     INTEGER PRIMARY KEY,
  login  TEXT NOT NULL UNIQUE,
  tipo   TEXT NOT NULL CHECK (tipo IN ('coletor','manual'))
);

CREATE TABLE categoria_parada (
  codigo TEXT PRIMARY KEY,
  nome   TEXT NOT NULL
);

-- Motivos de parada: em apontamentos de parada, a coluna "operacao" guarda o código do motivo
CREATE TABLE motivo_parada (
  codigo    INTEGER PRIMARY KEY,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL REFERENCES categoria_parada(codigo)
);

CREATE TABLE origem (
  codigo    TEXT PRIMARY KEY,
  descricao TEXT NOT NULL
);

-- Fato: cada linha é um apontamento de produção ou de parada
CREATE TABLE apontamento (
  id           INTEGER PRIMARY KEY,
  data         TEXT    NOT NULL,              -- AAAA-MM-DD (data civil do início)
  inicio       TEXT    NOT NULL,              -- HH:MM
  duracao_min  INTEGER NOT NULL CHECK (duracao_min >= 0),
  operador_id  INTEGER NOT NULL REFERENCES operador(id),
  chapa        INTEGER,
  origem       TEXT    NOT NULL REFERENCES origem(codigo),
  op_numero    INTEGER NOT NULL,              -- ordem de produção (em paradas: código do grupo de parada)
  pv_numero    INTEGER NOT NULL,              -- pedido de venda (0/3 = interno)
  item         INTEGER NOT NULL,
  operacao     INTEGER NOT NULL,              -- nº da operação do roteiro ou código do motivo de parada
  recurso      TEXT    NOT NULL REFERENCES recurso(codigo),
  centro_custo INTEGER,
  usuario_id   INTEGER REFERENCES usuario(id),
  tipo         TEXT    NOT NULL CHECK (tipo IN ('producao','parada'))
);
CREATE INDEX ix_apont_data     ON apontamento(data);
CREATE INDEX ix_apont_recurso  ON apontamento(recurso, data);
CREATE INDEX ix_apont_operador ON apontamento(operador_id, data);
CREATE INDEX ix_apont_op       ON apontamento(op_numero);

-- ---------------------------------------------------------------------
-- Visões de apoio
-- ---------------------------------------------------------------------
-- Carteira de demonstração: horas previstas e entrega de cada PV (fictícias, para a tela Carteira e prazos).
-- PV sem apontamento informa o grupo de máquinas onde será usinado.
CREATE TABLE carteira_pv (
  pv_numero       INTEGER PRIMARY KEY,
  horas_previstas REAL NOT NULL CHECK (horas_previstas > 0),
  entrega         TEXT NOT NULL,
  grupo           TEXT
);

CREATE VIEW vw_apontamento AS
SELECT a.id, a.data, a.inicio, a.duracao_min, ROUND(a.duracao_min/60.0,2) AS horas,
       a.tipo, r.codigo AS recurso, r.nome AS recurso_nome, r.familia, r.cr, c.usinagem,
       o.nome AS operador, a.chapa, a.origem, a.op_numero, a.pv_numero, a.item, a.operacao,
       CASE WHEN a.tipo='parada' THEN m.descricao END AS motivo,
       CASE WHEN a.tipo='parada' THEN m.categoria END AS categoria_parada,
       u.login AS lancado_por, u.tipo AS meio_lancamento
FROM apontamento a
JOIN recurso r        ON r.codigo = a.recurso
JOIN centro_recurso c ON c.cr = r.cr
JOIN operador o       ON o.id = a.operador_id
LEFT JOIN usuario u   ON u.id = a.usuario_id
LEFT JOIN motivo_parada m ON m.codigo = a.operacao;

-- Horas produtivas por máquina e mês (só usinagem)
CREATE VIEW vw_horas_maquina_mes AS
SELECT substr(data,1,7) AS mes, recurso, recurso_nome, familia,
       ROUND(SUM(duracao_min)/60.0,1) AS horas_produtivas, COUNT(*) AS apontamentos
FROM vw_apontamento
WHERE tipo='producao' AND usinagem=1
GROUP BY mes, recurso;

-- Paradas por motivo e categoria
CREATE VIEW vw_paradas_motivo AS
SELECT COALESCE(motivo,'Cód. '||operacao) AS motivo, COALESCE(categoria_parada,'nc') AS categoria,
       ROUND(SUM(duracao_min)/60.0,1) AS horas, COUNT(*) AS apontamentos
FROM vw_apontamento
WHERE tipo='parada'
GROUP BY 1,2
ORDER BY horas DESC;
