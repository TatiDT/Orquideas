try { process.loadEnvFile(); } catch { }
const express = require('express');
const path = require('path');
const S = require('./src/store');
const sensores = require('./src/sensores');
const motor = require('./src/motor');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const naveDe = c => S.NAVES.find(n => n.codigo === c);
const ABIERTO = ['PENDIENTE', 'NOTIFICADO'];

app.get('/api/estado', (req, res) => {
  const s = sensores.ultimo();
  const P = S.PARAMETROS;
  const naves = S.NAVES.map(n => {
    const l = s.lecturas.find(x => x.nave === n.codigo);
    if (!l) return { ...n, sinDatos: true };
    const act = [];
    if (l.humedad < P.hr_meta) act.push('Nebulizando');
    else if (l.humedad > P.hr_meta + P.hr_tolerancia) act.push('Ventilación');
    if (l.temperatura > 21) act.push('Sombreo 65%');
    return {
      ...n, hr: l.humedad, temp: l.temperatura, dpv: l.dpv, rocio: l.rocio,
      hrOk: Math.abs(l.humedad - P.hr_meta) <= P.hr_tolerancia,
      tOk: l.temperatura >= P.temp_min && l.temperatura <= P.temp_max,
      actuadores: act,
    };
  });
  res.json({
    fuente: s.fuente, error: s.error, actualizado: s.actualizado, parametros: P, naves,
    alertas: S.db.alertas.filter(a => !a.resuelta),
  });
});

function validarCalendario(b) {
  const e = [];
  if (!b.nombre || !String(b.nombre).trim()) e.push('Nombre requerido');
  if (!naveDe(b.nave)) e.push('Nave inválida');
  if (!Array.isArray(b.dias) || !b.dias.length || b.dias.some(d => !motor.DIAS.includes(d))) e.push('Selecciona al menos un día');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.hora || '')) e.push('Hora inválida (HH:MM)');
  const dur = Number(b.duracion_min), av = Number(b.minutos_aviso);
  if (!(dur >= 1 && dur <= 240)) e.push('Duración entre 1 y 240 min');
  if (!(av >= 0 && av <= 720)) e.push('Aviso entre 0 y 720 min');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha_inicio || '')) e.push('Fecha de inicio inválida');
  if (b.fecha_fin && b.fecha_fin < b.fecha_inicio) e.push('La fecha fin es anterior al inicio');
  if (b.volumen_litros != null && b.volumen_litros !== '' && !(Number(b.volumen_litros) >= 0)) e.push('Volumen inválido');
  return e;
}

const limpiar = b => ({
  nombre: String(b.nombre).trim(), nave: b.nave, dias: motor.DIAS.filter(d => b.dias.includes(d)),
  hora: b.hora, duracion_min: Number(b.duracion_min),
  volumen_litros: b.volumen_litros === '' || b.volumen_litros == null ? null : Number(b.volumen_litros),
  minutos_aviso: Number(b.minutos_aviso), fecha_inicio: b.fecha_inicio, fecha_fin: b.fecha_fin || null,
  activo: b.activo !== false,
});

function proximo(cal) {
  const ahora = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(ahora);
    d.setDate(d.getDate() + i);
    const f = S.fechaLocal(d);
    if (!cal.activo || !cal.dias.includes(motor.DIAS[d.getDay()]) || f < cal.fecha_inicio || (cal.fecha_fin && f > cal.fecha_fin)) continue;
    const prog = motor.progDe(f, cal.hora);
    if (new Date(prog + ':00') > ahora) return prog;
  }
  return null;
}

app.get('/api/calendarios', (req, res) => res.json(S.db.calendarios.map(c => ({ ...c, proximo: proximo(c) }))));

app.post('/api/calendarios', (req, res) => {
  const errores = validarCalendario(req.body);
  if (errores.length) return res.status(400).json({ errores });
  const cal = { id: S.nextId('calendario'), ...limpiar(req.body) };
  S.db.calendarios.push(cal);
  S.guardar();
  motor.generarRiegosDeHoy(new Date());
  motor.avisarRiegos(new Date());
  res.status(201).json(cal);
});

app.put('/api/calendarios/:id', (req, res) => {
  const cal = S.db.calendarios.find(c => c.id === +req.params.id);
  if (!cal) return res.sendStatus(404);
  const datos = { ...cal, ...req.body };
  const errores = validarCalendario(datos);
  if (errores.length) return res.status(400).json({ errores });
  Object.assign(cal, limpiar(datos));
  S.db.riegos = S.db.riegos.filter(r => !(r.id_calendario === cal.id && r.origen === 'CALENDARIO' && ABIERTO.includes(r.estado)));
  S.guardar();
  motor.generarRiegosDeHoy(new Date());
  motor.avisarRiegos(new Date());
  res.json(cal);
});

app.delete('/api/calendarios/:id', (req, res) => {
  const id = +req.params.id;
  if (!S.db.calendarios.some(c => c.id === id)) return res.sendStatus(404);
  S.db.calendarios = S.db.calendarios.filter(c => c.id !== id);
  S.db.riegos = S.db.riegos.filter(r => !(r.id_calendario === id && ABIERTO.includes(r.estado)));
  S.guardar();
  res.sendStatus(204);
});

app.post('/api/calendarios/:id/prueba', (req, res) => {
  const cal = S.db.calendarios.find(c => c.id === +req.params.id);
  if (!cal) return res.sendStatus(404);
  const t = new Date(Date.now() + 60000);
  const prog = `${S.fechaLocal(t)}T${S.pad(t.getHours())}:${S.pad(t.getMinutes())}`;
  S.db.riegos.push({
    id: S.nextId('riego'), id_calendario: cal.id, nave: cal.nave, nombre: `${cal.nombre} (prueba)`, prog,
    duracion_min: cal.duracion_min, volumen_litros: cal.volumen_litros, minutos_aviso: cal.minutos_aviso,
    estado: 'PENDIENTE', origen: 'PRUEBA', avisado: false, hora_notificada: false, realizado_en: null, observacion: null,
  });
  S.guardar();
  motor.avisarRiegos(new Date());
  res.status(201).json({ prog });
});

app.get('/api/riegos', (req, res) => {
  res.json([...S.db.riegos].sort((a, b) => b.prog.localeCompare(a.prog)).slice(0, 60));
});

const cerrar = estado => (req, res) => {
  const r = S.db.riegos.find(x => x.id === +req.params.id);
  if (!r) return res.sendStatus(404);
  r.estado = estado;
  r.realizado_en = new Date().toISOString();
  r.observacion = req.body?.observacion || null;
  S.guardar();
  res.json(r);
};
app.post('/api/riegos/:id/realizar', cerrar('REALIZADO'));
app.post('/api/riegos/:id/omitir', cerrar('OMITIDO'));

app.get('/api/notificaciones', (req, res) => res.json([...S.db.notificaciones].reverse().slice(0, 50)));

app.post('/api/notificaciones/leer-todas', (req, res) => {
  S.db.notificaciones.forEach(n => { n.leida = true; });
  S.guardar();
  res.sendStatus(204);
});

app.post('/api/notificaciones/:id/leer', (req, res) => {
  const n = S.db.notificaciones.find(x => x.id === +req.params.id);
  if (n) { n.leida = true; S.guardar(); }
  res.sendStatus(204);
});

app.get('/api/eventos', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 3000\n\n');
  const enviar = n => res.write(`data: ${JSON.stringify(n)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  S.bus.on('notificacion', enviar);
  req.on('close', () => { clearInterval(ping); S.bus.off('notificacion', enviar); });
});

app.get('/api/config', (req, res) => res.json(S.db.config));

app.put('/api/config', (req, res) => {
  const f = Number(req.body.frecuencia_min);
  if (![5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].includes(f)) return res.status(400).json({ errores: ['Frecuencia no permitida'] });
  S.db.config.frecuencia_min = f;
  S.guardar();
  res.json(S.db.config);
});

app.get('/api/historial', (req, res) => {
  const horas = Math.min(Number(req.query.horas) || 24, 720);
  const desde = Date.now() - horas * 3600000;
  res.json(S.db.historial.filter(h => new Date(h.fecha) >= desde && (!req.query.nave || h.nave === req.query.nave)).reverse());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OrquiClima en http://localhost:${PORT}  ·  sensores: ${sensores.SENSOR_URL || 'simulador local'}`);
  motor.iniciar();
});
