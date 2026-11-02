const { NAVES } = require('./store');

const SENSOR_URL = process.env.SENSOR_URL || '';
const base = { A: [86.4, 21.0], B: [67.9, 19.0], C: [85.5, 21.0] };
const estado = {};
let ultimo = { fuente: SENSOR_URL ? 'externo' : 'simulador', error: null, actualizado: null, lecturas: [] };

const r1 = n => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const dpv = (t, hr) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3)) * (1 - hr / 100);
function rocio(t, hr) {
  const g = Math.log(hr / 100) + (17.27 * t) / (t + 237.3);
  return (237.3 * g) / (17.27 - g);
}

function simular() {
  return NAVES.map(n => {
    const [hr0, t0] = base[n.codigo];
    const s = estado[n.codigo] || (estado[n.codigo] = { hr: hr0, t: t0 });
    s.hr = clamp(s.hr + (Math.random() - 0.5) * 1.2 + (hr0 - s.hr) * 0.05, 40, 99);
    s.t = clamp(s.t + (Math.random() - 0.5) * 0.4 + (t0 - s.t) * 0.05, 10, 35);
    return { nave: n.codigo, humedad: r1(s.hr), temperatura: r1(s.t) };
  });
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
      crudas = simular();
    }
    ultimo = {
      fuente: SENSOR_URL ? 'externo' : 'simulador', error: null, actualizado: new Date().toISOString(),
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
