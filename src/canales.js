const S = require('./store');

const env = k => (process.env[k] || '').trim();
const texto = n => `${n.titulo}\n${n.mensaje}`;

let transporte = null;
function correoActivo() { return !!(env('SMTP_USER') && env('SMTP_PASS') && env('NOTIF_EMAIL_TO')); }
function wspActivo() {
  const p = env('WSP_PROVIDER');
  if (p === 'callmebot') return !!(env('WSP_TO') && env('WSP_APIKEY'));
  if (p === 'cloud') return !!(env('WSP_TO') && env('WSP_TOKEN') && env('WSP_PHONE_ID'));
  return false;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SEVERIDAD = {
  INFO: { color: '#7e22ce', fondo: '#f3e8ff', etiqueta: 'Información' },
  ADVERTENCIA: { color: '#b45309', fondo: '#fef3c7', etiqueta: 'Advertencia' },
  CRITICA: { color: '#be123c', fondo: '#ffe4e6', etiqueta: 'Alerta crítica' },
};

function htmlCorreo(n) {
  const sev = SEVERIDAD[n.severidad] || SEVERIDAD.INFO;
  const emoji = n.origen === 'ALERTA' ? '⚠️' : '💧';
  const fecha = new Date().toLocaleString('es-CL', { dateStyle: 'full', timeStyle: 'short' });
  const nave = n.nave ? `<span style="display:inline-block;background:#f3f1f6;color:#4b4560;font-size:12px;font-weight:700;padding:4px 10px;border-radius:8px;margin-left:6px;">Nave ${esc(n.nave)}</span>` : '';
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f7f5fb;font-family:'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5fb;padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #ece6f5;">
    <tr><td style="background:#14102a;background-image:linear-gradient(135deg,#7e22ce,#c026d3);padding:26px 30px;">
      <div style="font-size:13px;color:#f5d0fe;letter-spacing:.08em;font-weight:700;">✿ ORQUICLIMA PRO</div>
      <div style="font-size:22px;color:#ffffff;font-weight:800;margin-top:6px;">Control Microclimático de Invernadero</div>
    </td></tr>
    <tr><td style="padding:28px 30px 8px;">
      <span style="display:inline-block;background:${sev.fondo};color:${sev.color};font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;">${emoji} ${sev.etiqueta}</span>${nave}
      <h1 style="margin:16px 0 8px;font-size:21px;line-height:1.3;color:#1e1233;">${esc(n.titulo)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#4b4560;">${esc(n.mensaje)}</p>
    </td></tr>
    <tr><td style="padding:18px 30px 6px;">
      <div style="background:#fdf4ff;border:1px solid #f5c2f0;border-radius:14px;padding:14px 16px;font-size:13px;line-height:1.5;color:#4b4560;">
        Compruebe que el velamen radicular esté en tono gris plateado antes de iniciar el riego, y drene completamente las macetas al terminar.
      </div>
    </td></tr>
    <tr><td style="padding:22px 30px 28px;font-size:12px;color:#9b93ad;border-top:1px solid #f0ebf7;margin-top:18px;">
      ${esc(fecha)}<br>Este aviso fue generado automáticamente por OrquiClima PRO.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

async function enviarCorreo(n) {
  if (!correoActivo()) return;
  if (!transporte) {
    transporte = require('nodemailer').createTransport({
      host: env('SMTP_HOST') || 'smtp.gmail.com',
      port: Number(env('SMTP_PORT')) || 465,
      secure: (Number(env('SMTP_PORT')) || 465) === 465,
      auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
    });
  }
  await transporte.sendMail({
    from: `OrquiClima <${env('SMTP_USER')}>`,
    to: env('NOTIF_EMAIL_TO'),
    subject: `[OrquiClima] ${n.titulo}`,
    text: n.mensaje,
    html: htmlCorreo(n),
  });
}

async function enviarWhatsapp(n) {
  if (!wspActivo()) return;
  if (env('WSP_PROVIDER') === 'callmebot') {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(env('WSP_TO'))}&text=${encodeURIComponent(texto(n))}&apikey=${encodeURIComponent(env('WSP_APIKEY'))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`CallMeBot HTTP ${res.status}`);
    return;
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${env('WSP_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('WSP_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: env('WSP_TO'), type: 'text', text: { body: texto(n) } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`WhatsApp Cloud HTTP ${res.status}`);
}

async function enviar(n) {
  const tareas = [['correo', enviarCorreo], ['whatsapp', enviarWhatsapp]];
  for (const [nombre, fn] of tareas) {
    try { await fn(n); } catch (e) { console.error(`[canales] ${nombre}: ${e.message}`); }
  }
}

function estado() { return { correo: correoActivo(), whatsapp: wspActivo() }; }

function iniciar() {
  S.bus.on('notificacion', n => { if (correoActivo() || wspActivo()) enviar(n); });
}

module.exports = { iniciar, enviar, estado };
