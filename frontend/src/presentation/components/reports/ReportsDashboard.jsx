import { useEffect, useMemo, useState } from "react";
import { CalendarClock, FileDown, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { inventoryService } from "../../../application/services/inventoryService";
import { orderService } from "../../../application/services/orderService";
import { ownerService } from "../../../application/services/ownerService";
import { serviceService } from "../../../application/services/serviceService";
import { vehicleService } from "../../../application/services/vehicleService";
import { PermissionAlert } from "../common/Permissions";

const money = (value) => Number(value || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOf = (value) => String(value || "").slice(0, 10);

const REPORT_TYPES = {
  ordenes: { label: "Órdenes de servicio", fileName: "ordenes" },
  propietarios: { label: "Propietarios", fileName: "propietarios" },
  vehiculos: { label: "Vehículos", fileName: "vehiculos" },
  servicios: { label: "Catálogo de servicios", fileName: "servicios" },
  existencias: { label: "Existencias actuales", fileName: "existencias" },
  compras: { label: "Compras de inventario", fileName: "compras" },
  ventas: { label: "Ventas de inventario", fileName: "ventas" },
  movimientos: { label: "Movimientos de inventario", fileName: "movimientos" },
};

const USES_RANGE = ["ordenes", "compras", "ventas", "movimientos"];

function firstDayOfMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ReportsDashboard({ token }) {
  const [reportType, setReportType] = useState("ordenes");
  const [desde, setDesde] = useState(firstDayOfMonth());
  const [hasta, setHasta] = useState(today());
  const [articles, setArticles] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [owners, setOwners] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const range = { desde: desde || undefined, hasta: hasta || undefined };
      const [articleRows, purchaseRows, saleRows, movementRows, ownerRows, vehicleRows, serviceRows, orderRows] = await Promise.all([
        inventoryService.listArticles(token),
        inventoryService.listPurchases(token, range),
        inventoryService.listSales(token, range),
        inventoryService.listMovements(token),
        ownerService.list(token),
        vehicleService.listVehicles(token),
        serviceService.list(token),
        orderService.list(token),
      ]);
      setArticles(articleRows);
      setPurchases(purchaseRows);
      setSales(saleRows);
      setMovements(movementRows);
      setOwners(ownerRows);
      setVehicles(vehicleRows);
      setServices(serviceRows);
      setOrders(orderRows);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [token, desde, hasta]);

  const report = useMemo(() => {
    if (reportType === "propietarios") {
      const rows = owners.map((owner) => [
        owner.id,
        owner.nombre,
        owner.tipo === "EMPRESA" ? "Empresa" : "Individual",
        owner.nit || "—",
        owner.telefono || "—",
        owner.correo || "—",
        owner.direccion || "—",
        owner.activo ? "Activo" : "Inactivo",
      ]);
      return {
        title: REPORT_TYPES.propietarios.label,
        columns: ["ID", "Nombre", "Tipo", "NIT", "Teléfono", "Correo", "Dirección", "Estado"],
        rows,
        total: `${rows.length} propietarios registrados`,
      };
    }
    if (reportType === "vehiculos") {
      const rows = vehicles.map((vehicle) => [
        vehicle.placa,
        vehicle.marca,
        vehicle.modelo,
        vehicle.tipo,
        vehicle.anio,
        vehicle.propietario || "—",
        Number(vehicle.kilometraje_actual || 0).toLocaleString("es-GT"),
        vehicle.estado,
      ]);
      return {
        title: REPORT_TYPES.vehiculos.label,
        columns: ["Placa", "Marca", "Modelo", "Tipo", "Año", "Propietario", "Kilometraje", "Estado"],
        rows,
        total: `${rows.length} vehículos registrados`,
      };
    }
    if (reportType === "servicios") {
      const rows = services.map((service) => [
        service.nombre,
        service.descripcion || "—",
        money(service.precio),
        service.activo ? "Activo" : "Inactivo",
      ]);
      return {
        title: REPORT_TYPES.servicios.label,
        columns: ["Servicio", "Descripción", "Precio Q", "Estado"],
        rows,
        total: `${rows.length} servicios en catálogo`,
      };
    }
    if (reportType === "ordenes") {
      const filtered = orders.filter((order) => (!desde || dateOf(order.fecha_ingreso) >= desde) && (!hasta || dateOf(order.fecha_ingreso) <= hasta));
      const rows = filtered.map((order) => [
        `OS-${String(order.id).padStart(4, "0")}`,
        dateOf(order.fecha_ingreso),
        order.fecha_proximo_servicio ? dateOf(order.fecha_proximo_servicio) : "—",
        order.placa,
        `${order.marca} ${order.modelo}`,
        order.propietario,
        order.servicio,
        order.estado,
        order.prioridad,
        Number(order.kilometraje || 0).toLocaleString("es-GT"),
        money(order.costo),
        money(Number(order.costo_total ?? order.costo ?? 0) - Number(order.costo || 0)),
        money(order.costo_total ?? order.costo),
      ]);
      const totalBilled = filtered.reduce((sum, order) => sum + Number(order.costo_total ?? order.costo ?? 0), 0);
      return {
        title: REPORT_TYPES.ordenes.label,
        columns: ["Orden", "Ingreso", "Próximo servicio", "Placa", "Vehículo", "Propietario", "Servicio", "Estado", "Prioridad", "Kilometraje", "Mano de obra Q", "Artículos Q", "Total Q"],
        rows,
        total: `${filtered.length} órdenes · Total: Q ${money(totalBilled)}`,
      };
    }
    if (reportType === "existencias") {
      const rows = articles.map((article) => [
        article.sku || "—",
        article.nombre,
        article.categoria || "—",
        article.tipo === "REPUESTO" ? "Repuesto" : "Accesorio",
        Number(article.stock_actual),
        Number(article.stock_minimo),
        money(article.precio_compra),
        money(article.precio_venta),
        money(Number(article.stock_actual) * Number(article.precio_compra)),
        article.activo ? "Activo" : "Inactivo",
      ]);
      const totalValued = articles.reduce((sum, article) => sum + Number(article.stock_actual) * Number(article.precio_compra), 0);
      return {
        title: REPORT_TYPES.existencias.label,
        columns: ["Código", "Artículo", "Categoría", "Tipo", "Existencia", "Mínimo", "Costo compra Q", "Costo venta Q", "Valorizado Q", "Estado"],
        rows,
        total: `Inventario valorizado: Q ${money(totalValued)}`,
      };
    }
    if (reportType === "compras") {
      const rows = purchases.flatMap((purchase) => purchase.lineas.map((line) => [
        purchase.numero_factura,
        purchase.proveedor || "—",
        dateOf(purchase.creado_en),
        line.sku || "—",
        line.articulo,
        Number(line.cantidad),
        money(line.costo_compra),
        money(line.precio_venta),
        money(line.subtotal),
      ]));
      const totalPurchases = purchases.reduce((sum, purchase) => sum + Number(purchase.total), 0);
      return {
        title: REPORT_TYPES.compras.label,
        columns: ["Factura", "Proveedor", "Fecha", "Código", "Artículo", "Cantidad", "Costo compra Q", "Costo venta Q", "Subtotal Q"],
        rows,
        total: `Total comprado: Q ${money(totalPurchases)}`,
      };
    }
    if (reportType === "ventas") {
      const rows = sales.flatMap((sale) => sale.lineas.map((line) => [
        `VT-${String(sale.id).padStart(4, "0")}`,
        dateOf(sale.creado_en),
        line.sku || "—",
        line.articulo,
        Number(line.cantidad),
        money(line.precio_venta),
        money(line.subtotal),
      ]));
      const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
      return {
        title: REPORT_TYPES.ventas.label,
        columns: ["Venta", "Fecha", "Código", "Artículo", "Cantidad", "Costo venta Q", "Subtotal Q"],
        rows,
        total: `Total vendido: Q ${money(totalSales)}`,
      };
    }
    const rows = movements
      .filter((movement) => (!desde || dateOf(movement.creado_en) >= desde) && (!hasta || dateOf(movement.creado_en) <= hasta))
      .map((movement) => [
        new Date(movement.creado_en).toLocaleString("es-GT"),
        movement.sku || "—",
        movement.articulo,
        movement.tipo === "CONSUMO_ORDEN" ? "Consumo en orden" : movement.tipo === "ENTRADA" ? "Ingreso" : "Salida",
        Number(movement.cantidad),
        movement.orden || movement.referencia || "—",
        movement.usuario || "Sistema",
      ]);
    return {
      title: REPORT_TYPES.movimientos.label,
      columns: ["Fecha", "Código", "Artículo", "Movimiento", "Cantidad", "Referencia", "Usuario"],
      rows,
      total: `${rows.length} movimientos en el período`,
    };
  }, [reportType, articles, purchases, sales, movements, owners, vehicles, services, orders, desde, hasta]);

  const rangeLabel = USES_RANGE.includes(reportType) ? `del ${desde || "inicio"} al ${hasta || today()}` : `al ${today()}`;

  function exportPdf() {
    const doc = new jsPDF({ orientation: report.columns.length > 7 ? "landscape" : "portrait" });
    doc.setFontSize(14);
    doc.text("Taller Norte · Control de mantenimiento", 14, 14);
    doc.setFontSize(11);
    doc.text(`Reporte: ${report.title}`, 14, 21);
    doc.setFontSize(9);
    doc.text(`Período: ${rangeLabel} · Generado: ${new Date().toLocaleString("es-GT")}`, 14, 27);
    autoTable(doc, {
      head: [report.columns],
      body: report.rows.map((row) => row.map((cell) => String(cell))),
      startY: 32,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 46, 37] },
    });
    const finalY = doc.lastAutoTable?.finalY || 32;
    doc.setFontSize(10);
    doc.text(report.total, 14, finalY + 8);
    doc.save(`reporte-${REPORT_TYPES[reportType].fileName}-${today()}.pdf`);
  }

  function exportExcel() {
    const worksheet = XLSX.utils.aoa_to_sheet([
      [`Taller Norte · Reporte: ${report.title}`],
      [`Período: ${rangeLabel} · Generado: ${new Date().toLocaleString("es-GT")}`],
      [],
      report.columns,
      ...report.rows,
      [],
      [report.total],
    ]);
    worksheet["!cols"] = report.columns.map((column, index) => ({
      wch: Math.max(column.length + 2, ...report.rows.slice(0, 200).map((row) => String(row[index] ?? "").length + 2), 10),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
    XLSX.writeFile(workbook, `reporte-${REPORT_TYPES[reportType].fileName}-${today()}.xlsx`);
  }

  return <section className="content reports-dashboard">
    <PermissionAlert message={message} />
    <div className="section-toolbar">
      <div><p className="muted">Exportable a PDF y Excel</p><h2>Reportes de inventario</h2></div>
      <div className="inventory-toolbar-actions">
        <button className="button secondary" onClick={loadData} disabled={loading}><RefreshCw size={16} /> Actualizar</button>
        <button className="button secondary" onClick={exportExcel} disabled={loading || !report.rows.length}><FileSpreadsheet size={16} /> Excel</button>
        <button className="button primary" onClick={exportPdf} disabled={loading || !report.rows.length}><FileDown size={16} /> PDF</button>
      </div>
    </div>
    <div className="list-toolbar">
      <div className="search-box"><FileText size={17} /><label>Tipo de reporte<select value={reportType} onChange={(event) => setReportType(event.target.value)}>{Object.entries(REPORT_TYPES).map(([id, config]) => <option key={id} value={id}>{config.label}</option>)}</select></label></div>
      {USES_RANGE.includes(reportType) && <div className="search-box"><CalendarClock size={17} /><label>Desde<input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} /></label><label>Hasta<input type="date" value={hasta} min={desde} onChange={(event) => setHasta(event.target.value)} /></label></div>}
      <span className="result-count">{report.rows.length} registros · {report.total}</span>
    </div>
    {loading ? <div className="empty"><p>Cargando datos del reporte...</p></div> : report.rows.length === 0 ? <div className="empty"><h3>Sin datos para este reporte</h3><p>Ajusta el tipo de reporte o el rango de fechas.</p></div> : <div className="table-wrap"><table><thead><tr>{report.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}
