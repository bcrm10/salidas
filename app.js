/* Salidas Mario & Danna — app */
(function () {
  const L = window.Logica;
  const C = window.CONFIG;
  const FER = window.FERIADOS || {};
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const DIAS_L = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const S = {
    vista: 'inicio', mes: null, panTab: 'ideas', filtros: new Set(),
    tarjetas: [], lugares: [], salidas: [], activados: new Set(), transferencias: [], guardados: [],
    ideas: [], ideasFecha: null, periodos: [], f: null
  };

  // ---------- utilidades ----------
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clp = (n) => (n < 0 ? '−$' : '$') + new Intl.NumberFormat('es-CL').format(Math.abs(Math.round(n || 0)));
  const numero = (t) => parseInt(String(t).replace(/\D/g, ''), 10) || 0;
  const dNum = (k) => Number(k.slice(8, 10));
  const mNum = (k) => Number(k.slice(5, 7)) - 1;
  const diaCorto = (k) => `${DIAS[L.dow(k)]} ${dNum(k)}`;
  const diaMes = (k) => `${DIAS[L.dow(k)]} ${dNum(k)} ${MESES[mNum(k)]}`;
  const rango = (p) => (p.desde === p.hasta ? `${dNum(p.desde)} ${MESES[mNum(p.desde)]}` : `${dNum(p.desde)} – ${dNum(p.hasta)} ${MESES[mNum(p.hasta)]}`);
  const nombreMes = (m) => `${MESES_L[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  const tarjetaDe = (id) => S.tarjetas.find((t) => t.id === id) || { banco: '¿?', titular: '' };
  const hoy = () => L.hoySantiago();
  const mesInicial = () => { const m = L.mesDe(hoy()), mi = L.mesDe(C.INICIO); return m < mi ? mi : m; };

  function aviso(msg) {
    const el = $('#aviso'); el.textContent = msg; el.hidden = false;
    clearTimeout(aviso.t); aviso.t = setTimeout(() => (el.hidden = true), 3200);
  }
  async function q(promesa, ok) {
    const { error, data } = await promesa;
    if (error) { aviso('No se pudo guardar: ' + error.message); throw error; }
    if (ok) aviso(ok);
    return data;
  }
  const formNuevo = (extra = {}) => ({ fecha: hoy(), monto: '', lugar: '', tarjeta: null, tipo: null, nota: '', activar: true, ...extra });

  // ---------- datos ----------
  async function cargar() {
    const desde = C.INICIO;
    const [t, l, s, a, tr, g] = await Promise.all([
      sb.from('tarjetas').select('*').order('orden'),
      sb.from('lugares').select('*').order('nombre'),
      sb.from('salidas').select('*').gte('fecha', desde).order('fecha', { ascending: false }),
      sb.from('dias_activados').select('fecha'),
      sb.from('transferencias').select('*').order('created_at', { ascending: false }),
      sb.from('panoramas_guardados').select('*').order('created_at', { ascending: false })
    ]);
    const err = [t, l, s, a, tr, g].find((r) => r.error);
    if (err) { aviso('Error al cargar datos: ' + err.error.message); return; }
    S.tarjetas = t.data; S.lugares = l.data; S.salidas = s.data; S.activados = new Set(a.data.map((x) => x.fecha));
    S.transferencias = tr.data; S.guardados = g.data;
    render();
  }
  async function cargarIdeas() {
    try {
      const r = await fetch('data/panoramas.json', { cache: 'no-store' });
      const j = await r.json();
      S.ideas = j.ideas || []; S.ideasFecha = j.generado || null;
    } catch { S.ideas = []; }
  }
  let tRecarga;
  const recargar = () => { clearTimeout(tRecarga); tRecarga = setTimeout(cargar, 400); };

  function calcular() {
    const ultimoDiaMes = S.mes ? L.add(L.add(S.mes + '-01', 40).slice(0, 7) + '-01', -1) : null;
    S.periodos = L.calcular({
      inicio: C.INICIO, hoy: hoy(), hasta: ultimoDiaMes, salidas: S.salidas,
      activados: S.activados, feriados: FER, transferencias: S.transferencias
    });
    const porDia = {};
    for (const p of S.periodos) for (const d of p.dias) porDia[d.fecha] = { ...d, periodo: p };
    S.porDia = porDia;
    $('#ahorro-total').textContent = clp(S.transferencias.reduce((a, t) => a + t.monto, 0));
  }

  // ---------- acciones ----------
  async function transferir(periodo, monto) {
    if (monto <= 0) return;
    await q(sb.from('transferencias').insert({ periodo, monto, fecha: hoy() }), `Transferencia de ${clp(monto)} registrada`);
    await cargar();
  }
  async function borrar(tabla, id, msg) {
    if (!confirm(msg)) return;
    await q(sb.from(tabla).delete().eq('id', id), 'Eliminado');
    await cargar();
  }

  // ---------- vistas ----------
  function render() {
    calcular();
    document.querySelectorAll('.nav-item').forEach((b) => b.setAttribute('aria-current', b.dataset.vista === S.vista ? 'page' : 'false'));
    const v = { inicio: vInicio, registrar: vRegistrar, mes: vMes, panoramas: vPanoramas }[S.vista];
    $('#vista').innerHTML = v();
    if (S.vista === 'registrar') actualizarPrevia();
  }

  function vInicio() {
    const h = hoy();
    if (h < C.INICIO) {
      return `<div class="cabecera"><h1>Hola, Mario y Danna</h1></div>
        <div class="tarjeta"><h3>Todavía no parte</h3><p style="margin:0;line-height:1.4">El presupuesto empieza a contar el ${diaMes(C.INICIO)}. Desde ese día podrán registrar salidas y ver cuánto les queda.</p>
        <button class="btn lila" data-ir="mes">Ver el presupuesto de ${MESES_L[mNum(C.INICIO)].toLowerCase()}</button></div>`;
    }
    const cur = S.porDia[h].periodo;
    const lunes = L.lunesDe(h);
    const semana = [0, 1, 2, 3, 4, 5, 6].map((i) => L.add(lunes, i));
    const periodosSemana = [...new Set(semana.map((d) => S.porDia[d] && S.porDia[d].periodo).filter(Boolean))];
    const pct = cur.disponible > 0 ? Math.min(100, Math.round(((cur.gastado + cur.transferido) / cur.disponible) * 100)) : 100;

    const hero = cur.libre >= 0
      ? `<div class="hero"><span style="font-weight:700;font-size:14px">Disponible hasta el ${diaMes(cur.hasta)}</span>
          <span class="monto">${clp(cur.libre)}</span>
          <span style="font-size:14px">de ${clp(cur.disponible)} · gastado ${clp(cur.gastado)}${cur.descuento ? ` · descuento anterior ${clp(cur.descuento)}` : ''}${cur.transferido ? ` · ya ahorrado ${clp(cur.transferido)}` : ''}</span>
          <div class="barra"><span style="width:${pct}%"></span></div></div>`
      : `<div class="hero negativo"><span style="font-weight:700;font-size:14px">Se pasaron</span>
          <span class="monto">${clp(cur.exceso)}</span>
          <span style="font-size:14px">Se descuenta del próximo período. No quedan salidas hasta entonces.</span></div>`;

    const dias = semana.map((d) => {
      const info = S.porDia[d];
      const w = L.dow(d);
      const bloqueado = info && info.tipo === 'opcional';
      const cls = ['dia', bloqueado ? 'bloqueado' : '', info && info.gasto ? 'salieron' : '', d === h ? 'hoy' : '', info && info.periodo !== cur ? 'otro-mes' : ''].join(' ');
      const etiqueta = d === h ? 'hoy' : DIAS_L[(w + 6) % 7];
      const nota = info && info.gasto ? (Math.round(info.gasto / 100) / 10).toLocaleString('es-CL') + 'k'
        : FER[d] ? 'feriado' : info && info.tipo === 'activado' ? 'activado' : '';
      const titulo = `${diaMes(d)}${FER[d] ? ' · feriado ' + FER[d] : ''}${bloqueado ? ' · no suma' : ''}${info && info.tipo === 'activado' ? ' · activado' : ''}${info && info.gasto ? ' · ' + clp(info.gasto) : ''}`;
      return `<div class="${cls}" role="img" aria-label="${esc(titulo)}" title="${esc(titulo)}">
        <span>${etiqueta}</span><span class="circulo">${dNum(d)}</span><span class="gasto">${nota}</span></div>`;
    }).join('');

    let tramos = '';
    if (periodosSemana.length > 1) {
      tramos = `<div class="tarjeta"><h3 class="suave">Esta semana cruza de mes</h3>${periodosSemana.map((p) => `<div class="fila"><span>${rango(p)} → ${MESES_L[mNum(p.desde)].toLowerCase()}</span><strong>${clp(p.libre)} libres</strong></div>`).join('')}</div>`;
    } else {
      const sigLunes = L.add(lunes, 7), sigDomingo = L.add(lunes, 13);
      if (L.mesDe(sigLunes) !== L.mesDe(sigDomingo)) {
        const sig = S.periodos.filter((p) => p.lunes === sigLunes);
        if (sig.length) tramos = `<div class="tarjeta"><h3 class="suave">La próxima semana cruza de mes</h3>${sig.map((p) => `<div class="fila"><span>${rango(p)} → ${MESES_L[mNum(p.desde)].toLowerCase()}</span><strong>${clp(p.presupuesto)}</strong></div>`).join('')}</div>`;
      }
    }

    const pendientes = S.periodos.filter((p) => p.pendiente > 0);
    const ahorro = `<div class="tarjeta celeste"><h3>Para la cuenta de ahorro</h3>
      ${cur.libre > 0 ? `<p style="margin:0;line-height:1.4">Lo que quede el ${diaMes(cur.hasta)} pasa a la cuenta bipersonal. Si no salen más, serían <strong>${clp(cur.libre)}</strong>.</p>
        <button class="btn-texto" style="align-self:flex-start;padding-left:0;text-align:left" data-transferir="${esc(cur.key)}" data-monto="${cur.libre}" data-anticipado="1">¿Ya no saldrán más? Transferir ${clp(cur.libre)} ahora</button>` : cur.transferido ? `<p style="margin:0">Ya transfirieron ${clp(cur.transferido)} de este período.</p>` : `<p style="margin:0">Este período no deja ahorro por ahora.</p>`}
      ${pendientes.map((p) => `<div class="fila"><span>${rango(p)}: ${clp(p.pendiente)} pendiente</span><button class="btn azul chico" data-transferir="${esc(p.key)}" data-monto="${p.pendiente}">Marcar transferido</button></div>`).join('')}
    </div>`;

    const idea = S.ideas.find((i) => (i.costo_aprox || 0) <= Math.max(cur.libre, 0));
    const ideaHtml = idea ? `<div class="tarjeta"><h3 class="suave">Idea para hoy</h3><strong style="font-size:17px">${esc(idea.titulo)}</strong>
      <span class="suave" style="line-height:1.4">${esc(idea.descripcion)} ~${clp(idea.costo_aprox)}</span>
      <button class="btn lila" data-ir="panoramas">Ver más panoramas</button></div>` : '';

    return `<div class="cabecera"><div><div class="chico suave" style="font-weight:700">Semana ${dNum(lunes)} ${MESES[mNum(lunes)]} – ${dNum(semana[6])} ${MESES[mNum(semana[6])]}</div><h1>Hola, Mario y Danna</h1></div>
      <button class="btn" data-ir="registrar">+ Registrar</button></div>
      <div class="pila grilla-escritorio">
        ${hero}
        <div class="tarjeta ancho"><h3 class="suave">Días de la semana</h3><div class="dias">${dias}</div>
          <div class="leyenda"><span>Azul: salieron</span><span>Morado claro: suma $10.000</span><span>Gris: lunes y martes no suman, salvo feriado</span></div></div>
        ${ahorro}${tramos}${ideaHtml}
      </div>`;
  }

  function vRegistrar() {
    if (hoy() < C.INICIO) return `<div class="cabecera"><h1>Nueva salida</h1></div>
      <div class="tarjeta"><p style="margin:0">Podrán registrar salidas desde el ${diaMes(C.INICIO)}.</p></div>`;
    const f = S.f || (S.f = formNuevo());
    const w = L.dow(f.fecha);
    const lunesMartes = (w === 1 || w === 2) && !FER[f.fecha];
    const lugares = S.lugares.map((l) => `<button type="button" class="chip" data-lugar="${esc(l.nombre)}" aria-pressed="${f.lugar === l.nombre}">${esc(l.nombre)}</button>`).join('');
    const tarjetas = S.tarjetas.map((t) => `<label class="opcion-tarjeta"><span class="inicial ${t.titular === 'Mario' ? 'm' : ''}">${esc(t.titular[0])}</span>
      <span style="flex-grow:1;display:flex;flex-direction:column"><strong>${esc(t.banco)}</strong><span class="chico suave">${esc(t.titular)}</span></span>
      <input type="radio" name="tarjeta" value="${t.id}" ${f.tarjeta === t.id ? 'checked' : ''}></label>`).join('');
    return `<div class="cabecera"><h1>Nueva salida</h1></div>
    <form id="form-salida" class="pila" novalidate>
      <div class="tarjeta" style="align-items:center;border-radius:var(--r-xl)">
        <label for="monto" class="chico suave" style="font-weight:800">¿Cuánto gastaron?</label>
        <input id="monto" name="monto" class="monto-grande" inputmode="numeric" autocomplete="off" placeholder="$0" value="${f.monto ? clp(numero(f.monto)) : ''}">
        <span id="previa" class="pastilla p-azul" style="font-size:13px"></span>
      </div>
      <label class="campo">Fecha<input class="entrada" type="date" name="fecha" value="${f.fecha}" min="${C.INICIO}" max="${hoy()}"></label>
      <div class="pila" style="gap:8px"><span class="chico suave" style="font-weight:800">Lugar</span>
        <div class="chips">${lugares}</div>
        <input class="entrada" name="lugar" placeholder="Otro lugar" value="${S.lugares.some((l) => l.nombre === f.lugar) ? '' : esc(f.lugar)}" aria-label="Otro lugar"></div>
      <div class="pila" style="gap:8px"><span class="chico suave" style="font-weight:800">¿Con qué tarjeta pagaron?</span>
        <div class="lista" style="padding:0 14px">${tarjetas}</div></div>
      <div class="pila" style="gap:8px"><span class="chico suave" style="font-weight:800">Tipo de pago</span>
        <div class="segmento"><button type="button" data-tipo="debito" aria-pressed="${f.tipo === 'debito'}">Débito</button><button type="button" data-tipo="credito" aria-pressed="${f.tipo === 'credito'}">Crédito</button></div></div>
      ${lunesMartes ? `<label class="check"><input type="checkbox" name="activar" ${f.activar ? 'checked' : ''}>Es ${DIAS[w] === 'lun' ? 'lunes' : 'martes'}: marcar que pudimos salir los dos. Suma $10.000 a la semana.</label>` : ''}
      <label class="campo">Nota (opcional)<input class="entrada" name="nota" value="${esc(f.nota)}" maxlength="140"></label>
      <p id="error-form" role="alert" class="chico" style="margin:0;color:var(--morado);font-weight:800"></p>
      <button class="btn" type="submit" style="min-height:54px">Guardar salida</button>
    </form>`;
  }

  function actualizarPrevia() {
    const f = S.f, el = $('#previa');
    if (!el) return;
    if (f.fecha < C.INICIO) { el.textContent = 'Antes del inicio del presupuesto'; return; }
    const info = S.porDia[f.fecha];
    if (!info) { el.textContent = ''; return; }
    let libre = info.periodo.libre;
    if (info.tipo === 'opcional' && f.activar) libre += L.CUOTA_DIA;
    const quedan = libre - numero(f.monto);
    el.textContent = quedan >= 0 ? `Quedarán ${clp(quedan)} en este período` : `Se pasan por ${clp(-quedan)}: se descuenta del siguiente`;
    el.className = 'pastilla ' + (quedan >= 0 ? 'p-azul' : 'p-morado');
  }

  function vMes() {
    const m = S.mes || (S.mes = mesInicial());
    const ps = S.periodos.filter((p) => p.mes === m);
    const sal = S.salidas.filter((s) => L.mesDe(s.fecha) === m);
    const trMes = S.transferencias.filter((t) => t.periodo.endsWith('|' + m));
    const presupuesto = ps.reduce((a, p) => a + p.presupuesto, 0);
    const gastado = sal.reduce((a, s) => a + s.monto, 0);
    const ahorrado = trMes.reduce((a, t) => a + t.monto, 0);

    const periodos = ps.map((p) => {
      let estado;
      if (p.estado === 'por venir') estado = `<span class="pastilla p-lila">Por venir</span>`;
      else if (p.estado === 'en curso') estado = `<span class="pastilla p-lila">En curso</span>`;
      else if (p.exceso) estado = `<span class="pastilla p-morado">Exceso ${clp(p.exceso)}</span>`;
      else if (p.pendiente) estado = `<button class="btn azul chico" data-transferir="${esc(p.key)}" data-monto="${p.pendiente}">Transferir ${clp(p.pendiente)}</button>`;
      else if (p.transferido) estado = `<span class="pastilla p-azul">Ahorro ${clp(p.transferido)} ✓</span>`;
      else estado = `<span class="pastilla p-lila">Justo</span>`;
      const feriados = p.dias.filter((d) => d.feriado && (L.dow(d.fecha) === 1 || L.dow(d.fecha) === 2));
      return `<div class="periodo ${p.estado.replace(' ', '-')}"><div class="fila"><strong>${rango(p)}</strong>${estado}</div>
        <div class="chico suave">${clp(p.presupuesto)}${p.descuento ? ` − ${clp(p.descuento)} de exceso = ${clp(p.disponible)}` : ''} · gastado ${clp(p.gastado)}${p.transferido && p.estado !== 'cerrado' ? ` · ahorrado ${clp(p.transferido)}` : ''}${feriados.length ? ` · feriado ${feriados.map((d) => dNum(d.fecha)).join(' y ')}` : ''}</div></div>`;
    }).join('') || `<div class="vacio">No hay períodos en este mes.</div>`;

    const lista = sal.map((s) => {
      const t = tarjetaDe(s.tarjeta_id);
      return `<div class="fila"><span style="display:flex;flex-direction:column;gap:2px"><strong>${diaCorto(s.fecha)} · ${esc(s.lugar)}</strong>
        <span class="chico suave">${esc(t.banco)} · ${esc(t.titular)} · <strong style="color:${s.tipo_pago === 'credito' ? 'var(--morado)' : 'var(--azul)'}">${s.tipo_pago === 'credito' ? 'Crédito' : 'Débito'}</strong>${s.nota ? ' · ' + esc(s.nota) : ''}</span></span>
        <span style="display:flex;align-items:center;gap:4px"><strong>${clp(s.monto)}</strong><button class="btn-texto" data-borrar-salida="${s.id}" aria-label="Eliminar salida del ${diaCorto(s.fecha)}">✕</button></span></div>`;
    }).join('') || `<div class="vacio">Sin salidas registradas este mes.</div>`;

    const credito = sal.filter((s) => s.tipo_pago === 'credito').reduce((a, s) => a + s.monto, 0);
    const porTarjeta = S.tarjetas.map((t) => `<div class="fila"><span>${esc(t.titular)} · ${esc(t.banco)}</span><span class="suave">${clp(sal.filter((s) => s.tarjeta_id === t.id).reduce((a, s) => a + s.monto, 0))}</span></div>`).join('');
    const transf = trMes.map((t) => `<div class="fila"><span>${diaCorto(t.fecha)} · período ${rango(S.periodos.find((p) => p.key === t.periodo) || { desde: t.periodo.slice(0, 10), hasta: t.periodo.slice(0, 10) })}</span>
      <span style="display:flex;align-items:center;gap:4px"><strong style="color:var(--azul)">${clp(t.monto)}</strong><button class="btn-texto" data-borrar-transf="${t.id}" aria-label="Eliminar transferencia">✕</button></span></div>`).join('');

    const mesAnt = L.add(m + '-01', -1).slice(0, 7), mesSig = L.add(m + '-01', 32).slice(0, 7);
    return `<div class="cabecera"><h1>${nombreMes(m)}</h1>
      <div><button class="btn-texto" data-mes="${mesAnt}" aria-label="Mes anterior">‹</button><button class="btn-texto" data-mes="${mesSig}" aria-label="Mes siguiente">›</button></div></div>
      <div class="pila grilla-escritorio dos">
        <div class="stats completo"><div class="stat"><span class="chico suave" style="font-weight:700">Presupuesto</span><strong>${clp(presupuesto)}</strong></div>
          <div class="stat lila"><span class="chico" style="font-weight:700">Gastado</span><strong>${clp(gastado)}</strong></div>
          <div class="stat celeste"><span class="chico" style="font-weight:700">Ahorrado</span><strong>${clp(ahorrado)}</strong></div></div>
        <div class="pila"><h3 class="suave">Semanas del mes</h3>${periodos}</div>
        <div class="pila"><h3 class="suave">Salidas registradas</h3><div class="lista">${lista}</div></div>
        <div class="pila"><h3 class="suave">Por tarjeta este mes</h3>
          <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat lila"><span class="chico" style="font-weight:800">Crédito · por pagar</span><strong>${clp(credito)}</strong></div>
          <div class="stat celeste"><span class="chico" style="font-weight:800">Débito · ya pagado</span><strong>${clp(gastado - credito)}</strong></div></div>
          <div class="lista">${porTarjeta}</div></div>
        ${transf ? `<div class="pila"><h3 class="suave">Transferencias al ahorro</h3><div class="lista">${transf}</div></div>` : ''}
      </div>`;
  }

  const FILTROS = [['tardecita', 'Tardecita'], ['fin de semana', 'Fin de semana'], ['gratis', 'Gratis'], ['hasta10', 'Hasta $10.000']];
  function vPanoramas() {
    const tabs = `<div class="segmento"><button data-tab="ideas" aria-pressed="${S.panTab === 'ideas'}">Ideas</button><button data-tab="lugares" aria-pressed="${S.panTab === 'lugares'}">Nuestros lugares</button></div>`;
    if (S.panTab === 'lugares') {
      const m = L.mesDe(hoy());
      const veces = (n) => S.salidas.filter((s) => s.lugar === n && L.mesDe(s.fecha) === m).length;
      return `<div class="cabecera"><h1>Panoramas</h1></div><div class="pila">${tabs}
        <div class="lista">${S.lugares.map((l) => `<div class="fila"><span>${esc(l.nombre)}</span><span style="display:flex;align-items:center;gap:6px"><span class="chico suave">${veces(l.nombre)} ${veces(l.nombre) === 1 ? 'vez' : 'veces'} este mes</span><button class="btn-texto" data-borrar-lugar="${l.id}" aria-label="Eliminar ${esc(l.nombre)}">✕</button></span></div>`).join('') || '<div class="vacio">Agreguen su primer lugar.</div>'}</div>
        <form id="form-lugar" class="fila"><input class="entrada" name="nombre" placeholder="Nuevo lugar" required aria-label="Nuevo lugar" style="flex:1"><button class="btn" type="submit">Agregar</button></form>
        ${S.guardados.length ? `<h3 class="suave">Ideas guardadas</h3><div class="lista">${S.guardados.map((g) => `<div class="fila"><span style="display:flex;flex-direction:column"><strong>${esc(g.titulo)}</strong><span class="chico suave">${esc(g.descripcion || '')}</span></span><span style="display:flex;align-items:center;gap:4px"><button class="btn lila chico" data-vamos="${esc(g.titulo)}">Vamos</button><button class="btn-texto" data-borrar-guardado="${g.id}" aria-label="Quitar idea">✕</button></span></div>`).join('')}</div>` : ''}
      </div>`;
    }
    const f = S.filtros;
    const ideas = S.ideas.filter((i) =>
      (!f.has('tardecita') || i.momento === 'tardecita' || i.momento === 'cualquiera') &&
      (!f.has('fin de semana') || i.momento === 'fin de semana' || i.momento === 'cualquiera') &&
      (!f.has('gratis') || !i.costo_aprox) && (!f.has('hasta10') || (i.costo_aprox || 0) <= 10000));
    const guardado = (t) => S.guardados.some((g) => g.titulo === t);
    return `<div class="cabecera"><h1>Panoramas</h1></div><div class="pila">${tabs}
      <div class="chips">${FILTROS.map(([k, n]) => `<button class="chip azul" data-filtro="${k}" aria-pressed="${f.has(k)}">${n}</button>`).join('')}</div>
      ${S.ideasFecha ? `<p class="chico suave" style="margin:0">Ideas renovadas el ${diaMes(S.ideasFecha)}. Se generan cada lunes.</p>` : ''}
      <div class="pila grilla-escritorio dos">${ideas.map((i) => `<div class="tarjeta">
        <div class="fila"><strong style="font-size:16px">${esc(i.titulo)}</strong><span class="pastilla p-azul">${i.costo_aprox ? '~' + clp(i.costo_aprox) : 'Gratis'}</span></div>
        <span class="suave" style="line-height:1.4">${esc(i.descripcion)}</span>
        <div class="fila" style="justify-content:flex-start;gap:8px"><button class="btn lila chico" data-guardar="${esc(i.titulo)}" ${guardado(i.titulo) ? 'disabled' : ''}>${guardado(i.titulo) ? 'Guardada' : 'Guardar'}</button><button class="btn chico" data-vamos="${esc(i.titulo)}">Vamos hoy</button></div></div>`).join('') || '<div class="vacio">No hay ideas con esos filtros.</div>'}</div>
    </div>`;
  }

  // ---------- eventos ----------
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button, [data-ir]');
    if (!b) return;
    const d = b.dataset;
    if (d.vista || d.ir) { S.vista = d.vista || d.ir; if (S.vista === 'mes') S.mes = mesInicial(); render(); window.scrollTo(0, 0); return; }
    if (d.transferir) {
      const monto = Number(d.monto);
      const msg = d.anticipado ? `¿Transferir ${clp(monto)} ahora? Después de esto no quedará saldo para salir en este período.` : `¿Confirmas que transfirieron ${clp(monto)} a la cuenta de ahorro?`;
      if (!confirm(msg)) return;
      return transferir(d.transferir, monto);
    }
    if (d.mes) { S.mes = d.mes; return render(); }
    if (d.lugar !== undefined && S.f) { S.f.lugar = d.lugar; return render(); }
    if (d.tipo && S.f) { S.f.tipo = d.tipo; return render(); }
    if (d.tab) { S.panTab = d.tab; return render(); }
    if (d.filtro) { S.filtros.has(d.filtro) ? S.filtros.delete(d.filtro) : S.filtros.add(d.filtro); return render(); }
    if (d.vamos) { S.f = formNuevo({ lugar: d.vamos }); S.vista = 'registrar'; render(); window.scrollTo(0, 0); return; }
    if (d.guardar) {
      const i = S.ideas.find((x) => x.titulo === d.guardar);
      await q(sb.from('panoramas_guardados').insert({ titulo: i.titulo, descripcion: i.descripcion, costo_aprox: i.costo_aprox || null }), 'Idea guardada');
      return cargar();
    }
    if (d.borrarSalida) return borrar('salidas', d.borrarSalida, '¿Eliminar esta salida?');
    if (d.borrarTransf) return borrar('transferencias', d.borrarTransf, '¿Eliminar esta transferencia?');
    if (d.borrarLugar) return borrar('lugares', d.borrarLugar, '¿Eliminar este lugar?');
    if (d.borrarGuardado) return borrar('panoramas_guardados', d.borrarGuardado, '¿Quitar esta idea?');
  });

  document.addEventListener('input', (e) => {
    const form = e.target.closest('#form-salida');
    if (!form || !S.f) return;
    const { name, value, checked } = e.target;
    if (name === 'monto') { S.f.monto = value; const n = numero(value); e.target.value = n ? clp(n) : ''; }
    else if (name === 'lugar') { S.f.lugar = value; form.querySelectorAll('[data-lugar]').forEach((c) => c.setAttribute('aria-pressed', 'false')); }
    else if (name === 'nota') S.f.nota = value;
    else if (name === 'tarjeta') S.f.tarjeta = Number(value);
    else if (name === 'activar') S.f.activar = checked;
    else if (name === 'fecha') { S.f.fecha = value || hoy(); return render(); }
    actualizarPrevia();
  });

  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.id === 'form-lugar') {
      const nombre = new FormData(e.target).get('nombre').trim();
      if (nombre) { await q(sb.from('lugares').insert({ nombre }), 'Lugar agregado'); await cargar(); }
      return;
    }
    if (e.target.id !== 'form-salida') return;
    const f = S.f, err = $('#error-form');
    const monto = numero(f.monto), lugar = f.lugar.trim();
    const falta = !monto ? 'Ingresa el monto.' : !lugar ? 'Elige o escribe el lugar.' : !f.tarjeta ? 'Elige la tarjeta.' : !f.tipo ? 'Marca si fue débito o crédito.' : f.fecha < C.INICIO ? 'La fecha es anterior al inicio del presupuesto.' : '';
    if (falta) { err.textContent = falta; return; }
    err.textContent = '';
    const w = L.dow(f.fecha);
    if ((w === 1 || w === 2) && !FER[f.fecha] && f.activar && !S.activados.has(f.fecha)) await q(sb.from('dias_activados').insert({ fecha: f.fecha }));
    await q(sb.from('salidas').insert({ fecha: f.fecha, monto, lugar, tarjeta_id: f.tarjeta, tipo_pago: f.tipo, nota: f.nota.trim() || null }), 'Salida guardada');
    if (!S.lugares.some((l) => l.nombre.toLowerCase() === lugar.toLowerCase())) await sb.from('lugares').insert({ nombre: lugar });
    S.f = formNuevo(); S.vista = 'inicio';
    await cargar(); window.scrollTo(0, 0);
  });

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await sb.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('password') });
    $('#login-error').textContent = error ? 'Correo o contraseña incorrectos.' : '';
  });

  // ---------- inicio ----------
  let canal;
  async function entrar() {
    $('#login').hidden = true; $('#app').hidden = false;
    await cargarIdeas();
    await cargar();
    if (!canal) canal = sb.channel('cambios').on('postgres_changes', { event: '*', schema: 'public' }, recargar).subscribe();
  }
  sb.auth.onAuthStateChange((_ev, session) => {
    if (session) entrar();
    else { $('#app').hidden = true; $('#login').hidden = false; }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) cargar(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
