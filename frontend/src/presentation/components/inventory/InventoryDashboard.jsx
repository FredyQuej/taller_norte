import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, PackagePlus, Pencil, Search, Trash2, Warehouse } from "lucide-react";
import { inventoryService } from "../../../application/services/inventoryService";
import { hasPermission, PermissionAlert, showUnauthorized } from "../common/Permissions";

function readSession() {
  try { return JSON.parse(localStorage.getItem("taller_session") || "null"); } catch { return null; }
}

export function InventoryDashboard({ token }) {
  const [articles, setArticles] = useState([]);
  const [movements, setMovements] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState("");
  const [editing, setEditing] = useState(null);
  const [movementType, setMovementType] = useState("ENTRADA");
  const session = readSession();
  const permissions = session?.usuario?.permisos;

  async function loadInventory() {
    setLoading(true);
    try {
      const [articleRows, movementRows] = await Promise.all([
        inventoryService.listArticles(token),
        inventoryService.listMovements(token),
      ]);
      setArticles(articleRows);
      setMovements(movementRows);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInventory(); }, [token]);

  const filteredArticles = useMemo(() => articles.filter((article) => `${article.nombre} ${article.sku || ""} ${article.tipo}`.toLowerCase().includes(search.toLowerCase())), [articles, search]);
  const lowStock = articles.filter((article) => Number(article.stock_actual) <= Number(article.stock_minimo)).length;

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

  function startMovement(type) {
    if (!hasPermission(permissions, "inventario", "crear", session?.usuario?.rol)) return showUnauthorized(setMessage);
    setMovementType(type);
    setModal("movement");
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
      tipo: form.get("tipo"),
      descripcion: form.get("descripcion"),
      unidad: form.get("unidad"),
      stock_minimo: Number(form.get("stock_minimo") || 0),
      precio_compra: Number(form.get("precio_compra") || 0),
      precio_venta: Number(form.get("precio_venta") || 0),
      activo: form.get("activo") === "true",
    };
    try {
      await inventoryService.saveArticle(token, payload, editing?.id);
      setModal("");
      await loadInventory();
    } catch (error) { setMessage(error.message); }
  }

  async function saveMovement(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      articulo_id: Number(form.get("articulo_id")),
      tipo: movementType,
      cantidad: Number(form.get("cantidad")),
      costo_unitario: Number(form.get("costo_unitario") || 0),
      referencia: form.get("referencia"),
      observaciones: form.get("observaciones"),
    };
    try {
      await inventoryService.createMovement(token, payload);
      setModal("");
      await loadInventory();
    } catch (error) { setMessage(error.message); }
  }

  return <section className="content inventory-dashboard">
    <PermissionAlert message={message} />
    <div className="section-toolbar">
      <div><p className="muted">Repuestos y accesorios</p><h2>Inventario</h2></div>
      <div className="inventory-toolbar-actions">
        <button className="button secondary" onClick={() => startMovement("ENTRADA")}><ArrowDownToLine size={16} /> Ingreso</button>
        <button className="button secondary" onClick={() => startMovement("SALIDA")}><ArrowUpFromLine size={16} /> Salida</button>
        <button className="button primary" onClick={startCreate}><PackagePlus size={16} /> Nuevo artículo</button>
      </div>
    </div>
    <div className="stat-grid inventory-stats">
      <div className="stat"><div className="stat-icon"><Warehouse size={20} /></div><div><span>Artículos activos</span><strong>{articles.filter((article) => article.activo).length}</strong></div></div>
      <div className={`stat ${lowStock ? "accent" : ""}`}><div className="stat-icon"><ArrowDownToLine size={20} /></div><div><span>Bajo mínimo</span><strong>{lowStock}</strong></div></div>
      <div className="stat"><div className="stat-icon"><ArrowUpFromLine size={20} /></div><div><span>Movimientos recientes</span><strong>{movements.length}</strong></div></div>
    </div>
    <div className="list-toolbar inventory-search"><div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, SKU o tipo" /></div><span className="result-count">{filteredArticles.length} artículos</span></div>
    {loading ? <div className="empty"><p>Cargando inventario...</p></div> : <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Artículo</th><th>Tipo</th><th>Existencia</th><th>Mínimo</th><th>Compra</th><th>Venta</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filteredArticles.map((article) => {
      const isLow = Number(article.stock_actual) <= Number(article.stock_minimo);
      return <tr key={article.id}>
        <td>{article.sku || "—"}</td><td><strong>{article.nombre}</strong><small>{article.descripcion || article.unidad}</small></td><td>{article.tipo === "REPUESTO" ? "Repuesto" : "Accesorio"}</td>
        <td className={isLow ? "inventory-low-stock" : ""}>{Number(article.stock_actual).toLocaleString("es-GT")} {article.unidad}</td><td>{Number(article.stock_minimo).toLocaleString("es-GT")} {article.unidad}</td>
        <td>Q {Number(article.precio_compra).toFixed(2)}</td><td>Q {Number(article.precio_venta).toFixed(2)}</td><td>{isLow ? "Bajo stock" : article.activo ? "Disponible" : "Inactivo"}</td>
        <td><div className="inventory-row-actions"><button className="button secondary" title="Editar artículo" aria-label="Editar artículo" onClick={() => startEdit(article)}><Pencil size={15} /></button><button className="button secondary" title="Desactivar artículo" aria-label="Desactivar artículo" onClick={() => removeArticle(article)}><Trash2 size={15} /></button></div></td>
      </tr>;
    })}</tbody></table></div>}
    <div className="section-toolbar inventory-movements-heading"><div><p className="muted">Trazabilidad de stock</p><h2>Movimientos recientes</h2></div></div>
    <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Artículo</th><th>Movimiento</th><th>Cantidad</th><th>Referencia</th><th>Usuario</th></tr></thead><tbody>{movements.slice(0, 30).map((movement) => <tr key={movement.id}><td>{new Date(movement.creado_en).toLocaleString("es-GT")}</td><td>{movement.articulo}</td><td>{movement.tipo === "CONSUMO_ORDEN" ? "Consumo en orden" : movement.tipo}</td><td>{Number(movement.cantidad).toLocaleString("es-GT")}</td><td>{movement.orden || movement.referencia || "—"}</td><td>{movement.usuario || "Sistema"}</td></tr>)}</tbody></table></div>

    {modal === "article" && <InventoryModal title={editing ? "Editar artículo" : "Nuevo artículo"} onClose={() => setModal("")}><form className="stack-form" onSubmit={saveArticle}><div className="form-grid">
      <label>SKU<input name="sku" defaultValue={editing?.sku || ""} /></label><label>Nombre<input name="nombre" required defaultValue={editing?.nombre || ""} /></label>
      <label>Tipo<select name="tipo" defaultValue={editing?.tipo || "REPUESTO"}><option value="REPUESTO">Repuesto</option><option value="ACCESORIO">Accesorio</option></select></label><label>Unidad<input name="unidad" required defaultValue={editing?.unidad || "unidad"} /></label>
      <label>Stock mínimo<input name="stock_minimo" type="number" step="0.01" min="0" defaultValue={editing?.stock_minimo || 0} /></label><label>Precio de compra Q<input name="precio_compra" type="number" step="0.01" min="0" defaultValue={editing?.precio_compra || 0} /></label>
      <label>Precio de venta Q<input name="precio_venta" type="number" step="0.01" min="0" defaultValue={editing?.precio_venta || 0} /></label><label>Activo<select name="activo" defaultValue={String(editing?.activo ?? true)}><option value="true">Sí</option><option value="false">No</option></select></label>
      <label className="wide">Descripción<textarea name="descripcion" rows="2" defaultValue={editing?.descripcion || ""} /></label>
    </div><p className="muted">Las existencias se inicializan en cero. Registra el stock mediante Ingreso.</p><div className="modal-actions"><button type="button" className="button ghost" onClick={() => setModal("")}>Cancelar</button><button className="button primary">Guardar artículo</button></div></form></InventoryModal>}

    {modal === "movement" && <InventoryModal title={movementType === "ENTRADA" ? "Ingreso de inventario" : "Salida de inventario"} onClose={() => setModal("")}><form className="stack-form" onSubmit={saveMovement}><div className="form-grid">
      <label>Artículo<select name="articulo_id" required defaultValue=""><option value="" disabled>Selecciona un artículo</option>{articles.filter((article) => article.activo).map((article) => <option key={article.id} value={article.id}>{article.sku ? `${article.sku} · ` : ""}{article.nombre} · disponible {article.stock_actual}</option>)}</select></label>
      <label>Cantidad<input name="cantidad" type="number" min="0.01" step="0.01" required /></label>
      {movementType === "ENTRADA" && <label>Costo de compra unitario Q<input name="costo_unitario" type="number" min="0" step="0.01" required /></label>}
      <label>Referencia<input name="referencia" placeholder="Factura, proveedor o motivo" /></label><label className="wide">Observaciones<textarea name="observaciones" rows="2" /></label>
    </div><div className="modal-actions"><button type="button" className="button ghost" onClick={() => setModal("")}>Cancelar</button><button className="button primary">Registrar {movementType === "ENTRADA" ? "ingreso" : "salida"}</button></div></form></InventoryModal>}
  </section>;
}

function InventoryModal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-header"><h3>{title}</h3><button className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div>{children}</div></div>;
}
