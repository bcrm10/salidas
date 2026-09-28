// Lógica del presupuesto "Salidas - Recreación".
// Funciones puras: no tocan la base de datos ni el DOM.
(function (root) {
  const CUOTA_DIA = 10000;

  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const key = (dt) => dt.toISOString().slice(0, 10);
  const add = (k, n) => { const d = parse(k); d.setUTCDate(d.getUTCDate() + n); return key(d); };
  const dow = (k) => parse(k).getUTCDay(); // 0 domingo … 6 sábado
  const lunesDe = (k) => { const w = dow(k); return add(k, w === 0 ? -6 : 1 - w); };
  const mesDe = (k) => k.slice(0, 7);
  const periodoDe = (k) => lunesDe(k) + '|' + mesDe(k);
  const hoySantiago = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // fijo: miércoles a domingo. Lunes y martes: feriado o activado suman; si no, opcional (0).
  function tipoDia(k, feriados, activados) {
    const w = dow(k);
    if (w === 1 || w === 2) {
      if (feriados[k]) return 'feriado';
      if (activados.has(k)) return 'activado';
      return 'opcional';
    }
    return 'fijo';
  }
  const cuotaDe = (tipo) => (tipo === 'opcional' ? 0 : CUOTA_DIA);

  // Recorre día a día desde `inicio` hasta el domingo de la semana de `hoy`
  // (o hasta `hasta` si es posterior) y arma los períodos semana×mes con arrastre.
  function calcular({ inicio, hoy, hasta, salidas, activados, feriados, transferencias }) {
    const gastoDia = {};
    for (const s of salidas) if (s.fecha >= inicio) gastoDia[s.fecha] = (gastoDia[s.fecha] || 0) + s.monto;
    const transf = {};
    for (const t of transferencias) transf[t.periodo] = (transf[t.periodo] || 0) + t.monto;

    let fin = add(lunesDe(hoy), 6);
    if (hasta && hasta > fin) fin = add(lunesDe(hasta), 6);

    const periodos = [];
    let p = null;
    for (let d = lunesDe(inicio); d <= fin; d = add(d, 1)) {
      if (d < inicio) continue;
      const pk = periodoDe(d);
      if (!p || p.key !== pk) {
        const [lunes, mes] = pk.split('|');
        p = { key: pk, lunes, domingo: add(lunes, 6), mes, dias: [], presupuesto: 0, gastado: 0 };
        periodos.push(p);
      }
      const tipo = tipoDia(d, feriados, activados);
      p.dias.push({ fecha: d, tipo, gasto: gastoDia[d] || 0, feriado: feriados[d] || null });
      p.presupuesto += cuotaDe(tipo);
      p.gastado += gastoDia[d] || 0;
    }

    let arrastre = 0;
    for (const x of periodos) {
      x.desde = x.dias[0].fecha;
      x.hasta = x.dias[x.dias.length - 1].fecha;
      x.descuento = arrastre;
      x.disponible = x.presupuesto - arrastre;
      x.transferido = transf[x.key] || 0;
      x.libre = x.disponible - x.gastado - x.transferido;
      x.exceso = x.libre < 0 ? -x.libre : 0;
      x.estado = x.hasta < hoy ? 'cerrado' : x.desde > hoy ? 'por venir' : 'en curso';
      x.pendiente = x.estado === 'cerrado' && x.libre > 0 ? x.libre : 0;
      // El exceso se descuenta al período siguiente (aunque sea de otro mes).
      if (x.estado !== 'por venir') arrastre = x.exceso;
    }
    return periodos;
  }

  const api = { CUOTA_DIA, parse, key, add, dow, lunesDe, mesDe, periodoDe, hoySantiago, tipoDia, calcular };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logica = api;
})(this);
