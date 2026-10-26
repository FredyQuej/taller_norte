import cron from "node-cron";
import nodemailer from "nodemailer";

const TIME_ZONE = "America/Guatemala";
const LOCK_KEY = "service-reminders-daily";

export function localDateInTimeZone(date = new Date(), timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isReminderEligible(nextServiceDate, today) {
  if (!nextServiceDate || !today) return false;
  const due = String(nextServiceDate).slice(0, 10);
  return due >= today && due <= addDays(today, 7);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function emailConfigured(env) {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

function whatsappConfigured(env) {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM && env.TWILIO_WHATSAPP_CONTENT_SID);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-GT", { dateStyle: "long", timeZone: TIME_ZONE }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`));
}

async function sendEmail(order, env) {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: String(env.SMTP_SECURE).toLowerCase() === "true",
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS || "" } } : {}),
  });
  const date = formatDate(order.fecha_proximo_servicio);
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: order.correo,
    subject: `Recordatorio de servicio ${order.placa} - Taller Norte`,
    text: `Hola ${order.nombre_propietario || ""}, te recordamos que el servicio ${order.servicio} de tu vehículo ${order.placa} está programado para el ${date}. Kilometraje registrado: ${Number(order.kilometraje || 0).toLocaleString("es-GT")} km.`,
  });
}

async function sendWhatsApp(order, env) {
  const from = env.TWILIO_WHATSAPP_FROM.startsWith("whatsapp:") ? env.TWILIO_WHATSAPP_FROM : `whatsapp:${env.TWILIO_WHATSAPP_FROM}`;
  const to = order.telefono.startsWith("whatsapp:") ? order.telefono : `whatsapp:${order.telefono}`;
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const body = new URLSearchParams({
    From: from,
    To: to,
    ContentSid: env.TWILIO_WHATSAPP_CONTENT_SID,
    ContentVariables: JSON.stringify({
      1: `OS-${String(order.id).padStart(4, "0")}`,
      2: order.nombre_propietario || "Cliente",
      3: order.servicio,
      4: formatDate(order.fecha_proximo_servicio),
      5: order.placa,
      6: `${Number(order.kilometraje || 0).toLocaleString("es-GT")} km`,
    }),
  });
  const credentials = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Twilio respondió ${response.status}: ${responseText.slice(0, 300)}`);
  }
}

async function claimReminder(db, order, channel) {
  const result = await db.query(
    `INSERT INTO recordatorios_servicio(orden_servicio_id, canal, fecha_proximo_servicio, estado, intentos, ultimo_intento_en)
     VALUES($1, $2, $3, 'PENDIENTE', 1, NOW())
     ON CONFLICT(orden_servicio_id, canal, fecha_proximo_servicio)
     DO UPDATE SET estado = 'PENDIENTE', intentos = recordatorios_servicio.intentos + 1,
                   ultimo_intento_en = NOW(), error = NULL, actualizado_en = NOW()
     WHERE recordatorios_servicio.estado <> 'ENVIADO'
     RETURNING id`,
    [order.id, channel, String(order.fecha_proximo_servicio).slice(0, 10)],
  );
  return result.rowCount > 0;
}

async function deliverChannel(db, order, channel, sender, logger) {
  if (!await claimReminder(db, order, channel)) return false;
  try {
    await sender(order);
    await db.query(
      `UPDATE recordatorios_servicio SET estado = 'ENVIADO', enviado_en = NOW(), error = NULL, actualizado_en = NOW() WHERE orden_servicio_id = $1 AND canal = $2 AND fecha_proximo_servicio = $3`,
      [order.id, channel, String(order.fecha_proximo_servicio).slice(0, 10)],
    );
    logger.info(`[service-reminders] ${channel} enviado para orden ${order.id}`);
    return true;
  } catch (error) {
    await db.query(
      `UPDATE recordatorios_servicio SET estado = 'ERROR', error = $4, actualizado_en = NOW() WHERE orden_servicio_id = $1 AND canal = $2 AND fecha_proximo_servicio = $3`,
      [order.id, channel, String(order.fecha_proximo_servicio).slice(0, 10), String(error.message).slice(0, 1000)],
    );
    logger.error(`[service-reminders] Falló ${channel} para orden ${order.id}: ${error.message}`);
    return false;
  }
}

export async function processServiceReminders(pool, { now = new Date(), env = process.env, logger = console } = {}) {
  const db = await pool.connect();
  let lockHeld = false;

  try {
    const lock = await db.query("SELECT pg_try_advisory_lock(hashtext($1)) locked", [LOCK_KEY]);
    if (!lock.rows[0]?.locked) return { skipped: true, candidates: 0, sent: 0 };
    lockHeld = true;
    const today = localDateInTimeZone(now);
    const result = await db.query(
      `SELECT os.id, os.fecha_proximo_servicio, os.kilometraje, os.estado,
              svc.nombre servicio, v.placa, p.nombre nombre_propietario,
              p.correo, p.telefono
       FROM ordenes_servicio os
       JOIN vehiculos v ON v.id = os.vehiculo_id
       JOIN propietarios p ON p.id = v.propietario_id
       JOIN servicios svc ON svc.id = os.servicio_id
       WHERE os.fecha_proximo_servicio BETWEEN $1::date AND ($1::date + 7)
         AND os.estado <> 'CANCELADO'
         AND (NULLIF(TRIM(p.correo), '') IS NOT NULL OR NULLIF(TRIM(p.telefono), '') IS NOT NULL)
       ORDER BY os.fecha_proximo_servicio, os.id`,
      [today],
    );
    let sent = 0;
    if (!emailConfigured(env) && !whatsappConfigured(env)) logger.warn("[service-reminders] SMTP y Twilio no configurados; los recordatorios se omitirán.");

    for (const order of result.rows) {
      if (order.correo && emailConfigured(env)) {
        if (await deliverChannel(db, order, "EMAIL", (row) => sendEmail(row, env), logger)) sent += 1;
      }
      if (order.telefono && whatsappConfigured(env)) {
        if (await deliverChannel(db, order, "WHATSAPP", (row) => sendWhatsApp(row, env), logger)) sent += 1;
      }
    }
    return { skipped: false, candidates: result.rowCount, sent };
  } finally {
    try {
      if (lockHeld) await db.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY]);
    } finally {
      db.release();
    }
  }
}

export function startServiceReminderScheduler(pool, { env = process.env, logger = console } = {}) {
  if (String(env.SERVICE_REMINDERS_ENABLED).toLowerCase() === "false") {
    logger.info("[service-reminders] Scheduler deshabilitado por configuración.");
    return null;
  }
  const schedule = env.SERVICE_REMINDERS_CRON || "0 9 * * *";
  const task = cron.schedule(schedule, () => {
    processServiceReminders(pool, { env, logger }).catch((error) => logger.error(`[service-reminders] Error del ciclo: ${error.message}`));
  }, { timezone: TIME_ZONE });
  processServiceReminders(pool, { env, logger }).catch((error) => logger.error(`[service-reminders] Error del ciclo inicial: ${error.message}`));
  logger.info(`[service-reminders] Scheduler activo: ${schedule} (${TIME_ZONE}).`);
  return task;
}
