// Lógica del presupuesto "Salidas - Recreación".
// Funciones puras: no tocan la base de datos ni el DOM.
(function (root) {
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const key = (dt) => dt.toISOString().slice(0, 10);
  const add = (k, n) => { const d = parse(k); d.setUTCDate(d.getUTCDate() + n); return key(d); };
  const dow = (k) => parse(k).getUTCDay(); // 0 domingo … 6 sábado
  const lunesDe = (k) => { const w = dow(k); return add(k, w === 0 ? -6 : 1 - w); };
  const mesDe = (k) => k.slice(0, 7);
  const periodoDe = (k) => lunesDe(k) + '|' + mesDe(k);
  const hoySantiago = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // Tipo de día (solo para mostrar y para el reparto automático):
  // fijo = miércoles a domingo; lunes y martes = 'opcional' salvo feriado.
  function tipoDia(k, feriados) {
    const w = dow(k);
    if (w === 1 || w === 2) return feriados[k] ? 'feriado' : 'opcional';
    return 'fijo';
  }
  const esHabil = (k, feriados) => tipoDia(k, feriados) !== 'opcional';

  // Presupuesto de cada período (semana × mes) de un mes.
  // Los períodos con monto definido usan ese monto; el resto del total mensual
  // se reparte en proporción a sus días hábiles, redondeado a $1.000.
  function planMes(mes, { feriados, montos, mensual, inicio }) {
    const grupos = new Map();
    for (let d = mes + '-01'; mesDe(d) === mes; d = add(d, 1)) {
      if (d < inicio) continue;
      const pk = periodoDe(d);
      if (!grupos.has(pk)) grupos.set(pk, 0);
      if (esHabil(d, feriados)) grupos.set(pk, grupos.get(pk) + 1);
    }
    const plan = {};
    let definido = 0, habilesLibres = 0;
    for (const [pk, h] of grupos) {
      if (montos[pk] != null) { plan[pk] = { monto: montos[pk], manual: true }; definido += montos[pk]; }
      else habilesLibres += h;
    }
    const restante = Math.max(0, mensual - definido);
    let acum = 0, asignado = 0;
    for (const [pk, h] of grupos) {
      if (plan[pk]) continue;
      acum += h;
      const hasta = habilesLibres ? Math.round((restante * acum) / habilesLibres / 1000) * 1000 : 0;
      plan[pk] = { monto: hasta - asignado, manual: false };
      asignado = hasta;
    }
    return plan;
  }

  // Recorre día a día desde `inicio` hasta el domingo de la semana de `hoy`
  // (o hasta `hasta` si es posterior) y arma los períodos con arrastre de exceso.
  function calcular({ inicio, hoy, hasta, salidas, feriados, transferencias, montos = {}, mensual = 0 }) {
    const gastoDia = {};
    for (const s of salidas) if (s.fecha >= inicio) gastoDia[s.fecha] = (gastoDia[s.fecha] || 0) + s.monto;
    const transf = {};
    for (const t of transferencias) transf[t.periodo] = (transf[t.periodo] || 0) + t.monto;
    const planes = {};
    const planDe = (mes) => planes[mes] || (planes[mes] = planMes(mes, { feriados, montos, mensual, inicio }));

    let fin = add(lunesDe(hoy), 6);
    if (hasta && hasta > fin) fin = add(lunesDe(hasta), 6);

    const periodos = [];
    let p = null;
    for (let d = lunesDe(inicio); d <= fin; d = add(d, 1)) {
      if (d < inicio) continue;
      const pk = periodoDe(d);
      if (!p || p.key !== pk) {
        const [lunes, mes] = pk.split('|');
        const plan = planDe(mes)[pk] || { monto: 0, manual: false };
        p = { key: pk, lunes, domingo: add(lunes, 6), mes, dias: [], presupuesto: plan.monto, manual: plan.manual, gastado: 0 };
        periodos.push(p);
      }
      p.dias.push({ fecha: d, tipo: tipoDia(d, feriados), gasto: gastoDia[d] || 0, feriado: feriados[d] || null });
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

  const api = { parse, key, add, dow, lunesDe, mesDe, periodoDe, hoySantiago, tipoDia, planMes, calcular };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logica = api;
})(this);
