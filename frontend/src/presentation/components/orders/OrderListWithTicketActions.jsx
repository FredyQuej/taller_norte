import { Download, Eye, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { orderService } from "../../../application/services/orderService";
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

export function OrderListWithTicketActions({ orders, vehicles, filters, onFiltersChange, onAdd, onDetail, onEdit, readOnly = false }) {
  const [message, setMessage] = useState("");
  const session = getSession();
  const filtered = orders.filter((order) =>
    (filters.estado === "TODOS" || order.estado === filters.estado) &&
    (filters.vehiculo === "TODOS" || String(order.vehiculo_id) === filters.vehiculo)
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

  return <section className="content">
    <PermissionAlert message={message} />
    <div className="section-toolbar">
      <h2>{readOnly ? "Mis servicios" : "Órdenes de servicio"}</h2>
      {!readOnly && <button className="button primary" onClick={() => runAction("ordenes", "crear", onAdd, setMessage)}><Plus size={17} /> Nueva orden</button>}
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
      <thead><tr><th>Orden</th><th>Vehículo</th><th>Servicio</th><th>Fecha</th><th>Estado</th><th>Costo</th><th>Acciones</th></tr></thead>
      <tbody>{filtered.map((order) => <tr key={order.id}>
        <td>OS-{String(order.id).padStart(4, "0")}</td>
        <td>{order.marca} {order.modelo} · {order.placa}</td>
        <td>{order.servicio}</td>
        <td>{String(order.fecha_ingreso).slice(0, 10)}</td>
        <td>{order.estado}</td>
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
