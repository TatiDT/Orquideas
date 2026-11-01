const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const FILE = path.join(__dirname, '..', 'data', 'db.json');
const bus = new EventEmitter();

const pad = n => String(n).padStart(2, '0');
const fechaLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoy = () => fechaLocal(new Date());

// Naves y parámetros óptimos (reflejan nave / cultivo / parametro_optimo de sql.sql)
const NAVES = [
  { codigo: 'A', orden: 1, nombre: 'Nave A', especies: 'Phalaenopsis (Orquídea Mariposa)', plantas: 1420 },
  { codigo: 'B', orden: 2, nombre: 'Nave B', especies: 'Cattleya Trianae & Dendrobium Nobile', plantas: 860 },
  { codigo: 'C', orden: 3, nombre: 'Nave C', especies: 'Vanda Coerulea & Oncidium', plantas: 410 },
];
const PARAMETROS = { hr_meta: 80, hr_tolerancia: 5, temp_min: 18, temp_max: 24 };

function inicial() {
  const cal = (id, nave, nombre, dias, hora, dur, vol) => ({
    id, nave, nombre, dias, hora, duracion_min: dur, volumen_litros: vol,
    minutos_aviso: 15, fecha_inicio: hoy(), fecha_fin: null, activo: true,
  });
  return {
    seq: { calendario: 3, riego: 0, notificacion: 0, alerta: 0 },
    config: { frecuencia_min: 60 },
    calendarios: [
      cal(1, 'A', 'Riego Phalaenopsis', ['LUN', 'JUE'], '08:30', 10, 120),
      cal(2, 'B', 'Riego Cattleya/Dendro', ['MAR', 'VIE'], '09:00', 12, 90),
      cal(3, 'C', 'Riego Vanda/Oncidium', ['LUN', 'MIE', 'VIE'], '07:30', 8, 60),
    ],
    riegos: [], notificaciones: [], alertas: [], historial: [],
  };
}

let db;
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { db = inicial(); }

let timer = null;
function guardar() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db));
  }, 300);
}
const nextId = tipo => { db.seq[tipo] = (db.seq[tipo] || 0) + 1; return db.seq[tipo]; };

function notificar({ origen, titulo, mensaje, severidad = 'INFO', nave = null, id_riego = null }) {
  const n = { id: nextId('notificacion'), origen, titulo, mensaje, severidad, nave, id_riego,
              creada: new Date().toISOString(), leida: false };
  db.notificaciones.push(n);
  if (db.notificaciones.length > 500) db.notificaciones.splice(0, db.notificaciones.length - 500);
  guardar();
  bus.emit('notificacion', n);
  return n;
}

module.exports = {
  get db() { return db; },
  bus, guardar, nextId, notificar, hoy, fechaLocal, pad, NAVES, PARAMETROS,
};
