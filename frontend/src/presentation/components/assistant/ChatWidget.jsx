import { useEffect, useRef, useState } from "react";
import { Bot, Check, Download, FileSpreadsheet, FileText, Send, X } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { assistantService } from "../../../application/services/assistantService";
import { inventoryService } from "../../../application/services/inventoryService";
import { orderService } from "../../../application/services/orderService";
import { ownerService } from "../../../application/services/ownerService";

const actionRunners = {
  crear_propietario: (token, payload) => ownerService.create(token, payload),
  crear_orden: (token, payload) => orderService.save(token, payload),
  crear_articulo: (token, payload) => inventoryService.saveArticle(token, payload),
};

const WELCOME = {
  role: "model",
  text: "Hola, soy el asistente de Taller Norte. Puedes preguntarme por órdenes, inventario y recordatorios, pedirme que registre algo o solicitar reportes en PDF y Excel.",
};

export function ChatWidget({ token, onDataChanged }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function sendMessage(text, history) {
    const content = String(text || "").trim();
    if (!content || loading) return;
    const next = [...history, { role: "user", text: content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await assistantService.chat(token, next);
      setMessages([...next, { role: "model", text: reply.text, pendingAction: reply.pendingAction || null, reportRequest: reply.reportRequest || null }]);
    } catch (error) {
      setMessages([...next, { role: "model", text: `No pude procesar tu consulta: ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction(message) {
    const runner = actionRunners[message.pendingAction?.type];
    if (!runner) return;
    const settled = messages.map((item) => (item === message ? { ...item, pendingAction: null } : item));
    setMessages(settled);
    setLoading(true);
    try {
      await runner(token, message.pendingAction.payload);
      onDataChanged?.();
      setLoading(false);
      await sendMessage(`Confirmé la acción: ${message.pendingAction.summary}. Ya quedó registrada en el sistema.`, settled);
    } catch (error) {
      setMessages([...settled, { role: "model", text: `No se pudo registrar: ${error.message}` }]);
      setLoading(false);
    }
  }

  function cancelAction(message) {
    setMessages(messages.map((item) => (item === message ? { ...item, pendingAction: null, text: `${item.text}\n\nAcción cancelada.` } : item)));
  }

  function downloadReport(message) {
    const report = message.reportRequest;
    if (!report?.columns?.length || !Array.isArray(report.rows)) return;
    const fileName = `reporte-${report.fileName || "sistema"}`;
    if (report.format === "EXCEL") {
      const worksheet = XLSX.utils.aoa_to_sheet([
        [report.title],
        [report.period || ""],
        [],
        report.columns,
        ...report.rows,
        [],
        [report.total || ""],
      ]);
      worksheet["!cols"] = report.columns.map((column, index) => ({
        wch: Math.max(String(column).length + 2, ...report.rows.slice(0, 200).map((row) => String(row[index] ?? "").length + 2), 10),
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
    } else {
      const doc = new jsPDF({ orientation: report.columns.length > 7 ? "landscape" : "portrait" });
      doc.setFontSize(14);
      doc.text("Taller Norte · Control de mantenimiento", 14, 14);
      doc.setFontSize(11);
      doc.text(`Reporte: ${report.title}`, 14, 21);
      doc.setFontSize(9);
      doc.text(`${report.period || "Reporte actual"} · Generado: ${new Date().toLocaleString("es-GT")}`, 14, 27);
      autoTable(doc, {
        head: [report.columns],
        body: report.rows.map((row) => row.map((cell) => String(cell ?? ""))),
        startY: 32,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 46, 37] },
      });
      doc.setFontSize(10);
      doc.text(String(report.total || ""), 14, (doc.lastAutoTable?.finalY || 32) + 8);
      doc.save(`${fileName}.pdf`);
    }
    setMessages((current) => current.map((item) => item === message ? { ...item, reportRequest: null, text: `${item.text}\n\nReporte descargado.` } : item));
  }

  return <>
    {open && <div className="chat-panel">
      <div className="chat-header"><div className="chat-title"><Bot size={18} /><div><strong>Asistente IA</strong><span>Taller Norte</span></div></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Cerrar asistente"><X size={18} /></button></div>
      <div className="chat-messages">
        {messages.map((message, index) => <div key={index} className={`chat-msg ${message.role}`}>
          {message.text}
          {message.pendingAction && <div className="chat-action"><p>{message.pendingAction.summary}</p><div className="chat-action-buttons"><button className="button primary" disabled={loading} onClick={() => confirmAction(message)}><Check size={15} /> Confirmar</button><button className="button ghost" disabled={loading} onClick={() => cancelAction(message)}>Cancelar</button></div></div>}
          {message.reportRequest && <div className="chat-action"><p>{message.reportRequest.title} · {message.reportRequest.total}</p><div className="chat-action-buttons"><button className="button primary" onClick={() => downloadReport(message)}>{message.reportRequest.format === "EXCEL" ? <FileSpreadsheet size={15} /> : <FileText size={15} />}<Download size={15} /> Descargar {message.reportRequest.format}</button></div></div>}
        </div>)}
        {loading && <div className="chat-msg model">Escribiendo...</div>}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input" onSubmit={(event) => { event.preventDefault(); sendMessage(input, messages); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Escribe tu consulta..." disabled={loading} />
        <button className="button primary" disabled={loading || !input.trim()} aria-label="Enviar mensaje"><Send size={16} /></button>
      </form>
    </div>}
    <button className="chat-fab" onClick={() => setOpen(!open)} aria-label="Abrir asistente IA" title="Asistente IA">{open ? <X size={22} /> : <Bot size={22} />}</button>
  </>;
}
