const { NAVES } = require('./store');

const SENSOR_URL = process.env.SENSOR_URL || '';
const base = { A: [86.4, 21.0], B: [67.9, 19.0], C: [85.5, 21.0] };
const estado = {};
let ultimo = { fuente: SENSOR_URL ? 'externo' : 'sin_datos', error: null, actualizado: null, lecturas: [] };

const r1 = n => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const dpv = (t, hr) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3)) * (1 - hr / 100);
function rocio(t, hr) {
  if (!(hr > 0)) return 0;
  const g = Math.log(hr / 100) + (17.27 * t) / (t + 237.3);
  return (237.3 * g) / (17.27 - g);
}

// Sin sensores conectados: sin simulación, todas las lecturas en 0.
function sinDatos() {
  return NAVES.map(n => ({ nave: n.codigo, humedad: 0, temperatura: 0 }));
}

function normalizar(payload) {
  const lista = Array.isArray(payload) ? payload
    : payload.naves || payload.data || payload.lecturas || payload.sensores || [];
  return lista.map(it => {
    let cod = String(it.nave ?? it.codigo ?? it.id_nave ?? it.id ?? '').trim().toUpperCase().slice(-1);
    if (/[1-3]/.test(cod)) cod = 'ABC'[Number(cod) - 1];
    return {
      nave: cod,
      humedad: Number(it.humedad ?? it.humedad_relativa ?? it.hr ?? it.humidity),
      temperatura: Number(it.temperatura ?? it.temp ?? it.temperature),
    };
  }).filter(l => NAVES.some(n => n.codigo === l.nave) && isFinite(l.humedad) && isFinite(l.temperatura)
                 && l.humedad > 0 && l.humedad <= 100);
}

async function leer() {
  try {
    let crudas;
    if (SENSOR_URL) {
      const res = await fetch(SENSOR_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      crudas = normalizar(await res.json());
      if (!crudas.length) throw new Error('Respuesta sin lecturas reconocibles');
    } else {
      crudas = sinDatos();
    }
    ultimo = {
      fuente: SENSOR_URL ? 'externo' : 'sin_datos', error: null, actualizado: new Date().toISOString(),
      lecturas: crudas.map(l => ({
        ...l, dpv: Math.round(dpv(l.temperatura, l.humedad) * 100) / 100, rocio: r1(rocio(l.temperatura, l.humedad)),
      })),
    };
  } catch (e) {
    ultimo = { ...ultimo, error: e.message };
  }
  return ultimo;
}

module.exports = { leer, ultimo: () => ultimo, SENSOR_URL };
