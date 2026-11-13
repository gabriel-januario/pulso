// @ts-nocheck
/* =====================================================================
   PULSO · motor de indicadores (núcleo legado)
   ---------------------------------------------------------------------
   Extraído sem alteração de regra de negócio do PULSO v2.2 (arquivo único).
   Todo o estado que antes era global (base, configuração, caches) agora
   vive dentro de createEngine(). A API tipada está em ./index.ts e os
   resultados são travados por tests/engine.test.ts (valores de referência
   capturados do v2.2). Migração para TypeScript estrito: gradual, função
   a função, sempre com os testes verdes.
   ===================================================================== */
export function createEngine(raw, cfgInput, options = {}) {
const isImported = !!options.imported;
const USIN_CR = new Set(['52010','52020']);
const DAY0 = 360; // dia produtivo 06:00 → 06:00
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf1 = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const nf0 = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const H = m => nf1.format((m||0)/60);
const H0 = m => nf0.format((m||0)/60);
const P = v => (v==null||!isFinite(v)) ? '—' : nf0.format(v*100)+'%';
const EPOCH = Date.UTC(1899,11,30);
const s2iso = s => new Date(EPOCH+s*864e5).toISOString().slice(0,10);
const iso2s = iso => Math.round((Date.parse(iso+'T00:00:00Z')-EPOCH)/864e5);
const WD = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const dm = iso => iso.slice(8,10)+'/'+iso.slice(5,7);
const dmy = iso => iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
const wday = iso => new Date(iso+'T12:00:00Z').getUTCDay();
const toMin = s => { const [h,m]=String(s||'0:0').split(':').map(Number); return (h||0)*60+(m||0); };
const hhmm = m => { m=Math.round(((m%1440)+1440)%1440); return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); };
const m2iso = m => s2iso(Math.floor(m/1440));
const fmtDT = m => dm(m2iso(m))+' '+hhmm(m);
const nowMin = () => (Date.now()-new Date().getTimezoneOffset()*60000-EPOCH)/60000;
const dtl2min = v => { if(!v) return null; const [d,t]=v.split('T'); return iso2s(d)*1440+toMin(t||'00:00'); };
const min2dtl = m => m2iso(m)+'T'+hhmm(m);
/* Feriados nacionais, estaduais (SP) e o aniversário do município-sede. Exceções da fábrica têm prioridade. */
const HOL = {"2026-01-01": "Confraternização Universal", "2026-04-03": "Sexta-feira da Paixão", "2026-04-21": "Tiradentes", "2026-05-01": "Dia do Trabalho", "2026-06-04": "Corpus Christi", "2026-07-09": "Revolução Constitucionalista · SP", "2026-09-07": "Independência do Brasil", "2026-10-12": "Nossa Senhora Aparecida", "2026-11-02": "Finados", "2026-11-15": "Proclamação da República", "2026-11-20": "Consciência Negra", "2026-12-05": "Aniversário do município", "2026-12-25": "Natal", "2027-01-01": "Confraternização Universal", "2027-03-26": "Sexta-feira da Paixão", "2027-04-21": "Tiradentes", "2027-05-01": "Dia do Trabalho", "2027-05-27": "Corpus Christi", "2027-07-09": "Revolução Constitucionalista · SP", "2027-09-07": "Independência do Brasil", "2027-10-12": "Nossa Senhora Aparecida", "2027-11-02": "Finados", "2027-11-15": "Proclamação da República", "2027-11-20": "Consciência Negra", "2027-12-05": "Aniversário do município", "2027-12-25": "Natal"};
const FACULT = {'2026-01-02':'Ponte de Ano Novo','2026-02-16':'Ponte de Carnaval','2026-02-17':'Carnaval','2026-02-18':'Cinzas (até 13h)','2026-04-02':'Quinta-feira Santa','2026-04-20':'Ponte de Tiradentes','2026-06-05':'Ponte de Corpus Christi','2026-07-10':'Ponte de 9 de Julho','2026-10-30':'Dia do Servidor Público','2027-02-08':'Carnaval','2027-02-09':'Carnaval','2027-02-10':'Cinzas'};
const DAYTYPES = [['util','Dia útil'],['folga','Folga'],['fer','Feriado'],['manut','Parada programada']];
const GRP_ORDER = ['Mandrilhadoras','Centros de usinagem','Tornos verticais','Tornos horizontais','Furadeiras radiais','Plainas e fresadoras','Outros postos'];
const CATS = [['nc','Não classificado'],['man','Manutenção'],['setup','Setup / preparação'],['mat','Falta de material'],['prog','Falta de programa / desenho'],['qual','Qualidade / retrabalho'],['org','Organização / limpeza'],['pess','Pessoal / reunião'],['out','Outros']];
const CATN = Object.fromEntries(CATS);
const PTYPES = ['Mecânica','Elétrica','Hidráulica','Preventiva','Aguardando peça','Outros'];
function fam(n){ n=String(n).toUpperCase();
  if(/^MANDRI/.test(n)) return 'Mandrilhadoras'; if(/^CENTRO/.test(n)) return 'Centros de usinagem';
  if(/^TORNO VERT/.test(n)) return 'Tornos verticais'; if(/^TORNO/.test(n)) return 'Tornos horizontais';
  if(/^FURADEIRA/.test(n)) return 'Furadeiras radiais'; if(/^(PLAINA|FRESADORA)/.test(n)) return 'Plainas e fresadoras'; return 'Outros postos'; }
const shortNm = n => { const w=title(n).split(' '); const o=[w[0]]; for(let i=1;i<w.length;i++){ o.push(w[i]); if(!/^(da|de|do|das|dos|e)$/i.test(w[i])) break; } return o.join(' '); };
const title = s => String(s).toLowerCase().replace(/(^|\s|\.|\/|-)([a-zà-ú])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\b(Cnc|Mos|Mod|Tos|Hp100|Twhs3|Hcp|Frn60|Frn|Frn80|Gl280m|S-30a|Mc220|In|Vr8|Vr8a|2h58|80a|Ii|Mhs|You-Ji|Mas|Okuma)\b/gi,w=>w.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g,w=>w.toLowerCase());

/* ================= dados ================= */
let DS = null;
function build(raw){
  const R = raw.rows.map(r=>{ const rs=raw.res[r[10]]||['?','?','']; const t0=r[0]*1440+r[1]; const pd=Math.floor((t0-DAY0)/1440);
    return {t0,min:r[2],pd,date:s2iso(pd),op:raw.ops[r[3]],oi:r[3],chapa:r[4],org:String(r[5]),opn:r[6],ped:r[7],item:r[8],oper:r[9],rc:rs[0],rn:rs[1],cr:String(rs[2]),cc:r[11],user:raw.users[r[12]]||''}; });
  for(const x of R){ x.isMach=USIN_CR.has(x.cr)&&x.rc!=='IMP'; x.isStop=x.org==='900'||x.rc==='IMP'; x.manual=!/^coletor/i.test(x.user); }
  const opM={};
  for(const x of R) if(!x.isStop&&x.isMach) opM[x.oi]=(opM[x.oi]||0)+x.min;
  const tot = i => (raw.opTot&&raw.opTot[i]) || 0;
  const usinOps=new Set(Object.keys(opM).filter(i=>opM[i]/Math.max(tot(i),opM[i])>=0.5).map(i=>raw.ops[i]));
  const prod=R.filter(x=>x.isMach&&!x.isStop);
  const stops=R.filter(x=>x.isStop&&(x.isMach||usinOps.has(x.op)));
  const byOD={}; for(const x of prod){ (byOD[x.op+'|'+x.pd] ||= []).push(x); }
  for(const k in byOD) byOD[k].sort((a,b)=>a.t0-b.t0);
  for(const s of stops){
    if(s.isMach){ s.mach=s.rc; s.inf=false; continue; }
    const L=byOD[s.op+'|'+s.pd]; let best=null;
    if(L){ for(const x of L) if(x.t0<=s.t0) best=x; if(!best) best=L[0]; }
    s.mach=best?best.rc:null; s.inf=true;
  }
  const machines={};
  for(const x of prod.concat(stops.filter(s=>!s.inf))){ if(machines[x.rc]) continue;
    const inat=/INATIVO/i.test(x.rn); machines[x.rc]={rc:x.rc,name:inat?x.rc+' (inativo)':title(x.rn),raw:x.rn,cr:x.cr,fam:inat?'Outros postos':fam(x.rn),inat}; }
  const night={},tt={},dset={};
  for(const x of prod){ const cm=((x.t0%1440)+1440)%1440; tt[x.rc]=(tt[x.rc]||0)+x.min; if(cm>=16*60+30||cm<180) night[x.rc]=(night[x.rc]||0)+x.min; (dset[x.rc] ||= new Set()).add(x.pd); }
  for(const rc in machines){ const m=machines[rc]; m.night=(night[rc]||0)/(tt[rc]||1); m.hday=(tt[rc]||0)/60/((dset[rc]&&dset[rc].size)||1);
    m.twoShifts = m.hday>=9.5 || (m.night>=0.25 && m.hday>=6); m.sugT=m.twoShifts?2:1; }
  const byRc={}, byOp={};
  for(const x of prod){ (byRc[x.rc] ||= []).push(x); (byOp[x.op] ||= []).push(x); }
  for(const k in byRc) byRc[k].sort((a,b)=>a.t0-b.t0);
  for(const k in byOp) byOp[k].sort((a,b)=>a.t0-b.t0);
  const all=prod.concat(stops); let minPd=Infinity,maxPd=-Infinity,lastT=0;
  for(const x of all){ if(x.pd<minPd) minPd=x.pd; if(x.pd>maxPd) maxPd=x.pd; if(x.t0+x.min>lastT) lastT=x.t0+x.min; }
  return {R,prod,stops,machines,usinOps,byRc,byOp,minPd,maxPd,lastT,meta:raw.meta||{},nAll:R.length};
}

/* ================= configuração ================= */
/* Turnos por recurso conforme o relatório "Capacidade Instalada" do ERP (impressão 03/09/2026).
   Recursos fora desta lista começam com a sugestão tirada dos apontamentos e ficam marcados "conferir". */
const ERP_TURNOS = {MHG1:2,MHMC2:2,MHMC1:2,MHG2:2,MHGC1:2,MHP1:1,CUHCNC:2,TVMC:1,TVGC:2,TVG1:2,TVG:1,THPC:1,THPC1:1,THMC:1,THGC:1,PFR:2,PFR1:1};
const weekKey = iso => s2iso(iso2s(iso)-((wday(iso)+6)%7));
const MOTIVOS_PADRAO = {"5":{"n":"Ginástica laboral","c":"pess"},"10":{"n":"Preparação de máquina (setup)","c":"setup"},"20":{"n":"Troca de ferramenta","c":"setup"},"30":{"n":"Aguardando ponte rolante","c":"org"},"40":{"n":"Aguardando material","c":"mat"},"50":{"n":"Aguardando programa CNC","c":"prog"},"60":{"n":"Aguardando desenho / revisão","c":"prog"},"70":{"n":"Aguardando inspeção","c":"qual"},"80":{"n":"Limpeza e organização do posto","c":"org"},"90":{"n":"Reunião / treinamento","c":"pess"},"100":{"n":"Retrabalho","c":"qual"},"115":{"n":"Falta de operador","c":"pess"},"121":{"n":"Manutenção preventiva","c":"man"},"122":{"n":"Manutenção hidráulica","c":"man"},"123":{"n":"Manutenção elétrica","c":"man"},"124":{"n":"Manutenção mecânica","c":"man"},"125":{"n":"Aguardando peça de reposição","c":"man"},"126":{"n":"Falha no CNC / comando","c":"man"},"127":{"n":"Lubrificação","c":"man"},"137":{"n":"Aguardando dispositivo de fixação","c":"setup"},"147":{"n":"Falta de energia / utilidades","c":"out"},"155":{"n":"Montagem e ajuste da peça","c":"setup"},"157":{"n":"Medição em máquina","c":"qual"},"159":{"n":"Aguardando ordem de produção","c":"org"}};
function defaultCfg(){ return {v:5, escala:{}, ex:{}, heOff:[],
  shifts:[{id:'T1',nome:'1º Turno',ini:'07:00',fim:'16:48',int:60,h:8,def:true},
          {id:'T2',nome:'2º Turno',ini:'16:48',fim:'02:30',int:60,h:8,def:true},
          {id:'T3',nome:'Apoio madrugada',ini:'02:30',fim:'07:00',int:0,h:4.5,def:false}],
  cart:{}, adj:{}, cal:{}, mach:{}, machM:{}, he:[], corte:'dados', motivos:JSON.parse(JSON.stringify(MOTIVOS_PADRAO)), meta:85, alerta:65, evt:{}, paradas:[], man:{maxDias:5,suspH:4}}; }
let cfg = defaultCfg();
function mergeCfg(o){ const d=defaultCfg(); if(!o||typeof o!=='object') return d;
  const mot={}; for(const [k,v] of Object.entries(o.motivos&&Object.keys(o.motivos).length?o.motivos:d.motivos)) mot[k]=typeof v==='string'?{n:v,c:'nc'}:{n:v.n||'',c:v.c||'nc'};
  const ver=+o.v||1;
  const shifts=Array.isArray(o.shifts)&&o.shifts.length?o.shifts.map(s=>({...s})):d.shifts;
  const cal={}; for(const [k,v] of Object.entries(o.cal||{})){ if(!/^\d{4}-\d{2}-\d{2}$/.test(k)||!v||typeof v!=='object') continue;
    cal[k]={t:typeof v.t==='string'?v.t:'util',sh:Array.isArray(v.sh)?v.sh.filter(x=>typeof x==='string'):[]}; }
  const he=Array.isArray(o.he)?o.he.filter(x=>x&&typeof x==='object'&&typeof x.alvo==='string'&&(typeof x.ini==='string'||typeof x.wk==='string')).map(x=>({...x})):[];
  const mach={}; for(const [rc,c] of Object.entries(o.mach||{})) if(c&&typeof c==='object') mach[rc]={...c};
  if(ver<3){
    // 1) horas líquidas por turno: padrão do ERP = 8 h por turno por dia útil
    for(const s of shifts) if(s.h==null) s.h=(s.id==='T1'||s.id==='T2')?8:+(Math.max(0,shiftDur(s)-(+s.int||0))/60).toFixed(2);
    // 2) dias marcados como "hora extra" no calendário antigo viram lançamentos de hora extra
    for(const [iso,c] of Object.entries(cal)){ if(c.t!=='extra') continue; const w=wday(iso);
      const hrs=c.sh.reduce((q,id)=>{ const s=shifts.find(x=>x.id===id); return q+(s?+s.h||0:0); },0);
      if(w===0||w===6){ const wk=weekKey(iso); let L=he.find(x=>x.wk===wk&&x.alvo==='all'&&x.mig);
        if(!L){ L={id:'mig'+wk,wk,alvo:'all',sem:0,sab:0,dom:0,obs:'Convertido do calendário anterior',mig:true}; he.push(L); }
        if(w===6) L.sab+=hrs; else L.dom+=hrs; delete cal[iso]; }
      else cal[iso]={t:'util',sh:c.sh}; }
    // 3) turnos por máquina: ERP quando existe; o restante precisa ser conferido
    for(const rc in mach){ const c=mach[rc]; if(ERP_TURNOS[rc]!=null){ c.sh=shifts.slice(0,ERP_TURNOS[rc]).map(s=>s.id); c.src='erp'; } else c.src='conferir'; }
  }
  for(const s of shifts){ s.h=s.h==null?null:Math.max(0,+s.h||0); }
  const machM={}; for(const [ym,o2] of Object.entries(o.machM||{})){ if(!/^\d{4}-\d{2}$/.test(ym)||!o2||typeof o2!=='object') continue; machM[ym]={}; for(const [rc,v] of Object.entries(o2)) if(Array.isArray(v)) machM[ym][rc]=v.filter(x=>typeof x==='string'); }
  const escala={}, ex={};
  for(const [ym,rr] of Object.entries(o.escala||{})){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)||!rr||typeof rr!=='object') continue;
    escala[ym]={};
    for(const [rc,v] of Object.entries(rr)){
      if(!v||!Object.hasOwn(ROSTER_MODES,v.modo)) continue;
      const turnos=Object.fromEntries(shifts.filter(s=>Object.hasOwn(v.turnos||{},s.id)).map(s=>[s.id,String(v.turnos[s.id]||'')]));
      escala[ym][rc]={modo:v.modo,turnos,obs:String(v.obs||''),crit:!!v.crit,carga:v.carga==null?null:Math.max(0,Number(v.carga)||0)};
    }
  }
  for(const [d,rows] of Object.entries(o.ex||{})){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Array.isArray(rows)) continue;
    ex[d]=rows.filter(v=>v&&typeof v.rc==='string'&&Object.hasOwn(EX_TYPES,v.tipo)&&shifts.some(s=>s.id===v.sh)).map(v=>({...v}));
  }
  return {v:5, cart:(o.cart&&typeof o.cart==='object')?o.cart:{}, adj:(o.adj&&typeof o.adj==='object')?o.adj:{}, escala, ex, heOff:Array.isArray(o.heOff)?o.heOff.filter(v=>/^\d{4}-\d{2}$/.test(v)):[], _log:(o._log&&typeof o._log==='object')?o._log:null, shifts, cal, mach, machM, he, corte:o.corte==='dia'?'dia':'dados', motivos:mot,
    meta:isFinite(+o.meta)?+o.meta:85, alerta:isFinite(+o.alerta)?+o.alerta:65, evt:o.evt||{}, paradas:Array.isArray(o.paradas)?o.paradas:[],
    man:{maxDias:isFinite(+o.man?.maxDias)?+o.man.maxDias:5, suspH:isFinite(+o.man?.suspH)?+o.man.suspH:4}}; }
const shiftDur = s => ((toMin(s.fim)-toMin(s.ini))+1440)%1440||1440;
/* horas líquidas que entram na capacidade (campo "h" do turno); sem ele, janela − intervalo */
const shiftMin = s => !s ? 0 : (s.h!=null&&s.h!==''&&isFinite(+s.h)) ? Math.max(0,+s.h*60) : Math.max(0,shiftDur(s)-(+s.int||0));
const shById = id => cfg.shifts.find(s=>s.id===id);
function dayCfg(iso){ const c=cfg.cal[iso]; if(c) return c; const w=wday(iso);
  if(HOL[iso]) return {t:'fer',sh:[]};
  if(w>=1&&w<=5) return {t:'util',sh:cfg.shifts.filter(s=>s.def).map(s=>s.id)};
  return {t:'folga',sh:[]}; }
const isWork = d => d.t==='util'||d.t==='extra';
function machCfg(rc){ const c=cfg.mach[rc]; const m=DS.machines[rc]; const n=ERP_TURNOS[rc];
  const nt=n!=null?n:(m&&m.sugT)||1;
  const base={on:!(m&&m.inat),sh:cfg.shifts.slice(0,nt).map(s=>s.id),disp:100,grp:m?m.fam:'Outros postos',src:n!=null?'erp':'conferir'};
  return c?Object.assign(base,c):base; }
/* A escala mensal é aprovada pela produção. O ERP é apenas referência para preencher o cadastro. */
const nextYM=ym=>{ const [Y,M]=ym.split('-').map(Number); return M===12?`${Y+1}-01`:`${Y}-${String(M+1).padStart(2,'0')}`; };
const prevYM=ym=>{ const [Y,M]=ym.split('-').map(Number); return M===1?`${Y-1}-12`:`${Y}-${String(M-1).padStart(2,'0')}`; };
const ROSTER_MODES={fixo:'Fixo',compartilhado:'Compartilhado',eventual:'Eventual',sem_turno:'Sem turno',inativo:'Inativo',pendente:'A validar'};
const EX_TYPES={troca:'Remanejamento',operador:'Sem operador',quebra:'Manutenção / quebra',carga:'Sem programação',apoio:'Cobertura eventual'};
const dayEdits = d => cfg.ex[d]||[];
function shiftWindow(id,p){
  const s=shById(id); if(!s) return null;
  const a=p*1440+DAY0+(((toMin(s.ini)-DAY0)%1440)+1440)%1440;
  return {a,b:a+shiftDur(s),c:shiftMin(s),id,he:false};
}
function editWindow(e,d){
  const w=shiftWindow(e.sh,iso2s(d)); if(!w) return null;
  const inside = t => {
    const p=iso2s(d)*1440+DAY0;
    let n=p+(((toMin(t)-DAY0)%1440)+1440)%1440;
    if(n<w.a) n+=1440;
    return n;
  };
  const a=e.ini?inside(e.ini):w.a, b=e.fim?inside(e.fim):w.b;
  return a>=w.a&&b<=w.b&&b>a?{a,b,c:(b-a)*w.c/(w.b-w.a)}:null;
}
function mergedIntervals(L){
  const out=[];
  for(const [a,b] of L.slice().sort((x,y)=>x[0]-y[0])){
    if(b<=a) continue;
    const last=out[out.length-1];
    if(last&&a<=last[1]) last[1]=Math.max(last[1],b); else out.push([a,b]);
  }
  return out;
}
function outsideIntervals(a,b,L){
  const out=[];
  for(const [s,e] of L){
    if(e<=a) continue;
    if(s>=b) break;
    if(s>a) out.push([a,s]);
    a=Math.max(a,e);
  }
  if(a<b) out.push([a,b]);
  return out;
}
function intervalMinutes(L,W){
  const windows=mergedIntervals(W.map(w=>[w.a,w.b]));
  let min=0;
  for(const [a,b] of L) for(const [s,e] of windows) min+=Math.max(0,Math.min(b,e)-Math.max(a,s));
  return min;
}
function windowMinutes(W,end=Infinity,start=-Infinity){
  return W.reduce((q,w)=>q+Math.max(0,Math.min(w.b,end)-Math.max(w.a,start))*w.c/(w.b-w.a),0);
}
function shiftImpact(rc,d){
  const blocks=[], gains=[], noLoad=[];
  for(const e of dayEdits(d)){
    if(e.rc!==rc&&e.dst!==rc) continue;
    const w=editWindow(e,d); if(!w) continue;
    if(e.rc===rc){
      if(e.tipo==='carga') noLoad.push(w);
      else if(e.tipo==='apoio') gains.push(w);
      else if(e.tipo==='quebra'||!e.coberta) blocks.push(w);
    }
    if(e.dst===rc&&(e.tipo==='troca'||e.tipo==='quebra')) gains.push(w);
  }
  return {blocks,gains,noLoad};
}
let OPERW=new Map();
function operationalWins(rc,p){
  const k=rc+'|'+p;
  if(OPERW.has(k)) return OPERW.get(k);
  const iso=s2iso(p), W=dayWins(rc,p), {blocks,gains}=shiftImpact(rc,iso);
  const manual=cfg.paradas.filter(e=>e.rc===rc&&e.ini).map(e=>[dtl2min(e.ini),e.fim?dtl2min(e.fim):nowMin()]);
  const remove=mergedIntervals([...blocks.map(w=>[w.a,w.b]),...manual]);
  const out=W.flatMap(w=>outsideIntervals(w.a,w.b,remove).map(([a,b])=>({...w,a,b,c:w.c*(b-a)/(w.b-w.a)})));
  for(const w of gains){
    const covered=mergedIntervals(out.map(v=>[v.a,v.b]));
    for(const [a,b] of outsideIntervals(w.a,w.b,covered)) out.push({...w,a,b,c:w.c*(b-a)/(w.b-w.a),he:false});
  }
  OPERW.set(k,out); return out;
}
/* Base de demonstração: escala jan–out/2026 pré-validada a partir dos próprios apontamentos
   (≥ 12 dias com produção no mês → fixo nos turnos cadastrados; menos → eventual). Bases importadas não usam isto. */
let DEMO_DS=null, DEMO_ACT=null;
function demoRoster(rc,ym){
  if(isImported||ym<'2026-01'||ym>'2026-10') return null;
  if(DEMO_DS!==DS){ DEMO_DS=DS; DEMO_ACT={}; for(const x of DS.prod){ const k=x.rc+'|'+x.date.slice(0,7); (DEMO_ACT[k] ||= new Set()).add(x.pd); } }
  const m=DS.machines[rc]; const obs='Escala de demonstração';
  if(!m||m.inat) return {modo:'inativo',turnos:{},obs};
  const n=DEMO_ACT[rc+'|'+ym]?.size||0;
  if(n>=12) return {modo:'fixo',turnos:Object.fromEntries(machCfg(rc).sh.map(id=>[id,''])),obs};
  return {modo:n?'eventual':'sem_turno',turnos:{},obs};
}
function rosterEntry(rc,ym){
  const current=cfg.escala[ym]?.[rc];
  if(current) return current;
  const demo=demoRoster(rc,ym); if(demo) return demo;
  const legacy=cfg.machM[ym]?.[rc];
  if(Array.isArray(legacy)) return {modo:legacy.length?'fixo':'inativo',turnos:Object.fromEntries(legacy.map(id=>[id,''])),obs:'Migrado do cadastro mensal'};
  if(rc===CUTMAX&&ym>='2026-10'&&ym<='2026-12') return {modo:'fixo',turnos:{T1:'',T2:''},obs:'Regime informado: dois turnos de 8 h'};
  return null;
}
function rosterModes(ym){
  const values=Object.keys(DS.machines).map(rc=>rosterEntry(rc,ym)?.modo||'pendente');
  return {valid:values.filter(v=>v!=='pendente').length,pending:values.filter(v=>v==='pendente').length};
}
let MCM=new Map();
function machCfgM(rc,ym){
  const k=rc+'|'+ym; let v=MCM.get(k); if(v) return v;
  const base=machCfg(rc), row=rosterEntry(rc,ym);
  const modo=row?.modo||'pendente', eligible=modo==='fixo'||modo==='compartilhado';
  const sh=eligible?cfg.shifts.filter(s=>Object.hasOwn(row.turnos,s.id)).map(s=>s.id):[];
  v={...base,on:sh.length>0,sh,modo,src:row?'mes':'conferir'};
  MCM.set(k,v); return v;
}
const grpOf = rc => machCfg(rc).grp || DS.machines[rc]?.fam || 'Outros postos';
const SRC_TXT = {erp:'ERP',usuario:'Conferido',conferir:'Conferir',mes:'Definido no mês',apont:'Apontamento'};
function turnosTxt(mc){ if(!mc.on||!mc.sh.length) return ROSTER_MODES[mc.modo]||'Inativa'; const ids=cfg.shifts.map(s=>s.id); const std=mc.sh.length<=ids.length&&mc.sh.every((id,i)=>ids[i]===id);
  return std?`${mc.sh.length} turno${mc.sh.length>1?'s':''}`:mc.sh.join('+'); }
const hDia = mc => mc.on ? mc.sh.reduce((q,id)=>q+shiftMin(shById(id)),0) : 0;

/* ---------- horas extras ----------
   Lançamento por período (início e fim informados no calendário; lançamentos antigos usam a semana):
   sem = h por máquina distribuídas nos dias úteis de seg–sex do período, sab = h em cada sábado,
   dom = h em cada domingo. Alvo: todas as máquinas, um grupo ou uma máquina.      */
const heMatch = (h,rc) => h.alvo==='all' || h.alvo==='m:'+rc || h.alvo==='g:'+grpOf(rc);
let WINC=new Map(), UTW=new Map();
function clearCap(){ WINC=new Map(); UTW=new Map(); MCM=new Map(); OPERW=new Map(); }
const heIni = h => h.ini || h.wk;
const heFim = h => h.fim || s2iso(iso2s(h.wk)+6);
const perLabel = h => `${dmy(heIni(h))} a ${dmy(heFim(h))}`;
function utilInRange(a,b){ const k=a+'|'+b; let n=UTW.get(k); if(n!=null) return n; n=0; for(let p=iso2s(a);p<=iso2s(b);p++){ const d=s2iso(p), w=wday(d); if(w>=1&&w<=5&&isWork(dayCfg(d))) n++; } UTW.set(k,n); return n; }
const utilInHE = h => utilInRange(heIni(h),heFim(h));
function heDay(rc,iso,only,specific=false){ if(!cfg.he.length) return 0; const w=wday(iso); let m=0;
  for(const h of cfg.he){ if((only&&h!==only)||iso<heIni(h)||iso>heFim(h)||!heMatch(h,rc)||(specific&&h.alvo!=='m:'+rc)) continue;
    if(w===6) m+=(+h.sab||0)*60; else if(w===0) m+=(+h.dom||0)*60;
    else if(heIni(h)===heFim(h)) m+=(+h.sem||0)*60;
    else if(isWork(dayCfg(iso))){ const n=utilInHE(h); if(n) m+=(+h.sem||0)*60/n; } }
  return m; }
/* janelas de capacidade do dia produtivo p (06:00 → 06:00): turnos da máquina + hora extra */
const HE_HISTORY_END='2026-10-31';
const CUTMAX='MHMC2';
function regularWins(rc,p,reference=false){
  const iso=s2iso(p), ym=iso.slice(0,7), day=dayCfg(iso), mc=machCfgM(rc,ym);
  if(!isWork(day)||(!mc.on&&!reference)) return [];
  const row=rosterEntry(rc,ym);
  const ids=mc.on?mc.sh:!row||row.modo==='pendente'?cfg.shifts.slice(0,rc===CUTMAX?2:ERP_TURNOS[rc]||0).map(s=>s.id):[];
  return day.sh.filter(id=>ids.includes(id)).map(id=>shiftWindow(id,p)).filter(Boolean).map(w=>({...w,c:reference?w.c:w.c*mc.disp/100}));
}
function historicalHE(rc,iso,production,declared){
  if(iso>HE_HISTORY_END||cfg.heOff.includes(iso.slice(0,7))) return [];
  const p=iso2s(iso), ym=iso.slice(0,7), row=rosterEntry(rc,ym);
  if(row&&['eventual','sem_turno','inativo'].includes(row.modo)) return [];
  if(!machCfgM(rc,ym).on&&rc!==CUTMAX&&!ERP_TURNOS[rc]) return [];
  if(dayEdits(iso).some(e=>e.tipo==='apoio'&&e.rc===rc||e.dst===rc)) return [];
  // Lançamentos manuais do mesmo recurso e dia substituem a estimativa histórica.
  if(heDay(rc,iso,null,!machCfgM(rc,ym).on)>0) return [];
  const start=p*1440+DAY0, end=start+1440;
  const fixed=regularWins(rc,p-1,true).concat(regularWins(rc,p,true)).filter(w=>w.c>0&&w.a<end&&w.b>start);
  const normal=mergedIntervals(fixed.map(w=>[Math.max(w.a,start),Math.min(w.b,end)]));
  const consumed=mergedIntervals(declared.map(w=>[w.a,w.b]));
  const entries=production.flatMap(([a,b])=>outsideIntervals(a,b,consumed));
  const extra=entries.flatMap(([a,b])=>outsideIntervals(a,b,normal));
  // Nas janelas brutas dos turnos, separar apenas o excedente da jornada líquida diária.
  let budget=windowMinutes(fixed,end,start);
  for(const [a,b] of entries) for(const [x,y] of normal){
    const s=Math.max(a,x), e=Math.min(b,y); if(e<=s) continue;
    const used=Math.min(budget,e-s); budget-=used;
    if(s+used<e) extra.push([s+used,e]);
  }
  return mergedIntervals(extra);
}
function mergeLegacyOperations(input){
  if(!input||typeof input!=='object'||!['he','paradas','motivos','evt','man'].some(k=>Object.hasOwn(input,k))) throw new Error('Escolha um backup de configuração do PULSO.');
  const old=mergeCfg(input);
  const stops=new Map(cfg.paradas.map(p=>[p.id||[p.rc,p.ini].join('|'),p]));
  for(const p of old.paradas) if(p?.rc&&p.ini){
    const key=p.id||[p.rc,p.ini].join('|');
    if(!stops.has(key)&&![...stops.values()].some(x=>x.rc===p.rc&&x.ini===p.ini)) stops.set(key,p);
  }
  const signature=h=>JSON.stringify([heIni(h),heFim(h),h.alvo,+h.sem||0,+h.sab||0,+h.dom||0]);
  const seen=new Set(cfg.he.map(signature)), ids=new Set(cfg.he.map(h=>h.id));
  for(const h of old.he) if(!seen.has(signature(h))&&(!h.id||!ids.has(h.id))){
    cfg.he.push({...h,id:h.id||'he-backup-'+cfg.he.length}); seen.add(signature(h)); if(h.id) ids.add(h.id);
  }
  cfg.paradas=[...stops.values()]; cfg.motivos={...old.motivos,...cfg.motivos}; cfg.evt={...old.evt,...cfg.evt};
  if(input.man) cfg.man={...cfg.man,...old.man};
}

function dayWins(rc,p){
  const key=rc+'|'+p; if(WINC.has(key)) return WINC.get(key);
  const iso=s2iso(p), mc=machCfgM(rc,iso.slice(0,7)), d=dayCfg(iso), k=(+mc.disp||0)/100;
  const W=regularWins(rc,p);
  const he=mc.modo!=='inativo'?heDay(rc,iso,null,!mc.on):0;
  if(he>0){
    const s0=shiftWindow(cfg.shifts[0].id,p);
    const a=W.length?Math.max(...W.map(w=>w.b)):s0.a;
    W.push({a,b:a+he,c:he*k,he:true});
  }
  WINC.set(key,W); return W;
}
/* corte: a capacidade só é contada até o último apontamento da base (ou até o fim do último dia) */
const cutT = () => cfg.corte==='dia' ? (DS.maxPd+1)*1440+DAY0 : DS.lastT;
function capParts(rc,iso,noCut){
  const p=iso2s(iso), start=p*1440+DAY0, end=Math.min(start+1440,noCut?Infinity:cutT());
  const W=dayWins(rc,p-1).concat(dayWins(rc,p)), O=operationalWins(rc,p-1).concat(operationalWins(rc,p));
  return {n:windowMinutes(W.filter(w=>!w.he),end,start),he:windowMinutes(W.filter(w=>w.he),end,start),op:windowMinutes(O,end,start)};
}
function capMin(rc,iso,noCut){ const c=capParts(rc,iso,noCut); return c.n+c.he; }
/* capacidade (min) da máquina dentro do intervalo absoluto [a,b) — usado para tempo parado real */
function capSeg(rc,a,b,cb){ if(b<=a) return 0; let tot=0;
  const p0=Math.floor((a-DAY0)/1440)-1, p1=Math.floor((b-DAY0)/1440);
  for(let p=p0;p<=p1;p++) for(const w of dayWins(rc,p)){ const ov=Math.min(b,w.b)-Math.max(a,w.a);
    if(ov>0&&w.b>w.a){ const v=ov*w.c/(w.b-w.a); tot+=v; if(cb) cb(s2iso(p),v); } }
  return tot; }
const motName = c => (cfg.motivos[c]&&cfg.motivos[c].n&&cfg.motivos[c].n.trim()) || ('Cód. '+c);
const hasMaintenanceMap = () => Object.values(cfg.motivos).some(m=>m.c==='man');
const motCat = c => (cfg.motivos[c]&&cfg.motivos[c].c) || 'nc';

function firstAfter(L,t){ let lo=0,hi=L.length; while(lo<hi){ const m=(lo+hi)>>1; if(L[m].t0<t) lo=m+1; else hi=m; } return lo; }
function movedTo(op,rc,a,b){ const L=DS.byOp[op]; if(!L) return null; for(let i=firstAfter(L,a);i<L.length&&L[i].t0<b;i++) if(L[i].rc!==rc) return L[i]; return null; }
let EV=null, EVKEY='';
function buildEvents(){
  const key=JSON.stringify([cfg.motivos,cfg.evt,cfg.paradas,cfg.man,cfg.cal,cfg.mach,cfg.machM,cfg.escala,cfg.ex,cfg.shifts,cfg.he,cfg.corte])+DS.nAll+DS.lastT;
  if(EV&&key===EVKEY) return EV;
  const byM={}; for(const s of DS.stops) if(s.mach&&DS.machines[s.mach]) (byM[s.mach] ||= []).push(s);
  const ev=[], sus=[]; const maxW=Math.max(1,cfg.man.maxDias)*1440;
  for(const rc in byM){ const L=byM[rc].sort((a,b)=>a.t0-b.t0); const PL=DS.byRc[rc]||[]; let cur=null, lastSus=null;
    for(const s of L){ const k=rc+'|'+s.t0; const dec=cfg.evt[k]; const isMan = dec==='m' || (motCat(s.oper)==='man' && dec!=='x');
      const i=firstAfter(PL,s.t0+1); const np=PL[i]; let end=np?np.t0:null, open=!np, capped=false;
      const lim=s.t0+maxW; if(end==null||end>lim){ capped=!!np; end=Math.min(lim,Math.max(DS.lastT,s.t0+s.min)); }
      end=Math.max(end,s.t0+s.min);
      if(isMan){
        if(cur&&s.t0<cur.end){ cur.recs.push(s); cur.ops.add(s.op); if(end>cur.end){ cur.end=end; cur.open=open; cur.capped=capped; } if(dec==='m') cur.src='conf'; }
        else { cur={rc,t0:s.t0,end,open,capped,recs:[s],ops:new Set([s.op]),src:dec==='m'?'conf':'apont',key:k,ret:np||null}; ev.push(cur); }
      } else if(!s.inf && dec!=='x'){
        if(lastSus&&s.t0<lastSus.end) continue;
        if(cur&&s.t0<cur.end) continue;
        const idle=capSeg(rc,s.t0+s.min,end);
        if(idle>=cfg.man.suspH*60){ const mv=movedTo(s.op,rc,s.t0,end); if(mv){ lastSus={rc,t0:s.t0,end,s,idle,mv,key:k,open}; sus.push(lastSus); } }
      }
    }
  }
  for(const [d,rows] of Object.entries(cfg.ex)) for(const e of rows){
    if(e.tipo!=='quebra'||!DS.machines[e.rc]) continue;
    const w=editWindow(e,d); if(!w) continue;
    ev.push({rc:e.rc,t0:w.a,end:w.b,open:false,capped:false,recs:[],ops:new Set(),src:'cal',key:'cal|'+e.id});
  }
  const nm=nowMin();
  for(const p of cfg.paradas){ if(!DS.machines[p.rc]) continue; const t0=dtl2min(p.ini); if(t0==null) continue; const end=p.fim?dtl2min(p.fim):Math.max(nm,t0+1);
    ev.push({rc:p.rc,t0,end,open:!p.fim,capped:false,recs:[],ops:new Set(),src:'manual',p,key:'p|'+p.id}); }
  // une eventos sobrepostos na mesma máquina
  const out=[]; const g={}; for(const e of ev) (g[e.rc] ||= []).push(e);
  for(const rc in g){ const L=g[rc].sort((a,b)=>a.t0-b.t0); let c=null;
    for(const e of L){ if(c&&e.t0<=c.end){ c.end=Math.max(c.end,e.end); c.recs.push(...e.recs); e.ops.forEach(o=>c.ops.add(o)); if(e.src==='manual'){ c.src='manual'; c.p=e.p; c.open=e.open; } else if(e.end>=c.end){ c.open=e.open; c.capped=e.capped; } }
      else { c=Object.assign({},e,{recs:e.recs.slice(),ops:new Set(e.ops)}); out.push(c); } } }
  for(const e of out){ e.apont=e.recs.reduce((s,x)=>s+x.min,0); e.mv=null;
    for(const op of e.ops){ const m=movedTo(op,e.rc,e.t0,e.end); if(m){ e.mv=m; break; } }
    e.realAll=Math.max(capSeg(e.rc,e.t0,e.end),e.apont); }
  out.sort((a,b)=>b.t0-a.t0); sus.sort((a,b)=>b.t0-a.t0);
  EV={ev:out,sus}; EVKEY=key; return EV;
}

/* ================= agregação ================= */
function agg(opt={}){
  const from=opt.from, to=opt.to, grp=opt.grp||'all';
  if(!from||!to) throw new Error('agg: informe o período (from, to)');
  const f=iso2s(from), t=iso2s(to), F=f*1440+DAY0, T=(t+1)*1440+DAY0, cut=cutT(), Tc=Math.min(T,cut);
  const days=[]; for(let p=f;p<=t;p++) days.push(s2iso(p));
  const inR = x => (x.t0+x.min>F && x.t0<T) || (x.min===0 && x.t0>=F && x.t0<T);
  /* fatia [s,e) pelos dias produtivos (06:00→06:00) dentro do período: um apontamento que atravessa
     a virada do dia ou o limite do período conta só a parte que cai em cada dia */
  const slice=(s,e,fn)=>{ for(let p=Math.max(f,Math.floor((s-DAY0)/1440)); p<=t; p++){ const ds=p*1440+DAY0; if(ds>=e) break; const ps=Math.max(s,ds), pe=Math.min(e,ds+1440); if(pe>ps) fn(s2iso(p),ps,pe); } };
  const yms=[...new Set(days.map(d=>d.slice(0,7)))];
  const directStop=new Set(DS.stops.filter(s=>s.mach&&inR(s)).map(s=>s.mach));
  const extraRes=new Set(days.flatMap(d=>dayEdits(d).flatMap(e=>[e.rc,e.dst])));
  const mlist=Object.values(DS.machines).filter(m=>(grp==='all'||grpOf(m.rc)===grp)&&
    (yms.some(ym=>machCfgM(m.rc,ym).on)||(DS.byRc[m.rc]||[]).some(inR)||directStop.has(m.rc)||extraRes.has(m.rc)||
      cfg.he.some(h=>h.alvo==='m:'+m.rc&&heIni(h)<=to&&heFim(h)>=from)));
  const additional=['heHist','fixedProd','operCap','operProd','outside','uncovered','noLoad','used','accountStop','accountMaint','conflict','gap'];
  const extras=()=>Object.fromEntries(additional.map(k=>[k,0]));
  const M={};
  for(const m of mlist){ const a={...extras(),m,mc:machCfgM(m.rc,to.slice(0,7)),grp:grpOf(m.rc),prod:0,union:0,sd:0,si:0,cap:0,capN:0,capHE:0,heAp:0,capP:0,nDays:0,n:0,long:[],manual:0,ops:new Set(),ords:new Set(),peds:new Set(),byDay:{},recs:[],stops:[],manA:0,manR:0,evs:[],down:false,off:0,over:0};
    for(const d of days){ const c=capParts(m.rc,d); const cap=c.n; a.byDay[d]={...extras(),prod:0,union:0,stop:0,cap,capN:c.n,capHE:c.he,manR:0,manA:0,heAp:0,operCap:c.op}; a.cap+=cap; a.capN+=c.n; a.capHE+=c.he; if(c.n>0) a.nDays++; }
    M[m.rc]=a; }
  const iv={}, ivRegular={};
  for(const x of DS.prod){ if(!inR(x)) continue; const a=M[x.rc]; if(!a) continue;
    slice(x.t0,x.t0+x.min,(d,ps,pe)=>{ a.prod+=pe-ps; a.byDay[d].prod+=pe-ps; (iv[x.rc+'|'+d] ||= []).push([ps,pe]); });
    a.n++; if(x.min>600) a.long.push(x); if(x.manual) a.manual++; a.ops.add(x.op); a.ords.add(x.opn); if(x.ped) a.peds.add(x.ped); a.recs.push(x); }
  /* Produção em janelas normais, operacionais e de HE previamente lançada. */
  for(const k in iv){
    const i=k.indexOf('|'), rc=k.slice(0,i), d=k.slice(i+1), p=iso2s(d);
    const mv=mergedIntervals(iv[k]); iv[k]=mv;
    const planned=dayWins(rc,p-1).concat(dayWins(rc,p));
    const operational=operationalWins(rc,p-1).concat(operationalWins(rc,p));
    const b=M[rc].byDay[d];
    b.union=mv.reduce((q,[a,z])=>q+z-a,0); M[rc].union+=b.union;
    const normal=planned.filter(w=>!w.he);
    const manual=planned.filter(w=>w.he);
    const hist=historicalHE(rc,d,mv,manual);
    b.heHist=hist.reduce((q,[a,z])=>q+z-a,0);
    const heWindows=manual.concat(hist.map(([a,b])=>({a,b})));
    b.heAp=intervalMinutes(mv,heWindows);
    const normalProd=mv.flatMap(([a,b])=>outsideIntervals(a,b,mergedIntervals(heWindows.map(w=>[w.a,w.b]))));
    ivRegular[k]=normalProd;
    b.fixedProd=intervalMinutes(normalProd,normal);
    b.operProd=Math.min(b.union,intervalMinutes(mv,operational.concat(hist.map(([a,b])=>({a,b})))));
    b.outside=Math.max(0,b.union-b.fixedProd);
    M[rc].heAp+=b.heAp;
  }
  const stops=[], siByDay={}; let noM=0;
  for(const s0 of DS.stops){ if(!inR(s0)) continue; const a=s0.mach?M[s0.mach]:null;
    if(grp!=='all'&&!a) continue; const decision=s0.mach?cfg.evt[s0.mach+'|'+s0.t0]:null; const cat=decision==='m'?'man':decision==='x'&&motCat(s0.oper)==='man'?'nc':motCat(s0.oper); const s=Object.assign({},s0,{cat,isMan:cat==='man',mp:0});
    slice(s.t0,s.t0+s.min,(d,ps,pe)=>{ s.mp+=pe-ps; if(a){ a.byDay[d].stop+=pe-ps; if(s.isMan) a.byDay[d].manA+=pe-ps; (siByDay[a.m.rc+'|'+d] ||= []).push([ps,pe]); } });
    stops.push(s);
    if(!a){ noM+=s.mp; continue; }
    if(s.inf) a.si+=s.mp; else a.sd+=s.mp; a.stops.push(s); }
  // eventos de parada (tempo real de máquina parada = horas de turno dentro do evento, até o corte)
  const E=buildEvents(); const evs=[];
  for(const e of E.ev){ const a=M[e.rc]; if(!a) continue; if(e.end<=F||e.t0>=T) continue;
    const real=capSeg(e.rc,Math.max(e.t0,F),Math.min(e.end,Tc),(iso,v)=>{ if(a.byDay[iso]) a.byDay[iso].manR+=v; });
    const ap=e.recs.reduce((q,x)=>q+Math.max(0,Math.min(T,x.t0+x.min)-Math.max(F,x.t0)),0);
    const r=Math.max(real,ap); const o={e,real:r,ap,ocult:Math.max(0,r-ap)}; evs.push(o); a.evs.push(o); a.manR+=r; a.manA+=ap;
    if(e.open&&e.src==='manual') a.down=true; }
  const T0={...extras(),prod:0,union:0,cap:0,capN:0,capHE:0,capP:0,heAp:0,stop:0,gap:0,manR:0,manA:0,ocult:0,off:0,over:0,ords:new Set(),peds:new Set(),active:0,n:0,noM};
  const list=mlist.map(m=>M[m.rc]);
  for(const a of list){
    a.capP=a.cap+a.capHE;
    for(const d of days){
      const b=a.byDay[d], rc=a.m.rc, p=iso2s(d), k=rc+'|'+d;
      b.capP=b.cap+b.capHE;
      const prod=iv[k]||[], rawStops=mergedIntervals(siByDay[k]||[]);
      const prior=s2iso(p-1), impacts=[shiftImpact(rc,prior),shiftImpact(rc,d)];
      const maintenance=mergedIntervals(a.evs.map(o=>[o.e.t0,o.e.end]));
      const blocked=mergedIntervals(impacts.flatMap(x=>x.blocks.map(w=>[w.a,w.b])));
      const noLoad=mergedIntervals(impacts.flatMap(x=>x.noLoad.map(w=>[w.a,w.b])));
      for(const w of dayWins(rc,p-1).concat(dayWins(rc,p))){
        if(w.he) continue;
        const start=Math.max(w.a,p*1440+DAY0), end=Math.min(w.b,cut,(p+1)*1440+DAY0); if(end<=start) continue;
        const net=w.c/(w.b-w.a);
        let free=[[start,end]];
        const take=L=>{
          const next=free.flatMap(([s,e])=>outsideIntervals(s,e,L));
          const dt=L=>L.reduce((q,[s,e])=>q+e-s,0);
          const n=(dt(free)-dt(next))*net; free=next; return n;
        };
        b.accountMaint+=take(maintenance);
        b.uncovered+=take(blocked);
        b.used+=take(ivRegular[k]||[]);
        b.accountStop+=take(rawStops);
        b.noLoad+=take(noLoad);
        b.gap+=free.reduce((q,[s,e])=>q+e-s,0)*net;
        b.conflict+=intervalMinutes(prod,mergedIntervals([...maintenance,...blocked,...rawStops]).map(([s,e])=>({a:Math.max(s,start),b:Math.min(e,end)})));
      }
      for(const k of additional) a[k]+=b[k];
      if(b.capP<=0&&b.union>0) a.off+=b.union; else if(b.fixedProd>b.cap+1) a.over+=b.fixedProd-b.cap;
    }
    a.stop=a.sd+a.si; a.ocult=Math.max(0,a.manR-a.manA); a.util=a.cap>0?a.fixedProd/a.cap:null;
    a.disp=a.cap>0&&(hasMaintenanceMap()||a.evs.length||a.accountMaint>0)?Math.max(0,1-a.accountMaint/a.cap):null; a.impOut=Math.max(0,a.stop-a.manA);
    for(const k of ['prod','union','cap','capP','capN','capHE','heAp','stop','manR','manA','ocult','off','over','n',...additional]) T0[k]+=a[k];
    a.ords.forEach(o=>T0.ords.add(o)); a.peds.forEach(o=>T0.peds.add(o)); if(a.n>0) T0.active++;
  }
  applyAdj(list,days,T0);
  T0.util=T0.cap>0?T0.fixedProd/T0.cap:null;
  T0.disp=T0.cap>0&&(hasMaintenanceMap()||evs.length||T0.accountMaint>0)?Math.max(0,1-T0.accountMaint/T0.cap):null;
  const dayT=days.map(d=>{
    const o={d,prod:0,union:0,stop:0,cap:0,capP:0,capHE:0,heAp:0,manR:0,manA:0,...extras()};
    for(const a of list) for(const k of Object.keys(o)) if(k!=='d') o[k]+=a.byDay[d][k]||0;
    o.ocult=Math.max(0,o.manR-o.manA); return o;
  });
  const workDays=dayT.filter(o=>o.capP>0).length, workDaysN=days.filter(d=>list.some(a=>a.byDay[d].capN>0)).length;
  const groups={}; for(const a of list){ const g=groups[a.grp] ||= {...extras(),g:a.grp,list:[],union:0,prod:0,cap:0,capN:0,capHE:0,capP:0,heAp:0,stop:0,manR:0,manA:0,ocult:0,gap:0,ords:new Set()};
    g.list.push(a); for(const k of ['union','prod','cap','capN','capHE','capP','heAp','stop','manR','manA','ocult',...additional]) g[k]+=a[k]; a.ords.forEach(o=>g.ords.add(o)); }
  for(const g of Object.values(groups)) g.util=g.cap>0?g.fixedProd/g.cap:null;
  const G=GRP_ORDER.concat(Object.keys(groups).filter(k=>!GRP_ORDER.includes(k))).filter(k=>groups[k]).map(k=>groups[k]);
  return {M,list,days,stops,T:T0,dayT,workDays,workDaysN,G,evs,F,T_:T,from,to,cut,cutIn:cut<T};
}
function status(u){ if(u==null) return {k:'none',t:'Sem capacidade'}; if(u*100>=cfg.meta) return {k:'good',t:'No alvo'}; if(u*100>=cfg.alerta) return {k:'warn',t:'Atenção'}; return {k:'crit',t:'Crítico'}; }

function applyAdj(list,days,T0){
  const ADJ=cfg.adj||{}; if(!Object.keys(ADJ).length) return;
  const dset=new Set(days);
  for(const a of list){ const M=ADJ[a.m.rc]; if(!M) continue; let hit=false;
    for(const d in M){ if(!dset.has(d)) continue; const o=M[d], b=a.byDay[d]; if(!b||!o) continue; hit=true;
      const add=(k,dv)=>{ if(!dv) return; b[k]=(b[k]||0)+dv; a[k]=(a[k]||0)+dv; T0[k]=(T0[k]||0)+dv; };
      const dl=(k,v)=>v==null?0:v-(b[k]||0);
      const dCap=dl('cap',o.cap), dFx=dl('fixedProd',o.fx), dHe=dl('heAp',o.he), dSt=dl('stop',o.stop), dMan=dl('manR',o.man);
      add('cap',dCap); add('capN',dCap); add('capP',dCap);
      add('fixedProd',dFx); add('used',dFx); add('union',dFx+dHe); add('prod',dFx+dHe); add('heAp',dHe);
      add('stop',dSt); add('accountStop',dSt); add('manR',dMan); add('accountMaint',dMan);
      const ng=Math.max(0,(b.gap||0)+dCap-dFx-dSt-dMan); add('gap',ng-(b.gap||0));
      b.adj=true; }
    if(hit){ a.adj=true; a.ocult=Math.max(0,a.manR-a.manA); a.util=a.cap>0?a.fixedProd/a.cap:null;
      if(a.disp!=null||a.accountMaint>0) a.disp=a.cap>0?Math.max(0,1-a.accountMaint/a.cap):null; } }
  T0.ocult=list.reduce((q,a)=>q+a.ocult,0);
}
DS = build(raw);
if (!Object.keys(DS.machines).length) throw new Error('Sem registros de usinagem na base.');
cfg = mergeCfg(cfgInput);
return {
  get dataset() { return DS; },
  get config() { return cfg; },
  setConfig(next) { cfg = mergeCfg(next); clearCap(); EV = null; },
  agg, status, buildEvents, clearCap,
  machCfg, machCfgM, rosterEntry, rosterModes, grpOf, turnosTxt, dayCfg,
  capParts, capMin, capSeg, heDay, dayWins,
  motName, motCat,
  constants: { DAY0, GRP_ORDER, CATS, HOL, FACULT, ROSTER_MODES, EX_TYPES, MES, WD },
  util: { s2iso, iso2s, hhmm, fmtDT, title, shortNm },
  get cutT() { return cutT(); },
};
}
