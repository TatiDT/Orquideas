const S = require('./store');
const sensores = require('./sensores');

const DIAS = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
const COOLDOWN_ALERTA_MS = 30 * 60 * 1000;
const aDate = prog => new Date(prog + ':00');
const progDe = (fecha, hora) => `${fecha}T${hora}`;

function aplicaEn(cal, fecha, dia) {
  return cal.activo && cal.dias.includes(dia) && fecha >= cal.fecha_inicio && (!cal.fecha_fin || fecha <= cal.fecha_fin);
}

function generarRiegosDeHoy(ahora) {
  const fecha = S.fechaLocal(ahora);
  const dia = DIAS[ahora.getDay()];
  for (const cal of S.db.calendarios) {
    if (!aplicaEn(cal, fecha, dia)) continue;
    const prog = progDe(fecha, cal.hora);
    if (S.db.riegos.some(r => r.id_calendario === cal.id && r.prog === prog)) continue;
    if (ahora - aDate(prog) > 2 * 60 * 1000) continue;
    S.db.riegos.push({
      id: S.nextId('riego'), id_calendario: cal.id, nave: cal.nave, nombre: cal.nombre, prog,
      duracion_min: cal.duracion_min, volumen_litros: cal.volumen_litros, minutos_aviso: cal.minutos_aviso,
      estado: 'PENDIENTE', origen: 'CALENDARIO', avisado: false, hora_notificada: false,
      realizado_en: null, observacion: null,
    });
    S.guardar();
  }
}

function avisarRiegos(ahora) {
  for (const r of S.db.riegos) {
    if (r.estado !== 'PENDIENTE' && r.estado !== 'NOTIFICADO') continue;
    const falta = Math.ceil((aDate(r.prog) - ahora) / 60000);
    if (!r.avisado && falta > 0 && falta <= r.minutos_aviso) {
      r.avisado = true; r.estado = 'NOTIFICADO';
      S.notificar({
        origen: 'RIEGO', severidad: 'INFO', nave: r.nave, id_riego: r.id,
        titulo: `Riego en ${falta} min · Nave ${r.nave}`,
        mensaje: `${r.nombre} programado a las ${r.prog.slice(11)} (${r.duracion_min} min).`,
      });
      S.guardar();
    }
    if (!r.hora_notificada && falta <= 0) {
      r.avisado = true; r.hora_notificada = true; r.estado = 'NOTIFICADO';
      S.notificar({
        origen: 'RIEGO', severidad: 'ADVERTENCIA', nave: r.nave, id_riego: r.id,
        titulo: `Es hora de regar · Nave ${r.nave}`,
        mensaje: `${r.nombre}: ${r.duracion_min} min${r.volumen_litros ? `, ${r.volumen_litros} L` : ''}. Confirma cuando esté hecho.`,
      });
      S.guardar();
    }
  }
}

function evaluarAlertas(lecturas, ahora) {
  const P = S.PARAMETROS;
  const lo = P.hr_meta - P.hr_tolerancia, hi = P.hr_meta + P.hr_tolerancia;
  for (const l of lecturas) {
    const condiciones = [
      ['HUMEDAD_BAJA', l.humedad < lo, 'CRITICA', 'Humedad baja', `${l.humedad}% bajo el rango (${lo}–${hi}%). Se recomienda regar o nebulizar.`],
      ['HUMEDAD_ALTA', l.humedad > hi, 'ADVERTENCIA', 'Humedad alta', `${l.humedad}% sobre el rango (${lo}–${hi}%). Revisar ventilación.`],
      ['TEMP_ALTA', l.temperatura > P.temp_max, 'CRITICA', 'Temperatura alta', `${l.temperatura}°C sobre ${P.temp_max}°C.`],
      ['TEMP_BAJA', l.temperatura < P.temp_min, 'CRITICA', 'Temperatura baja', `${l.temperatura}°C bajo ${P.temp_min}°C.`],
    ];
    for (const [tipo, activa, sev, titulo, msg] of condiciones) {
      const abierta = S.db.alertas.find(a => a.nave === l.nave && a.tipo === tipo && !a.resuelta);
      if (activa && !abierta) {
        const reciente = S.db.alertas.some(a => a.nave === l.nave && a.tipo === tipo && ahora - new Date(a.fecha) < COOLDOWN_ALERTA_MS);
        S.db.alertas.push({
          id: S.nextId('alerta'), nave: l.nave, tipo, severidad: sev, mensaje: msg,
          valor: tipo.startsWith('HUM') ? l.humedad : l.temperatura, fecha: ahora.toISOString(), resuelta: false,
        });
        if (!reciente) S.notificar({ origen: 'ALERTA', severidad: sev, nave: l.nave, titulo: `${titulo} · Nave ${l.nave}`, mensaje: msg });
        S.guardar();
      } else if (!activa && abierta) {
        abierta.resuelta = true; abierta.resuelta_en = ahora.toISOString();
        S.guardar();
      }
    }
  }
  if (S.db.alertas.length > 500) S.db.alertas.splice(0, S.db.alertas.length - 500);
}

let ultimoRegistro = 0;
function registrarHistorial(lecturas, ahora) {
  if (ahora - ultimoRegistro < S.db.config.frecuencia_min * 60000) return;
  ultimoRegistro = ahora.getTime();
  for (const l of lecturas) {
    S.db.historial.push({ fecha: ahora.toISOString(), nave: l.nave, hr: l.humedad, temp: l.temperatura, dpv: l.dpv, rocio: l.rocio });
  }
  if (S.db.historial.length > 20000) S.db.historial.splice(0, S.db.historial.length - 20000);
  S.guardar();
}

async function ciclo() {
  const ahora = new Date();
  generarRiegosDeHoy(ahora);
  avisarRiegos(ahora);
  const r = await sensores.leer();
  // Sin sensores reales (todo en 0) no se generan alertas ni historial.
  if (!r.error && r.fuente === 'externo' && r.lecturas.length) { evaluarAlertas(r.lecturas, ahora); registrarHistorial(r.lecturas, ahora); }
}

function iniciar() {
  ciclo();
  setInterval(ciclo, (Number(process.env.SENSOR_POLL_SEC) || 10) * 1000);
}

module.exports = { iniciar, generarRiegosDeHoy, avisarRiegos, DIAS, progDe };
