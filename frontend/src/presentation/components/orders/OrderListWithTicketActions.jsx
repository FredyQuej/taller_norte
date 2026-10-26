import { CalendarClock, CircleAlert, Download, Eye, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { orderService } from "../../../application/services/orderService";
import { getMaintenanceSchedule } from "../../../application/services/maintenanceSchedule";
import { hasPermission, PermissionAlert, showUnauthorized } from "../common/Permissions";

function getSession() {
  try { return JSON.parse(localStorage.getItem("taller_session") || "null"); } catch { return null; }
}

function runAction(module, action, callback, setMessage) {
  const session = getSession();
  if (!hasPermission(session?.usuario?.permisos, module, action, session?.usuario?.rol)) {
    showUnauthorized(setMessage);
    return false;
  }
  callback?.();
  return true;
}

const orderStatusTransitions = {
  PENDIENTE: ["EN_PROCESO", "CANCELADO"],
  EN_PROCESO: ["COMPLETADO", "CANCELADO"],
  COMPLETADO: [],
  CANCELADO: [],
};
const orderStatusLabels = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  COMPLETADO: "Completada",
  CANCELADO: "Cancelada",
};

export function OrderListWithTicketActions({ orders, vehicles, filters, onFiltersChange, onAdd, onDetail, onEdit, readOnly = false }) {
  const [message, setMessage] = useState("");
  const session = getSession();
  const [scheduleFilter, setScheduleFilter] = useState("ALL");
  const scheduleFor = (order) => order.estado === "CANCELADO"
    ? { status: "UNSCHEDULED", daysRemaining: null }
    : getMaintenanceSchedule(order.fecha_proximo_servicio);
  const upcomingCount = orders.filter((order) => scheduleFor(order).status === "UPCOMING").length;
  const overdueCount = orders.filter((order) => scheduleFor(order).status === "OVERDUE").length;
  const filtered = orders.filter((order) =>
    (filters.estado === "TODOS" || order.estado === filters.estado) &&
    (filters.vehiculo === "TODOS" || String(order.vehiculo_id) === filters.vehiculo) &&
    (scheduleFilter === "ALL" || scheduleFor(order).status === scheduleFilter)
  );

  function openTicket(order, action = "view") {
    runAction("ordenes", "consultar", () => {
      const params = new URLSearchParams({ ticket: String(order.id) });
      if (action !== "view") params.set("action", action);
      if (action === "print") params.set("paper", "80");
      window.open(`${window.location.origin}/?${params.toString()}`, "_blank", "noopener,noreferrer");
    }, setMessage);
  }

  async function remove(order) {
    if (!runAction("ordenes", "eliminar", null, setMessage)) return;
    if (!window.confirm(`¿Eliminar la orden OS-${String(order.id).padStart(4, "0")}?`)) return;
    try {
      await orderService.delete(session.token, order.id);
      window.location.reload();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function changeStatus(order, nextStatus) {
    if (!runAction("ordenes", "editar", null, setMessage)) return;
    if (!orderStatusTransitions[order.estado]?.includes(nextStatus)) {
      setMessage("Esta transición de estado no está permitida.");
      return;
    }
    if (["COMPLETADO", "CANCELADO"].includes(nextStatus) && !window.confirm(`¿Cambiar la orden a ${orderStatusLabels[nextStatus].toLowerCase()}?`)) return;
    try {
      await orderService.updateStatus(session.token, order.id, nextStatus);
      window.location.reload();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return <section className="content">
    <PermissionAlert message={message} />
    <div className="section-toolbar">
      <h2>{readOnly ? "Mis servicios" : "Órdenes de servicio"}</h2>
      {!readOnly && <button className="button primary" onClick={() => runAction("ordenes", "crear", onAdd, setMessage)}><Plus size={17} /> Nueva orden</button>}
    </div>
    <div className="schedule-summary">
      <button type="button" className={`schedule-card upcoming ${scheduleFilter === "UPCOMING" ? "selected" : ""}`} aria-pressed={scheduleFilter === "UPCOMING"} onClick={() => setScheduleFilter(scheduleFilter === "UPCOMING" ? "ALL" : "UPCOMING")}>
        <CalendarClock size={20} /><span>Próximos 30 días</span><strong>{upcomingCount}</strong>
      </button>
      <button type="button" className={`schedule-card overdue ${scheduleFilter === "OVERDUE" ? "selected" : ""}`} aria-pressed={scheduleFilter === "OVERDUE"} onClick={() => setScheduleFilter(scheduleFilter === "OVERDUE" ? "ALL" : "OVERDUE")}>
        <CircleAlert size={20} /><span>Servicios vencidos</span><strong>{overdueCount}</strong>
      </button>
    </div>
    <div className="list-toolbar">
      <label>Estado<select value={filters.estado} onChange={(event) => onFiltersChange({ ...filters, estado: event.target.value })}>
        <option value="TODOS">Todos</option>
        {["PENDIENTE", "EN_PROCESO", "COMPLETADO", "CANCELADO"].map((state) => <option key={state}>{state}</option>)}
      </select></label>
      {!readOnly && <label>Vehículo<select value={filters.vehiculo} onChange={(event) => onFiltersChange({ ...filters, vehiculo: event.target.value })}>
        <option value="TODOS">Todos</option>
        {vehicles.map((vehicle) => <option key={vehicle.id} value={String(vehicle.id)}>{vehicle.placa}</option>)}
      </select></label>}
    </div>
    <div className="table-wrap"><table>
      <thead><tr><th>Orden</th><th>Vehículo</th><th>Servicio</th><th>Ingreso</th><th>Kilometraje</th><th>Próximo servicio</th><th>Seguimiento</th><th>Estado</th><th>Costo</th><th>Acciones</th></tr></thead>
      <tbody>{filtered.map((order) => <tr key={order.id}>
        <td>OS-{String(order.id).padStart(4, "0")}</td>
        <td>{order.marca} {order.modelo} · {order.placa}</td>
        <td>{order.servicio}</td>
        <td>{String(order.fecha_ingreso).slice(0, 10)}</td>
          <td>{Number(order.kilometraje || 0).toLocaleString("es-GT")} km</td>
          <td>{order.fecha_proximo_servicio ? String(order.fecha_proximo_servicio).slice(0, 10) : "No estimada"}</td>
          <td>{scheduleFor(order).status === "OVERDUE" ? <span className="schedule-badge overdue">Vencido</span> : scheduleFor(order).status === "UPCOMING" ? <span className="schedule-badge upcoming">Próximo en {scheduleFor(order).daysRemaining === 0 ? "hoy" : `${scheduleFor(order).daysRemaining} días`}</span> : order.fecha_proximo_servicio ? <span className="schedule-badge planned">Programado</span> : <span className="schedule-badge unscheduled">Sin fecha</span>}</td>
        <td><label className={`order-status-control state-${order.estado.toLowerCase()}`}><span className="sr-only">Estado de orden OS-{String(order.id).padStart(4, "0")}</span><select value={order.estado} disabled={readOnly || orderStatusTransitions[order.estado]?.length === 0} onChange={(event) => changeStatus(order, event.target.value)}>{[order.estado, ...(orderStatusTransitions[order.estado] || [])].map((status) => <option key={status} value={status}>{orderStatusLabels[status]}</option>)}</select></label></td>
        <td>Q {Number(order.costo || 0).toFixed(2)}</td>
        <td><div className="order-actions">
          <button className="button secondary" onClick={() => runAction("ordenes", "consultar", () => onDetail(order), setMessage)} title="Ver detalle" aria-label="Ver detalle"><Eye size={15} /></button>
          <button className="button secondary" onClick={() => openTicket(order, "print")} title="Imprimir ticket" aria-label="Imprimir ticket"><Printer size={15} /></button>
          <button className="button secondary" onClick={() => openTicket(order, "download")} title="Descargar ticket PDF" aria-label="Descargar ticket PDF"><Download size={15} /></button>
          {!readOnly && <>
            <button className="button secondary" onClick={() => runAction("ordenes", "editar", () => onEdit(order), setMessage)} title="Editar orden" aria-label="Editar orden"><Pencil size={15} /></button>
            <button className="button secondary" onClick={() => remove(order)} title="Eliminar orden" aria-label="Eliminar orden"><Trash2 size={15} /></button>
          </>}
        </div></td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
