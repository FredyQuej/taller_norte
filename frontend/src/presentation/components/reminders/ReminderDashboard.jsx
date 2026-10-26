import { useEffect, useMemo, useState } from "react";
import { BellRing, CircleAlert, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { reminderService } from "../../../application/services/reminderService";
import { getMaintenanceSchedule } from "../../../application/services/maintenanceSchedule";

const channelLabels = {
  ENVIADO: "Enviado",
  ERROR: "Error",
  PENDIENTE: "Pendiente",
  NO_CONFIGURADO: "Canal sin configurar",
  SIN_CONTACTO: "Sin contacto",
};

function scheduleFor(reminder) {
  return getMaintenanceSchedule(reminder.fecha_proximo_servicio);
}

function ChannelStatus({ state, icon: Icon }) {
  return <span className={`reminder-channel ${String(state || "").toLowerCase()}`}><Icon size={14} />{channelLabels[state] || state || "Sin estado"}</span>;
}

export function ReminderDashboard({ token }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReminders() {
    setLoading(true);
    try {
      setItems(await reminderService.list(token));
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReminders(); }, [token]);

  const upcoming = items.filter((item) => scheduleFor(item).status === "UPCOMING").length;
  const overdue = items.filter((item) => scheduleFor(item).status === "OVERDUE").length;
  const visible = useMemo(() => items.filter((item) => {
    const term = `${item.orden_id} ${item.placa} ${item.propietario} ${item.servicio}`.toLowerCase();
    const matchesSearch = term.includes(search.toLowerCase());
    const status = scheduleFor(item).status;
    const matchesFilter = filter === "ALL" || status === filter;
    return matchesSearch && matchesFilter;
  }), [items, search, filter]);

  return <section className="content reminder-dashboard">
    <div className="section-toolbar">
      <div><p className="muted">Avisos automáticos por correo y WhatsApp</p><h2>Recordatorios de servicio</h2></div>
      <button className="button secondary" onClick={loadReminders} disabled={loading} title="Actualizar recordatorios"><RefreshCw size={16} /> Actualizar</button>
    </div>
    <div className="reminder-summary">
      <button type="button" className={`reminder-summary-card soon ${filter === "UPCOMING" ? "selected" : ""}`} onClick={() => setFilter(filter === "UPCOMING" ? "ALL" : "UPCOMING")} aria-pressed={filter === "UPCOMING"}>
        <BellRing size={20} /><span>Próximos 7 días</span><strong>{upcoming}</strong>
      </button>
      <button type="button" className={`reminder-summary-card late ${filter === "OVERDUE" ? "selected" : ""}`} onClick={() => setFilter(filter === "OVERDUE" ? "ALL" : "OVERDUE")} aria-pressed={filter === "OVERDUE"}>
        <CircleAlert size={20} /><span>Vencidos</span><strong>{overdue}</strong>
      </button>
    </div>
    <div className="list-toolbar reminder-filters">
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar orden, placa, propietario o servicio" />
      <label>Mostrar<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Todos</option><option value="UPCOMING">Próximos</option><option value="OVERDUE">Vencidos</option></select></label>
      <span className="result-count">{visible.length} recordatorios</span>
    </div>
    {error && <div className="alert error">{error}</div>}
    {loading ? <div className="empty"><p>Cargando recordatorios...</p></div> : visible.length === 0 ? <div className="empty"><div className="empty-icon"><BellRing size={24} /></div><h3>Sin recordatorios en este filtro</h3><p>Se mostrarán aquí las órdenes programadas para los próximos siete días y las vencidas.</p></div> : <div className="table-wrap"><table><thead><tr><th>Orden</th><th>Vehículo</th><th>Propietario</th><th>Servicio</th><th>Fecha estimada</th><th>Seguimiento</th><th><Mail size={14} /> Correo</th><th><MessageCircle size={14} /> WhatsApp</th></tr></thead><tbody>{visible.map((item) => {
      const schedule = scheduleFor(item);
      return <tr key={`${item.orden_id}-${item.fecha_proximo_servicio}`}>
        <td><strong>OS-{String(item.orden_id).padStart(4, "0")}</strong><small>{item.orden_estado}</small></td>
        <td>{item.marca} {item.modelo}<small>{item.placa}</small></td>
        <td>{item.propietario}<small>{item.correo || item.telefono || "Sin contacto"}</small></td>
        <td>{item.servicio}<small>{Number(item.kilometraje || 0).toLocaleString("es-GT")} km</small></td>
        <td>{String(item.fecha_proximo_servicio).slice(0, 10)}</td>
        <td><span className={`schedule-badge ${schedule.status === "OVERDUE" ? "overdue" : "upcoming"}`}>{schedule.status === "OVERDUE" ? `Vencido hace ${Math.abs(schedule.daysRemaining)} días` : schedule.daysRemaining === 0 ? "Vence hoy" : `En ${schedule.daysRemaining} días`}</span></td>
        <td><ChannelStatus state={item.email_estado} icon={Mail} />{item.email_error && <small className="reminder-error" title={item.email_error}>{item.email_error}</small>}</td>
        <td><ChannelStatus state={item.whatsapp_estado} icon={MessageCircle} />{item.whatsapp_error && <small className="reminder-error" title={item.whatsapp_error}>{item.whatsapp_error}</small>}</td>
      </tr>;
    })}</tbody></table></div>}
    <p className="reminder-footnote">El servicio revisa órdenes cada día a las 09:00, hora de Guatemala. Se notifica una vez por orden, canal y fecha estimada.</p>
  </section>;
}
