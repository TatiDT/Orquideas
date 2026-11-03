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

    $('#alertas-activas').innerHTML = estado.alertas.map(a =>
      `<div class="alerta-item ${esc(a.severidad)}"><b>Nave ${esc(a.nave)}</b> ${esc(a.mensaje)}</div>`).join('');

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
    try { estado = await api('/api/estado'); renderVivo(); } catch { }
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
    if (vista === 'calendario') renderRiegos();
  }
  const hoyStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  function renderRiegos() {
    $('#riegos').innerHTML = riegos.length ? riegos.map(r => {
      const st = estadoRiego(r);
      return `<div class="riego">
        <div class="hora">${esc(r.prog.slice(11))}<small>${fechaProg(r.prog)}</small></div>
        <div class="info"><b>${esc(r.nombre)}</b><span class="muted">Nave ${esc(r.nave)} · ${r.duracion_min} min${r.volumen_litros ? ` · ${r.volumen_litros} L` : ''}</span></div>
        <span class="st ${st}">${st === 'ATRASADO' ? 'Atrasado' : st.charAt(0) + st.slice(1).toLowerCase()}</span>
        <div class="btns">${abierto(r) ? `<button class="btn sm primary" data-riego="${r.id}" data-acc="realizar">✓ Regado</button><button class="btn sm" data-riego="${r.id}" data-acc="omitir">Omitir</button>` : ''}</div>
      </div>`;
    }).join('') : '<div class="vacio">Aún no hay riegos generados. Los riegos aparecen el día en que corresponden según cada calendario.</div>';
  }
  $('#riegos').addEventListener('click', async e => {
    const b = e.target.closest('[data-riego]');
    if (!b) return;
    b.disabled = true;
    try { await api(`/api/riegos/${b.dataset.riego}/${b.dataset.acc}`, 'POST', {}); await cargarRiegos(); }
    catch (err) { toast({ titulo: 'No se pudo actualizar', mensaje: err.message, severidad: 'CRITICA' }); b.disabled = false; }
  });

  function renderCalendarios() {
    $('#calendarios').innerHTML = calendarios.length ? calendarios.map(c => `
      <div class="cal ${c.activo ? '' : 'inactivo'}">
        <div class="cal-top"><div><h3>${esc(c.nombre)}</h3><span class="muted">Nave ${esc(c.nave)}</span></div>
          <label class="switch" title="Activar o pausar"><input type="checkbox" data-toggle="${c.id}" ${c.activo ? 'checked' : ''} aria-label="Activo"><span></span></label></div>
        <div class="dias-mini">${DIAS.map(d => `<span class="${c.dias.includes(d) ? 'on' : ''}">${d}</span>`).join('')}</div>
        <dl><dt>Hora</dt><dd class="mono">${esc(c.hora)}</dd>
          <dt>Duración</dt><dd>${c.duracion_min} min${c.volumen_litros ? ` · ${c.volumen_litros} L` : ''}</dd>
          <dt>Aviso</dt><dd>${c.minutos_aviso} min antes</dd>
          <dt>Próximo</dt><dd>${c.activo && c.proximo ? `${fechaProg(c.proximo)} · ${esc(c.proximo.slice(11))}` : '—'}</dd></dl>
        <div class="cal-btns"><button class="btn sm" data-edit="${c.id}">Editar</button><button class="btn sm" data-prueba="${c.id}" title="Genera un riego que vence en 1 minuto">Probar aviso</button><button class="btn sm danger" data-del="${c.id}">Eliminar</button></div>
      </div>`).join('') : '<div class="vacio">No hay calendarios. Crea el primero con “Nuevo calendario”.</div>';
  }

  async function cargarCalendario() {
    try { calendarios = await api('/api/calendarios'); renderCalendarios(); await cargarRiegos(); }
    catch (e) { toast({ titulo: 'Error al cargar', mensaje: e.message, severidad: 'CRITICA' }); }
  }

  $('#calendarios').addEventListener('click', async e => {
    const t = e.target;
    try {
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
    for (const k of ['nombre', 'nave', 'hora', 'duracion_min', 'volumen_litros', 'minutos_aviso', 'fecha_inicio', 'fecha_fin']) form.elements[k].value = v[k] ?? '';
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
      nombre: f.nombre.value, nave: f.nave.value, hora: f.hora.value,
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
  let sonido = store.get('sonido', true);
  const actualizarSonido = () => { $('#btn-sonido').classList.toggle('off', !sonido); $('#btn-sonido').textContent = sonido ? '🔊' : '🔇'; };
  actualizarSonido();
  $('#btn-sonido').addEventListener('click', () => { sonido = !sonido; store.set('sonido', sonido); actualizarSonido(); if (sonido) beep(); });

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.setValueAtTime(.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .4);
      o.start(); o.stop(ctx.currentTime + .4);
    } catch { }
  }

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
    if (sonido) beep();
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
