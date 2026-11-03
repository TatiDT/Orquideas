(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 1) => Number(n).toFixed(d);
  const pad = n => String(n).padStart(2, '0');

  async function api(url, method = 'GET', body) {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      let errores = [`Error ${res.status}`];
      try { errores = (await res.json()).errores || errores; } catch { }
      throw Object.assign(new Error(errores.join(', ')), { errores });
    }
    return res.status === 204 ? null : res.json();
  }

  const fechaProg = prog => {
    const d = new Date(prog + ':00');
    const dia = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()];
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()];
    return `${dia} ${pad(d.getDate())} ${mes}`;
  };
  const hace = iso => {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : new Date(iso).toLocaleDateString('es-CL');
  };

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  };

  let vista = 'vivo';
  function irA(v) {
    vista = v;
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${v}`));
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    if (v === 'calendario') cargarCalendario();
    if (v === 'historial') cargarHistorial();
  }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) irA(b.dataset.view); });

  let naveSel = 'A';
  let estado = null;

  const gaugeArco = (frac, color, marca) => {
    const C = 2 * Math.PI * 52, vis = 0.75 * C;
    const f = Math.max(0, Math.min(1, frac));
    const ang = (135 + 270 * (marca ?? 0)) * Math.PI / 180;
    return `<circle cx="70" cy="70" r="52" fill="none" stroke="#f3eefa" stroke-width="12" stroke-linecap="round" stroke-dasharray="${vis} ${C}" transform="rotate(135 70 70)"/>
      <circle cx="70" cy="70" r="52" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${vis * f} ${C}" transform="rotate(135 70 70)"/>
      ${marca != null ? `<circle cx="${70 + 52 * Math.cos(ang)}" cy="${70 + 52 * Math.sin(ang)}" r="4" fill="#fff" stroke="${color}" stroke-width="2"/>` : ''}`;
  };

  function renderVivo() {
    if (!estado) return;
    const P = estado.parametros;
    const sel = estado.naves.find(n => n.codigo === naveSel) || estado.naves[0];
    $('#hero-hr').textContent = sel.hr != null ? `${num(sel.hr)}%` : '--';
    $('#hero-t').textContent = sel.temp != null ? `${num(sel.temp)}°C` : '--';

    const av = $('#aviso-fuente');
    av.hidden = !estado.error;
    if (estado.error) av.textContent = `No se pudo leer la fuente de sensores (${estado.error}). Se muestran las últimas lecturas conocidas.`;


    $('#naves').innerHTML = estado.naves.map(n => {
      if (n.sinDatos) return `<div class="nave"><span class="tag">NAVE ${esc(n.codigo)}</span><h3>${esc(n.especies)}</h3><p class="muted">Sin datos del sensor</p></div>`;
      return `<button class="nave ${n.codigo === sel.codigo ? 'sel' : ''}" data-nave="${esc(n.codigo)}">
        <span class="orden">${pad(n.orden)}</span>
        <span class="tag">NAVE ${esc(n.codigo)}</span>
        <h3>${esc(n.especies)}</h3>
        <p class="muted">${n.plantas.toLocaleString('es-CL')} orquídeas en cultivo</p>
        <div class="lecturas">
          <div class="lectura ${n.hrOk ? 'ok' : 'warn'}"><small>Humedad: <span>${n.hrOk ? '✓' : '⚠'}</span></small><div class="v mono">${num(n.hr)}%</div></div>
          <div class="lectura ${n.tOk ? 'ok' : 'warn'}"><small>Temperatura: <span>${n.tOk ? '✓' : '⚠'}</span></small><div class="v mono">${num(n.temp)}°C</div></div>
        </div>
        <div class="pills">${n.actuadores.map((a, i) => `<span class="pill ${i === 0 ? 'act' : ''}">${esc(a)}</span>`).join('')}</div>
      </button>`;
    }).join('');

    if (sel.sinDatos) { $('#gauges').innerHTML = ''; return; }
    const hrColor = sel.hrOk ? '#a21caf' : '#d97706', tColor = sel.tOk ? '#7e22ce' : '#d97706';
    const gauge = (titulo, ok, svg) => `<div class="gauge"><div class="gauge-head"><span>${titulo}</span><span class="estado ${ok ? 'ok' : 'warn'}">${ok ? 'En Rango' : 'Fuera de Rango'}</span></div>${svg}</div>`;
    const dpvOk = sel.dpv >= 0.4 && sel.dpv <= 0.9;
    $('#gauges').innerHTML =
      gauge('Humedad Relativa', sel.hrOk, `<svg viewBox="0 0 140 140">${gaugeArco(sel.hr / 100, hrColor, P.hr_meta / 100)}<text class="num" x="70" y="76">${num(sel.hr)}<tspan font-size="12">%</tspan></text><text class="sub" x="70" y="94">Setpoint: ${P.hr_meta}%</text></svg>`) +
      gauge('Temperatura Ambiente', sel.tOk, `<svg viewBox="0 0 140 140">${gaugeArco((sel.temp - 10) / 25, tColor, 0.44)}<text class="num" x="70" y="76">${num(sel.temp)}<tspan font-size="12">°c</tspan></text><text class="sub" x="70" y="94">Rango: ${P.temp_min}–${P.temp_max}°C</text></svg>`) +
      `<div class="gauge"><div class="gauge-head"><span>Déficit Presión Vapor (DPV)</span><span class="estado ${dpvOk ? 'ok' : 'warn'}">${dpvOk ? 'Óptimo' : 'Revisar'}</span></div>
        <div class="grande">${num(sel.dpv, 2)} <small>kPa</small></div><p class="muted">Indica la tasa de transpiración foliar. El rango ideal para orquídeas epífitas se sitúa entre 0.4 y 0.9 kPa.</p></div>` +
      `<div class="gauge"><div class="gauge-head"><span>Punto de Rocío</span></div>
        <div class="grande">${num(sel.rocio)} <small>°C</small></div><p class="muted">Temperatura a la que condensa el vapor. Mantener por debajo de la temperatura ambiente para evitar hongos.</p></div>`;

    $('#foot-fuente').textContent = `Fuente: ${estado.fuente === 'externo' ? 'URL externa' : 'sin sensores (datos en 0)'} · actualizado ${estado.actualizado ? new Date(estado.actualizado).toLocaleTimeString('es-CL') : '--'}`;
  }
  $('#naves').addEventListener('click', e => {
    const b = e.target.closest('[data-nave]');
    if (b) { naveSel = b.dataset.nave; renderVivo(); }
  });

  async function cargarEstado() {
    try { estado = await api('/api/estado'); renderVivo(); if (vista === 'calendario') { renderCalendarios(); renderRiegos(); } } catch { }
  }

  let calendarios = [];
  let riegos = [];

  const estadoRiego = r => (['PENDIENTE', 'NOTIFICADO'].includes(r.estado) && new Date(r.prog + ':00') < new Date() ? 'ATRASADO' : r.estado);
  const abierto = r => ['PENDIENTE', 'NOTIFICADO'].includes(r.estado);

  async function cargarRiegos() {
    riegos = await api('/api/riegos');
    const n = riegos.filter(r => abierto(r) && r.prog.slice(0, 10) === hoyStr()).length;
    $('#badge-riegos').hidden = !n;
    $('#badge-riegos').textContent = n;
    if (vista === 'calendario') { renderCalendarios(); renderRiegos(); }
  }
  const hoyStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  const fechaCorta = prog => `${prog.slice(8, 10)}/${prog.slice(5, 7)}/${prog.slice(0, 4)}`;
  const ICO = {
    reloj: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    chispa: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3l1.8 4.7L15.5 9.5l-4.7 1.8L9 16l-1.8-4.7L2.5 9.5l4.7-1.8zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/></svg>',
    volver: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    basura: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  };

  function sensorRiego(nave) {
    const n = estado && estado.naves.find(x => x.codigo === nave);
    if (!n || n.sinDatos || estado.fuente !== 'externo') return '<b>Sensor Nave:</b> sin datos del sensor.';
    const cabecera = `<b>Sensor Nave: HR ${num(n.hr)}% (${num(n.temp)}°C).</b>`;
    if (!n.hrOk && n.hr < estado.parametros.hr_meta) return `${cabecera} <span class="bad">Humedad perimetral baja.</span> Se recomienda nebulizar hojas además del riego.`;
    if (!n.hrOk) return `${cabecera} <span class="bad">Humedad alta.</span> Revisar ventilación antes de regar.`;
    return `${cabecera} <span class="ok">Humedad óptima para orquídeas.</span>`;
  }

  const CONSEJOS = [
    'Con la humedad actual cercana al 80%, el sustrato drena despacio. Drenar completamente las macetas para prevenir pudrición de corona bacteriana.',
    'Riega temprano en la mañana para que las hojas y el cuello de la planta se sequen antes del anochecer.',
    'Usa agua desmineralizada o de lluvia: las sales acumuladas del agua dura queman las raíces y manchan las hojas.',
    'Las raíces verde esmeralda están hidratadas; si se ven gris plateado es el momento óptimo de regar.',
    'No dejes agua acumulada en el centro de la planta: inclina ligeramente la maceta o seca con un paño para evitar hongos.',
    'Si el sustrato de corteza aún está húmedo al tacto, espera un día más: el exceso de riego pudre las raíces antes que la sequía.',
    'Riega con agua a temperatura ambiente; el agua fría estresa las raíces, sobre todo en Phalaenopsis.',
    'Una vez al mes, riega abundante con agua sola para lavar los restos de fertilizante del sustrato.',
    'En Vandas y epífitas de raíz aérea, la nebulización fina hasta que las raíces se pongan verde oscuro reemplaza al riego de sustrato.',
    'Asegura ventilación después de regar: la humedad alta sin circulación de aire favorece hongos y bacterias.',
  ];

  function renderAvisoRiego() {
    const vencidos = riegos.filter(r => abierto(r) && (estadoRiego(r) === 'ATRASADO' || r.hora_notificada));
    const el = $('#aviso-riego');
    el.hidden = !vencidos.length;
    if (!vencidos.length) return;
    const n = vencidos.length;
    const semilla = vencidos.reduce((a, r) => a + r.id, 0) + new Date().getHours();
    el.innerHTML = `<div class="ar-ico">🔔</div>
      <div class="ar-cuerpo">
        <h3>¡Momento de Regar Orquídeas! (${n} ${n === 1 ? 'lote listo' : 'lotes listos'} para hidratación)</h3>
        <p>${n === 1 ? 'La siguiente orquídea ha completado su periodo' : 'Las siguientes orquídeas han completado su periodo'} de secado. Compruebe que el velamen radicular esté en tono gris plateado antes de iniciar el riego.</p>
        <p class="ar-consejo">${ICO.chispa} Consejo botánico: ${esc(CONSEJOS[semilla % CONSEJOS.length])}</p>
      </div>`;
  }

  function renderRiegos() {
    renderAvisoRiego();
    renderProgramar();
    $('#riegos').innerHTML = riegos.length ? riegos.map(r => {
      const st = estadoRiego(r);
      return `<div class="riego">
        <div class="hora">${esc(r.prog.slice(11))}<small>${fechaProg(r.prog)}</small></div>
        <div class="info"><b>${esc(r.nombre)}</b><span class="muted">Nave ${esc(r.nave)} · ${r.duracion_min} min${r.volumen_litros ? ` · ${r.volumen_litros} L` : ''}</span></div>
        <span class="st ${st}">${st === 'ATRASADO' ? 'Atrasado' : st.charAt(0) + st.slice(1).toLowerCase()}</span>
        <div class="btns">${abierto(r) ? `<button class="btn sm" data-riego="${r.id}" data-acc="omitir">Omitir</button>` : ''}<button class="btn sm danger" data-riego="${r.id}" data-acc="eliminar">Quitar</button></div>
      </div>`;
    }).join('') : '<div class="vacio">Aún no hay riegos registrados. Aparecen el día en que corresponden según cada lote.</div>';
  }
  $('#riegos').addEventListener('click', async e => {
    const b = e.target.closest('[data-riego]');
    if (!b) return;
    if (b.dataset.acc === 'eliminar' && !confirm('¿Quitar este riego del registro?')) return;
    b.disabled = true;
    try {
      if (b.dataset.acc === 'eliminar') await api(`/api/riegos/${b.dataset.riego}`, 'DELETE');
      else await api(`/api/riegos/${b.dataset.riego}/${b.dataset.acc}`, 'POST', {});
      await cargarRiegos();
    }
    catch (err) { toast({ titulo: 'No se pudo actualizar', mensaje: err.message, severidad: 'CRITICA' }); b.disabled = false; }
  });

  function renderCalendarios() {
    $('#calendarios').innerHTML = calendarios.length ? calendarios.map(c => {
      const nave = estado && estado.naves.find(n => n.codigo === c.nave);
      const abiertos = riegos.filter(r => r.id_calendario === c.id && abierto(r)).sort((a, b) => a.prog.localeCompare(b.prog));
      const vencido = abiertos.find(r => estadoRiego(r) === 'ATRASADO' || r.hora_notificada);
      const proximo = (abiertos[0] && abiertos[0].prog) || (c.activo && c.proximo) || null;
      const ultimo = riegos.filter(r => r.id_calendario === c.id && r.estado === 'REALIZADO' && r.realizado_en).map(r => r.realizado_en).sort().pop();
      const pill = !c.activo ? ['PAUSADO', 'Pausado'] : vencido ? ['ATRASADO', 'Momento de Riego'] : abiertos.length ? ['NOTIFICADO', 'Riego Programado'] : ['PENDIENTE', 'En Espera'];
      const lote = c.lote || `LOTE-${c.nave}-${pad(c.id)}`;
      const freq = `${c.dias.map(d => d.charAt(0) + d.slice(1).toLowerCase()).join(', ')} a las ${c.hora}`;
      return `<article class="riego-card ${vencido ? 'abierto' : ''} ${c.activo ? '' : 'inactivo'}">
        <div class="rc-top">
          <span class="rc-lote mono">${esc(lote)}</span>
          <span class="rc-pill ${pill[0]}">${vencido ? ICO.alerta : ''}${pill[1]}</span>
          <label class="switch" title="Activar o pausar"><input type="checkbox" data-toggle="${c.id}" ${c.activo ? 'checked' : ''} aria-label="Activo"><span></span></label>
          <button class="rc-del" data-del="${c.id}" title="Eliminar lote" aria-label="Eliminar lote">${ICO.basura}</button>
        </div>
        <h3>${esc(c.especie || c.nombre)}</h3>
        <p class="muted">Nave ${esc(c.nave)}${nave ? ` - ${esc(nave.especies)}` : ''}</p>
        <dl class="rc-datos">
          <div><dt>Especie:</dt><dd>${esc(c.especie || c.nombre)}</dd></div>
          <div><dt>Frecuencia:</dt><dd>${esc(freq)}</dd></div>
          <div><dt>Método:</dt><dd>${esc(c.metodo || '—')}</dd></div>
          <div><dt>Nutrición / Abono:</dt><dd>${esc(c.nutricion || '—')}</dd></div>
          <div><dt>Volumen agua:</dt><dd class="mono vol">${c.volumen_litros ? `${c.volumen_litros} L` : '—'}</dd></div>
          <div><dt>Duración / Aviso:</dt><dd>${c.duracion_min} min · ${c.minutos_aviso} min antes</dd></div>
        </dl>
        <div class="rc-prox">
          <span>${ICO.reloj} Próximo riego: <b class="mono">${proximo ? `${fechaCorta(proximo)} ${esc(proximo.slice(11))}` : '—'}</b></span>
          <span class="muted">Último: ${ultimo ? fechaCorta(ultimo) : '—'}</span>
        </div>
        <div class="rc-sensor">${ICO.chispa}<p>${sensorRiego(c.nave)}</p></div>
        ${c.nota ? `<p class="rc-nota">"${esc(c.nota)}"</p>` : ''}
        <div class="rc-btns">
          <span class="rc-izq"><button class="btn sm" data-edit="${c.id}">Editar</button><button class="btn sm" data-prueba="${c.id}" title="Genera un riego que vence en 1 minuto">Probar aviso</button></span>
          <button class="btn sm" data-posponer="${c.id}">${ICO.volver} Posponer 24h</button>
          <button class="btn sm dark" data-registrar="${c.id}">${ICO.check} Registrar Riego</button>
        </div>
      </article>`;
    }).join('') : '<div class="vacio">No hay lotes. Crea el primero con “Nuevo calendario”.</div>';
  }

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIA_COD = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  let mesVista = new Date(); mesVista.setDate(1);
  let diaSel = null;

  const recurrentesDe = fecha => {
    const cod = DIA_COD[new Date(fecha + 'T00:00:00').getDay()];
    return calendarios.filter(c => c.activo && c.dias.includes(cod) && fecha >= c.fecha_inicio && (!c.fecha_fin || fecha <= c.fecha_fin));
  };

  function renderProgramar() {
    const sel = $('#prog-lote');
    const previo = sel.value;
    sel.innerHTML = calendarios.map(c => `<option value="${c.id}">${esc(c.nombre)} · Nave ${esc(c.nave)}</option>`).join('');
    if (previo && calendarios.some(c => c.id == previo)) sel.value = previo;
    if (!$('#prog-hora').dataset.tocada && calendarios.length) { const c = calendarios.find(x => x.id == sel.value); if (c) $('#prog-hora').value = c.hora; }

    const y = mesVista.getFullYear(), m = mesVista.getMonth();
    $('#mes-titulo').textContent = `${MESES[m]} ${y}`;
    const hoy = hoyStr();
    const primero = (new Date(y, m, 1).getDay() + 6) % 7;
    const dias = new Date(y, m + 1, 0).getDate();
    const conRiego = new Set(riegos.filter(r => abierto(r)).map(r => r.prog.slice(0, 10)));
    let html = DIAS.map(d => `<span class="mes-cab">${d.charAt(0) + d.slice(1).toLowerCase()}</span>`).join('');
    for (let i = 0; i < primero; i++) html += '<span></span>';
    for (let d = 1; d <= dias; d++) {
      const f = iso(y, m, d);
      const pasado = f < hoy;
      const prog = conRiego.has(f), rec = !pasado && recurrentesDe(f).length > 0;
      html += `<button class="mes-dia ${f === hoy ? 'hoy' : ''} ${f === diaSel ? 'sel' : ''}" data-dia="${f}" ${pasado ? 'disabled' : ''}>${d}<span class="pts">${prog ? '<i class="pt prog"></i>' : ''}${rec ? '<i class="pt rec"></i>' : ''}</span></button>`;
    }
    $('#mes-dias').innerHTML = html;

    const fecha = $('#prog-fecha'), lista = $('#prog-lista');
    $('#prog-btn').disabled = !diaSel || !calendarios.length;
    if (!diaSel) { fecha.textContent = 'Selecciona un día'; lista.innerHTML = ''; return; }
    fecha.textContent = `${fechaProg(diaSel + 'T00:00')} ${diaSel.slice(0, 4)}`;
    const delDia = riegos.filter(r => r.prog.slice(0, 10) === diaSel && abierto(r)).sort((a, b) => a.prog.localeCompare(b.prog));
    lista.innerHTML = delDia.map(r => `<div class="prog-item"><span class="mono">${esc(r.prog.slice(11))}</span><span>${esc(r.nombre)} · Nave ${esc(r.nave)}</span><button class="rc-del" data-quitar="${r.id}" title="Cancelar riego" aria-label="Cancelar riego">${ICO.basura}</button></div>`).join('')
      + recurrentesDe(diaSel).map(c => `<div class="prog-item rec"><span class="mono">${esc(c.hora)}</span><span>${esc(c.nombre)} · Nave ${esc(c.nave)}</span><small>recurrente</small></div>`).join('');
  }

  $('#mes-prev').addEventListener('click', () => { mesVista.setMonth(mesVista.getMonth() - 1); renderProgramar(); });
  $('#mes-next').addEventListener('click', () => { mesVista.setMonth(mesVista.getMonth() + 1); renderProgramar(); });
  $('#mes-dias').addEventListener('click', e => {
    const b = e.target.closest('[data-dia]');
    if (b) { diaSel = b.dataset.dia; renderProgramar(); }
  });
  $('#prog-hora').addEventListener('input', e => { e.target.dataset.tocada = '1'; });
  $('#prog-lote').addEventListener('change', () => {
    const c = calendarios.find(x => x.id == $('#prog-lote').value);
    if (c) { $('#prog-hora').value = c.hora; delete $('#prog-hora').dataset.tocada; }
  });
  $('#prog-btn').addEventListener('click', async () => {
    const box = $('#prog-error');
    box.hidden = true;
    try {
      const r = await api('/api/riegos/programar', 'POST', { id_calendario: $('#prog-lote').value, fecha: diaSel, hora: $('#prog-hora').value });
      await cargarRiegos();
    } catch (err) { box.hidden = false; box.innerHTML = (err.errores || [err.message]).map(esc).join('<br>'); }
  });
  $('#prog-lista').addEventListener('click', async e => {
    const b = e.target.closest('[data-quitar]');
    if (!b) return;
    try { await api(`/api/riegos/${b.dataset.quitar}`, 'DELETE'); await cargarRiegos(); } catch (err) { toast({ titulo: 'Error', mensaje: err.message, severidad: 'CRITICA' }); }
  });

  async function cargarCalendario() {
    try { calendarios = await api('/api/calendarios'); renderCalendarios(); await cargarRiegos(); }
    catch (e) { toast({ titulo: 'Error al cargar', mensaje: e.message, severidad: 'CRITICA' }); }
  }

  $('#calendarios').addEventListener('click', async e => {
    const t = e.target.closest('button') || e.target;
    try {
      if (t.dataset.posponer || t.dataset.registrar) { const id = t.dataset.posponer || t.dataset.registrar; t.disabled = true; await api('/api/calendarios/' + id + (t.dataset.posponer ? '/posponer' : '/registrar'), 'POST', {}); toast({ titulo: t.dataset.posponer ? 'Riego pospuesto 24 h' : 'Riego registrado', mensaje: '' }); await cargarCalendario(); }
      if (t.dataset.edit) abrirModal(calendarios.find(c => c.id == t.dataset.edit));
      if (t.dataset.prueba) { const r = await api(`/api/calendarios/${t.dataset.prueba}/prueba`, 'POST'); toast({ titulo: 'Riego de prueba creado', mensaje: `Vence a las ${r.prog.slice(11)}. Recibirás el aviso a esa hora.` }); await cargarRiegos(); }
      if (t.dataset.del && confirm('¿Eliminar este calendario? Los riegos pendientes también se eliminarán.')) { await api(`/api/calendarios/${t.dataset.del}`, 'DELETE'); await cargarCalendario(); }
    } catch (err) { toast({ titulo: 'Error', mensaje: err.message, severidad: 'CRITICA' }); }
  });
  $('#calendarios').addEventListener('change', async e => {
    if (!e.target.dataset.toggle) return;
    try { await api(`/api/calendarios/${e.target.dataset.toggle}`, 'PUT', { activo: e.target.checked }); await cargarCalendario(); }
    catch (err) { toast({ titulo: 'Error', mensaje: err.message, severidad: 'CRITICA' }); await cargarCalendario(); }
  });

  const form = $('#form-cal');
  $('#dias').innerHTML = DIAS.map(d => `<label class="dia"><input type="checkbox" name="dias" value="${d}"><span>${d}</span></label>`).join('');
  let editId = null;

  function abrirModal(c) {
    editId = c ? c.id : null;
    form.reset();
    $('#modal-titulo').textContent = c ? 'Editar calendario' : 'Nuevo calendario';
    $('#form-errores').hidden = true;
    const v = c || { nombre: '', nave: naveSel, hora: '08:00', dias: [], duracion_min: 10, volumen_litros: '', minutos_aviso: 15, fecha_inicio: hoyStr(), fecha_fin: '' };
    for (const k of ['nombre', 'lote', 'especie', 'metodo', 'nutricion', 'nota', 'nave', 'hora', 'duracion_min', 'volumen_litros', 'minutos_aviso', 'fecha_inicio', 'fecha_fin']) form.elements[k].value = v[k] ?? '';
    form.querySelectorAll('[name=dias]').forEach(i => { i.checked = v.dias.includes(i.value); });
    $('#modal').hidden = false;
    form.elements.nombre.focus();
  }
  const cerrarModal = () => { $('#modal').hidden = true; };
  $('#btn-nuevo').addEventListener('click', () => abrirModal(null));
  $('#btn-cancelar').addEventListener('click', cerrarModal);
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') cerrarModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { cerrarModal(); $('#panel-notif').hidden = true; } });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form.elements;
    const body = {
      nombre: f.nombre.value, lote: f.lote.value, especie: f.especie.value, metodo: f.metodo.value, nutricion: f.nutricion.value, nota: f.nota.value, nave: f.nave.value, hora: f.hora.value,
      dias: [...form.querySelectorAll('[name=dias]:checked')].map(i => i.value),
      duracion_min: f.duracion_min.value, volumen_litros: f.volumen_litros.value,
      minutos_aviso: f.minutos_aviso.value, fecha_inicio: f.fecha_inicio.value, fecha_fin: f.fecha_fin.value,
    };
    try {
      await (editId ? api(`/api/calendarios/${editId}`, 'PUT', body) : api('/api/calendarios', 'POST', body));
      cerrarModal();
      toast({ titulo: 'Calendario guardado', mensaje: body.nombre });
      await cargarCalendario();
    } catch (err) {
      const box = $('#form-errores');
      box.hidden = false;
      box.innerHTML = (err.errores || [err.message]).map(esc).join('<br>');
    }
  });

  async function cargarHistorial() {
    try {
      const [cfg, filas] = await Promise.all([
        api('/api/config'),
        api(`/api/historial?horas=${$('#sel-horas').value}&nave=${$('#sel-nave-h').value}`),
      ]);
      $('#sel-frec').value = cfg.frecuencia_min;
      const P = estado?.parametros || { hr_meta: 80, hr_tolerancia: 5, temp_min: 18, temp_max: 24 };
      $('#tbody-hist').innerHTML = filas.length ? filas.map(h => {
        const ok = Math.abs(h.hr - P.hr_meta) <= P.hr_tolerancia && h.temp >= P.temp_min && h.temp <= P.temp_max;
        return `<tr><td class="mono">${new Date(h.fecha).toLocaleString('es-CL')}</td><td>${esc(h.nave)}</td><td class="mono">${num(h.hr)}%</td><td class="mono">${num(h.temp)}°C</td><td class="mono">${num(h.dpv, 2)} kPa</td><td class="mono">${num(h.rocio)}°C</td><td><span class="st ${ok ? 'REALIZADO' : 'OMITIDO'}">${ok ? 'En rango' : 'Fuera de rango'}</span></td></tr>`;
      }).join('') : '<tr><td colspan="7" class="vacio">Sin registros en el período.</td></tr>';
    } catch (e) { toast({ titulo: 'Error al cargar historial', mensaje: e.message, severidad: 'CRITICA' }); }
  }
  $('#sel-frec').addEventListener('change', async e => {
    try { await api('/api/config', 'PUT', { frecuencia_min: e.target.value }); toast({ titulo: 'Frecuencia actualizada', mensaje: e.target.selectedOptions[0].textContent }); }
    catch (err) { toast({ titulo: 'Error', mensaje: err.message, severidad: 'CRITICA' }); }
  });
  $('#sel-nave-h').addEventListener('change', cargarHistorial);
  $('#sel-horas').addEventListener('change', cargarHistorial);

  const ESPECIES = [
    ['Phalaenopsis', 'Orquídea Mariposa', 'Nave A', 'Epífita. Riego cuando el sustrato se seca; evita agua acumulada en el cuello de la planta.'],
    ['Cattleya trianae', 'Flor de Mayo', 'Nave B', 'Epífita. Prefiere buena luz y un breve secado entre riegos.'],
    ['Dendrobium nobile', 'Dendrobium', 'Nave B', 'Epífita. Reduce el riego en reposo invernal; requiere ventilación.'],
    ['Vanda coerulea', 'Vanda Azul', 'Nave C', 'Epífita de raíz aérea. Necesita humedad alta y riego o nebulización frecuente.'],
    ['Oncidium', 'Lluvia de Oro', 'Nave C', 'Epífita. Riego moderado; tolera pequeñas variaciones de humedad.'],
  ];
  $('#guia').innerHTML = ESPECIES.map(([c, n, nave, t]) => `<div class="cal"><span class="tag">${nave.toUpperCase()}</span><h3>${esc(c)}</h3><p class="muted">${esc(n)}</p><p style="margin-top:8px;font-size:13px">${esc(t)}</p><dl><dt>Humedad</dt><dd>~80% HR</dd><dt>Temperatura</dt><dd>18°C – 24°C</dd></dl></div>`).join('');

  let notifs = [];

  function renderNotifs() {
    const sinLeer = notifs.filter(n => !n.leida).length;
    $('#dot-notif').hidden = !sinLeer;
    $('#lista-notif').innerHTML = notifs.length ? notifs.map(n =>
      `<div class="notif ${esc(n.severidad)} ${n.leida ? '' : 'nueva'}" data-id="${n.id}"><b>${esc(n.titulo)}</b><span>${esc(n.mensaje)}</span><time>${hace(n.creada)}</time></div>`).join('')
      : '<div class="vacio">Sin notificaciones</div>';
  }
  $('#btn-campana').addEventListener('click', () => {
    const p = $('#panel-notif');
    p.hidden = !p.hidden;
    if (!p.hidden && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  });
  $('#btn-leer-todas').addEventListener('click', async () => {
    await api('/api/notificaciones/leer-todas', 'POST');
    notifs.forEach(n => { n.leida = true; }); renderNotifs();
  });
  $('#lista-notif').addEventListener('click', async e => {
    const el = e.target.closest('[data-id]');
    const n = el && notifs.find(x => x.id == el.dataset.id);
    if (n && !n.leida) { n.leida = true; renderNotifs(); api(`/api/notificaciones/${n.id}/leer`, 'POST').catch(() => {}); }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#panel-notif, #btn-campana')) $('#panel-notif').hidden = true;
  });

  function toast(n) {
    const el = document.createElement('div');
    el.className = `toast ${n.severidad || 'INFO'}`;
    el.innerHTML = `<b>${esc(n.titulo)}</b><span>${esc(n.mensaje)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  function recibir(n) {
    if (notifs.some(x => x.id === n.id)) return;
    notifs.unshift(n);
    renderNotifs();
    toast(n);
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(n.titulo, { body: n.mensaje });
    cargarRiegos().catch(() => {});
    cargarEstado();
  }

  function conectarEventos() {
    const es = new EventSource('/api/eventos');
    es.onmessage = e => { try { recibir(JSON.parse(e.data)); } catch { } };
  }

  (async () => {
    await cargarEstado();
    try { notifs = await api('/api/notificaciones'); renderNotifs(); } catch { }
    cargarRiegos().catch(() => {});
    conectarEventos();
    setInterval(cargarEstado, 5000);
    setInterval(() => { cargarRiegos().catch(() => {}); if (vista === 'calendario') cargarCalendario(); renderNotifs(); }, 15000);
  })();
})();
