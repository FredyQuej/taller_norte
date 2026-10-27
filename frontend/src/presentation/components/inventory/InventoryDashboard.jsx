import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, PackagePlus, Pencil, Plus, Search, Trash2, Warehouse } from "lucide-react";
import { inventoryService } from "../../../application/services/inventoryService";
import { hasPermission, PermissionAlert, showUnauthorized } from "../common/Permissions";

function readSession() {
  try { return JSON.parse(localStorage.getItem("taller_session") || "null"); } catch { return null; }
}

const money = (value) => `Q ${Number(value || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const emptyLine = () => ({ articulo_id: "", cantidad: 1, costo_compra: "", precio_venta: "" });

export function InventoryDashboard({ token }) {
  const [articles, setArticles] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [tab, setTab] = useState("articulos");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState("");
  const [editing, setEditing] = useState(null);
  const [purchaseForm, setPurchaseForm] = useState({ numero_factura: "", proveedor: "", observaciones: "", lineas: [emptyLine()] });
  const [saleForm, setSaleForm] = useState({ observaciones: "", lineas: [emptyLine()] });
  const session = readSession();
  const permissions = session?.usuario?.permisos;

  async function loadInventory() {
    setLoading(true);
    try {
      const [articleRows, movementRows, purchaseRows, saleRows] = await Promise.all([
        inventoryService.listArticles(token),
        inventoryService.listMovements(token),
        inventoryService.listPurchases(token),
        inventoryService.listSales(token),
      ]);
      setArticles(articleRows);
      setMovements(movementRows);
      setPurchases(purchaseRows);
      setSales(saleRows);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInventory(); }, [token]);

  const activeArticles = articles.filter((article) => article.activo);
  const filteredArticles = useMemo(() => articles.filter((article) => `${article.nombre} ${article.sku || ""} ${article.categoria || ""} ${article.tipo}`.toLowerCase().includes(search.toLowerCase())), [articles, search]);
  const lowStock = activeArticles.filter((article) => Number(article.stock_actual) <= Number(article.stock_minimo)).length;

  function startCreate() {
    if (!hasPermission(permissions, "inventario", "crear", session?.usuario?.rol)) return showUnauthorized(setMessage);
    setEditing(null);
    setModal("article");
  }

  function startEdit(article) {
    if (!hasPermission(permissions, "inventario", "editar", session?.usuario?.rol)) return showUnauthorized(setMessage);
    setEditing(article);
    setModal("article");
  }

  function startPurchase() {
    if (!hasPermission(permissions, "inventario", "crear", session?.usuario?.rol)) return showUnauthorized(setMessage);
    setPurchaseForm({ numero_factura: "", proveedor: "", observaciones: "", lineas: [emptyLine()] });
    setModal("purchase");
  }

  function startSale() {
    if (!hasPermission(permissions, "inventario", "crear", session?.usuario?.rol)) return showUnauthorized(setMessage);
    setSaleForm({ observaciones: "", lineas: [emptyLine()] });
    setModal("sale");
  }

  function updatePurchaseLine(index, field, value) {
    const lineas = purchaseForm.lineas.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, [field]: value };
      if (field === "articulo_id") {
        const article = articles.find((item) => String(item.id) === String(value));
        if (article) {
          next.costo_compra = next.costo_compra === "" ? article.precio_compra : next.costo_compra;
          next.precio_venta = next.precio_venta === "" ? article.precio_venta : next.precio_venta;
        }
      }
      return next;
    });
    setPurchaseForm({ ...purchaseForm, lineas });
  }

  function updateSaleLine(index, field, value) {
    const lineas = saleForm.lineas.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, [field]: value };
      if (field === "articulo_id") {
        const article = articles.find((item) => String(item.id) === String(value));
        if (article) next.precio_venta = article.precio_venta;
      }
      return next;
    });
    setSaleForm({ ...saleForm, lineas });
  }

  async function removeArticle(article) {
    if (!hasPermission(permissions, "inventario", "eliminar", session?.usuario?.rol)) return showUnauthorized(setMessage);
    if (!window.confirm(`¿Desactivar el artículo ${article.nombre}?`)) return;
    try { await inventoryService.deleteArticle(token, article.id); await loadInventory(); }
    catch (error) { setMessage(error.message); }
  }

  async function saveArticle(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      sku: form.get("sku"),
      nombre: form.get("nombre"),
      categoria: form.get("categoria"),
      tipo: form.get("tipo"),
      stock_minimo: Number(form.get("stock_minimo") || 0),
      precio_compra: Number(editing?.precio_compra || 0),
      precio_venta: Number(editing?.precio_venta || 0),
      activo: form.get("activo") === "true",
    };
    try {
      await inventoryService.saveArticle(token, payload, editing?.id);
      setModal("");
      await loadInventory();
    } catch (error) { setMessage(error.message); }
  }

  async function savePurchase(event) {
    event.preventDefault();
    const lineas = purchaseForm.lineas.filter((line) => line.articulo_id).map((line) => ({
      articulo_id: Number(line.articulo_id),
      cantidad: Number(line.cantidad),
      costo_compra: Number(line.costo_compra),
      precio_venta: Number(line.precio_venta),
    }));
    if (!lineas.length) return setMessage("Agregue al menos un artículo a la compra");
    try {
      await inventoryService.createPurchase(token, {
        numero_factura: purchaseForm.numero_factura,
        proveedor: purchaseForm.proveedor || null,
        observaciones: purchaseForm.observaciones || null,
        lineas,
      });
      setModal("");
      await loadInventory();
    } catch (error) { setMessage(error.message); }
  }

  async function saveSale(event) {
    event.preventDefault();
    const lineas = saleForm.lineas.filter((line) => line.articulo_id).map((line) => ({
      articulo_id: Number(line.articulo_id),
      cantidad: Number(line.cantidad),
      precio_venta: Number(line.precio_venta),
    }));
    if (!lineas.length) return setMessage("Agregue al menos un artículo a la venta");
    try {
      await inventoryService.createSale(token, { observaciones: saleForm.observaciones || null, lineas });
      setModal("");
      await loadInventory();
    } catch (error) { setMessage(error.message); }
  }

  const purchaseTotal = purchaseForm.lineas.reduce((sum, line) => sum + (Number(line.cantidad) || 0) * (Number(line.costo_compra) || 0), 0);
  const saleTotal = saleForm.lineas.reduce((sum, line) => sum + (Number(line.cantidad) || 0) * (Number(line.precio_venta) || 0), 0);

  return <section className="content inventory-dashboard">
    <PermissionAlert message={message} />
    <div className="section-toolbar">
      <div><p className="muted">Repuestos y accesorios</p><h2>Inventario</h2></div>
      <div className="inventory-toolbar-actions">
        <button className="button secondary" onClick={startPurchase}><ArrowDownToLine size={16} /> Nueva compra</button>
        <button className="button secondary" onClick={startSale}><ArrowUpFromLine size={16} /> Nueva venta</button>
        <button className="button primary" onClick={startCreate}><PackagePlus size={16} /> Nuevo artículo</button>
      </div>
    </div>
    <div className="stat-grid inventory-stats">
      <div className="stat"><div className="stat-icon"><Warehouse size={20} /></div><div><span>Artículos activos</span><strong>{articles.filter((article) => article.activo).length}</strong></div></div>
      <div className={`stat ${lowStock ? "accent" : ""}`}><div className="stat-icon"><ArrowDownToLine size={20} /></div><div><span>Bajo mínimo</span><strong>{lowStock}</strong></div></div>
      <div className="stat"><div className="stat-icon"><ArrowUpFromLine size={20} /></div><div><span>Movimientos recientes</span><strong>{movements.length}</strong></div></div>
    </div>
    <div className="inventory-tabs">{[["articulos", "Artículos"], ["compras", "Compras"], ["ventas", "Ventas"], ["movimientos", "Movimientos"]].map(([id, label]) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "articulos" && <div className="list-toolbar inventory-search"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, código o categoría" /></div><span className="result-count">{filteredArticles.length} artículos</span></div>}
    {loading ? <div className="empty"><p>Cargando inventario...</p></div> : <>
    {tab === "articulos" && <div className="table-wrap"><table><thead><tr><th>Código</th><th>Artículo</th><th>Categoría</th><th>Tipo</th><th>Existencia</th><th>Mínimo</th><th>Compra</th><th>Venta</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filteredArticles.map((article) => {
      const isLow = Number(article.stock_actual) <= Number(article.stock_minimo);
      return <tr key={article.id}>
        <td>{article.sku || "—"}</td><td><strong>{article.nombre}</strong><small>{article.descripcion || article.unidad}</small></td><td>{article.categoria || "—"}</td><td>{article.tipo === "REPUESTO" ? "Repuesto" : "Accesorio"}</td>
        <td className={isLow ? "inventory-low-stock" : ""}>{Number(article.stock_actual).toLocaleString("es-GT")} {article.unidad}</td><td>{Number(article.stock_minimo).toLocaleString("es-GT")} {article.unidad}</td>
        <td>Q {Number(article.precio_compra).toFixed(2)}</td><td>Q {Number(article.precio_venta).toFixed(2)}</td><td>{isLow ? "Bajo stock" : article.activo ? "Disponible" : "Inactivo"}</td>
        <td><div className="inventory-row-actions"><button className="button secondary" title="Editar artículo" aria-label="Editar artículo" onClick={() => startEdit(article)}><Pencil size={15} /></button><button className="button secondary" title="Desactivar artículo" aria-label="Desactivar artículo" onClick={() => removeArticle(article)}><Trash2 size={15} /></button></div></td>
      </tr>;
    })}</tbody></table></div>}
    {tab === "compras" && <div className="table-wrap"><table><thead><tr><th>Factura</th><th>Proveedor</th><th>Fecha</th><th>Artículos</th><th>Total compra</th><th>Usuario</th></tr></thead><tbody>{purchases.length === 0 ? <tr><td colSpan="6"><div className="empty"><h3>Sin compras registradas</h3><p>Registra el ingreso de artículos con su número de factura.</p></div></td></tr> : purchases.map((purchase) => <tr key={purchase.id}><td><strong>{purchase.numero_factura}</strong></td><td>{purchase.proveedor || "—"}</td><td>{new Date(purchase.creado_en).toLocaleString("es-GT")}</td><td><small>{purchase.lineas.map((line) => `${line.sku ? `${line.sku} · ` : ""}${line.articulo} × ${Number(line.cantidad)}`).join(" | ")}</small></td><td>{money(purchase.total)}</td><td>{purchase.usuario || "Sistema"}</td></tr>)}</tbody></table></div>}
    {tab === "ventas" && <div className="table-wrap"><table><thead><tr><th>Venta</th><th>Fecha</th><th>Artículos</th><th>Total venta</th><th>Usuario</th></tr></thead><tbody>{sales.length === 0 ? <tr><td colSpan="5"><div className="empty"><h3>Sin ventas registradas</h3><p>Registra la salida de artículos por venta.</p></div></td></tr> : sales.map((sale) => <tr key={sale.id}><td><strong>VT-{String(sale.id).padStart(4, "0")}</strong></td><td>{new Date(sale.creado_en).toLocaleString("es-GT")}</td><td><small>{sale.lineas.map((line) => `${line.sku ? `${line.sku} · ` : ""}${line.articulo} × ${Number(line.cantidad)}`).join(" | ")}</small></td><td>{money(sale.total)}</td><td>{sale.usuario || "Sistema"}</td></tr>)}</tbody></table></div>}
    {tab === "movimientos" && <><div className="section-toolbar inventory-movements-heading"><div><p className="muted">Trazabilidad de stock</p><h2>Movimientos recientes</h2></div></div>
    <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Artículo</th><th>Movimiento</th><th>Cantidad</th><th>Referencia</th><th>Usuario</th></tr></thead><tbody>{movements.slice(0, 30).map((movement) => <tr key={movement.id}><td>{new Date(movement.creado_en).toLocaleString("es-GT")}</td><td>{movement.articulo}</td><td>{movement.tipo === "CONSUMO_ORDEN" ? "Consumo en orden" : movement.tipo === "ENTRADA" ? "Ingreso" : "Salida"}</td><td>{Number(movement.cantidad).toLocaleString("es-GT")}</td><td>{movement.orden || movement.referencia || "—"}</td><td>{movement.usuario || "Sistema"}</td></tr>)}</tbody></table></div></>}
    </>}

    {modal === "article" && <InventoryModal title={editing ? "Editar artículo" : "Nuevo artículo"} onClose={() => setModal("")}><form className="stack-form" onSubmit={saveArticle}><div className="form-grid">
      <label>Código<input name="sku" defaultValue={editing?.sku || ""} placeholder="Ej. FIL-001" /></label><label>Nombre<input name="nombre" required defaultValue={editing?.nombre || ""} /></label>
      <label>Categoría<input name="categoria" defaultValue={editing?.categoria || ""} placeholder="Ej. Filtros, Frenos, Lubricantes" /></label>
      <label>Tipo<select name="tipo" defaultValue={editing?.tipo || "REPUESTO"}><option value="REPUESTO">Repuesto</option><option value="ACCESORIO">Accesorio</option></select></label>
      <label>Stock mínimo<input name="stock_minimo" type="number" step="0.01" min="0" defaultValue={editing?.stock_minimo || 0} /></label><label>Activo<select name="activo" defaultValue={String(editing?.activo ?? true)}><option value="true">Sí</option><option value="false">No</option></select></label>
    </div><p className="muted">Las existencias inician en cero y los precios se actualizan al registrar compras.</p><div className="modal-actions"><button type="button" className="button ghost" onClick={() => setModal("")}>Cancelar</button><button className="button primary">Guardar artículo</button></div></form></InventoryModal>}

    {modal === "purchase" && <InventoryModal title="Ingreso · Nueva compra" onClose={() => setModal("")}><form className="stack-form" onSubmit={savePurchase}>
      <div className="form-grid">
        <label>Número de factura<input value={purchaseForm.numero_factura} onChange={(event) => setPurchaseForm({ ...purchaseForm, numero_factura: event.target.value })} required placeholder="Ej. F-1024" /></label>
        <label>Proveedor<input value={purchaseForm.proveedor} onChange={(event) => setPurchaseForm({ ...purchaseForm, proveedor: event.target.value })} placeholder="Nombre del proveedor" /></label>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Artículo</th><th>Cantidad</th><th>Costo compra Q</th><th>Costo venta Q</th><th>Subtotal</th><th /></tr></thead><tbody>{purchaseForm.lineas.map((line, index) => <tr key={index}>
        <td><select value={line.articulo_id} onChange={(event) => updatePurchaseLine(index, "articulo_id", event.target.value)} required><option value="" disabled>Selecciona artículo</option>{activeArticles.map((article) => <option key={article.id} value={article.id}>{article.sku ? `${article.sku} · ` : ""}{article.nombre}</option>)}</select></td>
        <td><input type="number" min="0.01" step="0.01" value={line.cantidad} onChange={(event) => updatePurchaseLine(index, "cantidad", event.target.value)} required /></td>
        <td><input type="number" min="0" step="0.01" value={line.costo_compra} onChange={(event) => updatePurchaseLine(index, "costo_compra", event.target.value)} required placeholder="0.00" /></td>
        <td><input type="number" min="0" step="0.01" value={line.precio_venta} onChange={(event) => updatePurchaseLine(index, "precio_venta", event.target.value)} required placeholder="0.00" /></td>
        <td>{money((Number(line.cantidad) || 0) * (Number(line.costo_compra) || 0))}</td>
        <td><button type="button" className="button ghost" onClick={() => setPurchaseForm({ ...purchaseForm, lineas: purchaseForm.lineas.filter((_, i) => i !== index) })} disabled={purchaseForm.lineas.length === 1} aria-label="Quitar línea"><Trash2 size={15} /></button></td>
      </tr>)}</tbody></table></div>
      <div className="section-toolbar"><button type="button" className="button secondary" onClick={() => setPurchaseForm({ ...purchaseForm, lineas: [...purchaseForm.lineas, emptyLine()] })}><Plus size={15} /> Agregar artículo</button><strong>Total de la compra: {money(purchaseTotal)}</strong></div>
      <label className="wide">Observaciones<textarea rows="2" value={purchaseForm.observaciones} onChange={(event) => setPurchaseForm({ ...purchaseForm, observaciones: event.target.value })} /></label>
      <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setModal("")}>Cancelar</button><button className="button primary">Registrar compra</button></div>
    </form></InventoryModal>}

    {modal === "sale" && <InventoryModal title="Salida · Nueva venta" onClose={() => setModal("")}><form className="stack-form" onSubmit={saveSale}>
      <div className="table-wrap"><table><thead><tr><th>Artículo</th><th>Cantidad</th><th>Costo venta Q</th><th>Subtotal</th><th /></tr></thead><tbody>{saleForm.lineas.map((line, index) => <tr key={index}>
        <td><select value={line.articulo_id} onChange={(event) => updateSaleLine(index, "articulo_id", event.target.value)} required><option value="" disabled>Selecciona artículo</option>{activeArticles.map((article) => <option key={article.id} value={article.id}>{article.sku ? `${article.sku} · ` : ""}{article.nombre} · disp. {Number(article.stock_actual)}</option>)}</select></td>
        <td><input type="number" min="0.01" step="0.01" value={line.cantidad} onChange={(event) => updateSaleLine(index, "cantidad", event.target.value)} required /></td>
        <td><input type="number" min="0" step="0.01" value={line.precio_venta} onChange={(event) => updateSaleLine(index, "precio_venta", event.target.value)} required placeholder="0.00" /></td>
        <td>{money((Number(line.cantidad) || 0) * (Number(line.precio_venta) || 0))}</td>
        <td><button type="button" className="button ghost" onClick={() => setSaleForm({ ...saleForm, lineas: saleForm.lineas.filter((_, i) => i !== index) })} disabled={saleForm.lineas.length === 1} aria-label="Quitar línea"><Trash2 size={15} /></button></td>
      </tr>)}</tbody></table></div>
      <div className="section-toolbar"><button type="button" className="button secondary" onClick={() => setSaleForm({ ...saleForm, lineas: [...saleForm.lineas, emptyLine()] })}><Plus size={15} /> Agregar artículo</button><strong>Total de la venta: {money(saleTotal)}</strong></div>
      <label className="wide">Observaciones<textarea rows="2" value={saleForm.observaciones} onChange={(event) => setSaleForm({ ...saleForm, observaciones: event.target.value })} /></label>
      <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setModal("")}>Cancelar</button><button className="button primary">Registrar venta</button></div>
    </form></InventoryModal>}
  </section>;
}

function InventoryModal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-header"><h3>{title}</h3><button className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div>{children}</div></div>;
}
