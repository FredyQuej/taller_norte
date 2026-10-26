import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Download, Printer, ShieldCheck } from "lucide-react";
import { apiConfig } from "../../../config/api";
import { orderService } from "../../../application/services/orderService";

export function ServiceTicket({ order, onBack }) {
  const [qr, setQr] = useState("");
  const publicUrl = `${apiConfig.publicApp}/?ticket=${order.id}`;

  useEffect(() => {
    QRCode.toDataURL(publicUrl, { width: 220, margin: 1 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [publicUrl]);

  return <section className="content ticket-page"><div className="section-toolbar no-print"><button className="button ghost" onClick={onBack}><ArrowLeft size={17} /> Volver</button><button className="button primary" onClick={() => window.print()}><Printer size={17} /> Imprimir ticket</button></div><article className="service-ticket"><header className="ticket-header"><div><span className="eyebrow">TALLER NORTE</span><h2>Ticket de orden de servicio</h2><p>OS-{String(order.id).padStart(4, "0")}</p></div>{qr && <img className="ticket-qr" src={qr} alt="Código QR para consultar el estado del servicio" />}</header><div className="ticket-status"><ShieldCheck size={18} /><span>Estado actual</span><strong>{order.estado}</strong></div><div className="ticket-grid"><div><span>Vehículo</span><strong>{order.marca} {order.modelo}</strong></div><div><span>Placa</span><strong>{order.placa}</strong></div><div><span>Servicio</span><strong>{order.servicio}</strong></div><div><span>Fecha de ingreso</span><strong>{order.fecha_ingreso}</strong></div><div><span>Prioridad</span><strong>{order.prioridad}</strong></div><div><span>Costo</span><strong>Q {Number(order.costo || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div></div><div className="ticket-description"><span>Descripción</span><p>{order.descripcion}</p></div><footer>Escanea el código QR para consultar el estado actualizado de tu servicio.</footer></article></section>;
}

export function PublicTicket() {
  const query = new URLSearchParams(window.location.search);
  const ticketId = query.get("ticket");
  const requestedAction = query.get("action");
  const [ticket, setTicket] = useState(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [paperWidth, setPaperWidth] = useState(query.get("paper") === "58" ? "58" : "80");
  const autoActionHandled = useRef(false);
  const publicUrl = `${window.location.origin}/?ticket=${ticketId}`;
  useEffect(() => { if (!ticketId) return; orderService.getPublicTicket(ticketId).then(setTicket).catch((requestError) => setError(requestError.message)); QRCode.toDataURL(publicUrl, { width: 180, margin: 1 }).then(setQr); }, [ticketId, publicUrl]);
  useEffect(() => {
    if (!ticket || !qr || autoActionHandled.current) return;
    if (requestedAction === "download") {
      autoActionHandled.current = true;
      downloadPdf().catch((requestError) => setError(requestError.message));
    } else if (requestedAction === "print") {
      autoActionHandled.current = true;
      window.setTimeout(() => window.print(), 500);
    }
  }, [ticket, qr, requestedAction, paperWidth]);
  if (!ticketId) return <main className="public-ticket"><h1>Ticket no encontrado</h1></main>;
  if (error) return <main className="public-ticket"><h1>No se pudo consultar el ticket</h1><p>{error}</p></main>;
  if (!ticket) return <main className="public-ticket"><p>Consultando estado del servicio...</p></main>;
  async function downloadPdf() {
    const { jsPDF } = await import("jspdf");
    const qrData = qr || await QRCode.toDataURL(publicUrl, { width: 240, margin: 1 });
    const width = Number(paperWidth);
    const maxTextChars = width === 58 ? 25 : 38;
    const pdfRows = [["ESTADO", ticket.estado], ["VEHICULO", `${ticket.marca} ${ticket.modelo}`], ["PLACA", ticket.placa], ["SERVICIO", ticket.servicio], ["FECHA DE INGRESO", String(ticket.fecha_ingreso).slice(0, 10)], ["KILOMETRAJE AL INGRESO", `${Number(ticket.kilometraje || 0).toLocaleString("es-GT")} km`], ["PROXIMO SERVICIO ESTIMADO", ticket.fecha_proximo_servicio ? String(ticket.fecha_proximo_servicio).slice(0, 10) : "No estimada"], ["PRIORIDAD", ticket.prioridad], ["COSTO", `Q ${Number(ticket.costo || 0).toFixed(2)}`], ["DESCRIPCION", ticket.descripcion]];
    const estimatedContent = pdfRows.reduce((height, [, value]) => height + Math.max(1, Math.ceil(String(value || "-").length / maxTextChars)) * 4.2 + 7, 0);
    const height = Math.max(145, Math.ceil(estimatedContent + 82));
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [width, height] });
    const margin = width === 58 ? 4 : 6;
    const textWidth = width - margin * 2;
    let y = 10;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(width === 58 ? 12 : 15);
    pdf.text("TALLER NORTE", width / 2, y, { align: "center" });
    y += 7;
    pdf.setFontSize(width === 58 ? 10 : 12);
    pdf.text("TICKET DE SERVICIO", width / 2, y, { align: "center" });
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`OS-${String(ticket.id).padStart(4, "0")}`, width / 2, y, { align: "center" });
    y += 5;
    pdf.setDrawColor(120);
    pdf.line(margin, y, width - margin, y);
    y += 7;
    pdf.addImage(qrData, "PNG", (width - 36) / 2, y, 36, 36);
    y += 42;
    for (const [label, value] of pdfRows) {
      pdf.setFont("helvetica", "bold");
      pdf.text(`${label}:`, margin, y);
      y += 4.5;
      pdf.setFont("helvetica", "normal");
      const lines = pdf.splitTextToSize(String(value || "-"), textWidth);
      pdf.text(lines, margin, y);
      y += lines.length * 4.2 + 3;
    }
    pdf.setFontSize(8);
    pdf.text("Escanea el QR para consultar el estado actualizado", width / 2, Math.min(y + 2, height - 5), { align: "center", maxWidth: textWidth });
    pdf.save(`ticket-OS-${String(ticket.id).padStart(4, "0")}.pdf`);
  }

  return <main className={`public-ticket ticket-paper-${paperWidth}`}>
    <div className="ticket-tools no-print"><button className="button ghost" onClick={() => { window.location.href = "/"; }}><ArrowLeft size={16} /> Volver</button><label>Impresora<select value={paperWidth} onChange={(event) => setPaperWidth(event.target.value)}><option value="80">Térmica 80 mm</option><option value="58">Térmica 58 mm</option></select></label><button className="button secondary" onClick={downloadPdf}><Download size={16} /> Descargar PDF</button><button className="button primary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button></div>
    <article className="service-ticket">
      <div className="public-ticket-heading"><div><span className="eyebrow">TALLER NORTE</span><h1>Estado de servicio</h1><p className="ticket-number">OS-{String(ticket.id).padStart(4, "0")}</p></div>{qr && <img className="ticket-qr" src={qr} alt="Código QR del ticket" />}</div>
      <div className="ticket-status"><ShieldCheck size={18} /><span>Estado actual</span><strong>{ticket.estado}</strong></div>
      <div className="ticket-grid">
        <div><span>Vehículo</span><strong>{ticket.marca} {ticket.modelo}</strong></div>
        <div><span>Placa</span><strong>{ticket.placa}</strong></div>
        <div><span>Servicio</span><strong>{ticket.servicio}</strong></div>
        <div><span>Fecha de ingreso</span><strong>{String(ticket.fecha_ingreso).slice(0, 10)}</strong></div>
        <div><span>Kilometraje al ingreso</span><strong>{Number(ticket.kilometraje || 0).toLocaleString("es-GT")} km</strong></div>
        <div><span>Próximo servicio estimado</span><strong>{ticket.fecha_proximo_servicio ? String(ticket.fecha_proximo_servicio).slice(0, 10) : "No estimada"}</strong></div>
        <div><span>Prioridad</span><strong>{ticket.prioridad}</strong></div>
        <div><span>Costo</span><strong>Q {Number(ticket.costo || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
      </div>
      <p>{ticket.descripcion}</p><footer>Escanea el QR para consultar el estado actualizado de tu servicio.</footer>
    </article>
  </main>;
}
