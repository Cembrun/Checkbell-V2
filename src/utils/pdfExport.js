
import jsPDF from "jspdf";
import { loadImageAsDataURL } from "../utils/image";

// Export a single Meldung/Task as PDF, including images
export async function exportSinglePDFWithImages(item) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 15;
  doc.setFontSize(18);
  doc.text(`Meldung/Task: ${item.titel ?? ''}`, 12, y);
  y += 10;
  doc.setFontSize(12);
  // Tabelle für Felder
  const fields = [
    ["Kategorie", item.kategorie ?? ""],
    ["Beschreibung", item.beschreibung ?? ""],
    ["Status", item.status ?? ""],
    ["Priorität", item.priorität ?? ""],
    ["Erstellt Am", item.erstelltAm ?? ""],
    ["Erstellt Von", item.erstelltVon ?? ""],
    item.zielAbteilung ? ["Ziel-Abteilung", item.zielAbteilung] : null,
    item.quelleAbteilung ? ["Quelle-Abteilung", item.quelleAbteilung] : null,
    item.dueDate ? ["Fällig am", item.dueDate] : null,
  ].filter(Boolean);
  // Tabellenlayout
  const labelWidth = 40;
  const valueWidth = 150;
  for (const [label, value] of fields) {
    doc.setFont(undefined, "bold");
    doc.text(label + ":", 12, y, { maxWidth: labelWidth });
    doc.setFont(undefined, "normal");
    doc.text(String(value), 12 + labelWidth, y, { maxWidth: valueWidth });
    y += 8;
  }
  // Notizen als eigene Box
  if (Array.isArray(item.notizen) && item.notizen.length > 0) {
    y += 2;
    doc.setFont(undefined, "bold");
    doc.text("Notizen:", 12, y);
    doc.setFont(undefined, "normal");
    y += 6;
    for (const n of item.notizen) {
      doc.text(`- ${n.autor} (${n.zeit}): ${n.text}`, 15, y, { maxWidth: 170 });
      y += 7;
    }
  }
  // Anhänge (Bilder groß, andere als Link)
  if (Array.isArray(item.anhaenge) && item.anhaenge.length > 0) {
    y += 6;
    doc.setFont(undefined, "bold");
    doc.text("Anhänge:", 12, y);
    doc.setFont(undefined, "normal");
    y += 6;
    let imgCount = 0;
    for (const anh of item.anhaenge) {
      let url = anh.url;
      if (url && !/^https?:\/\//.test(url)) {
        url = window.location.origin + url;
      }
      if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(url)) {
        try {
          const dataUrl = await loadImageAsDataURL(url);
          doc.addImage(dataUrl, "JPEG", 20, y, 80, 50);
          doc.text(anh.name, 102, y + 7);
          y += 55;
          imgCount++;
          if (imgCount % 2 === 0) {
            doc.addPage();
            y = 15;
          }
        } catch (e) {
          doc.text(`(Bild konnte nicht geladen werden: ${anh.name})`, 20, y);
          y += 8;
        }
      } else {
        doc.text(`Datei: ${anh.name} (${anh.type})`, 20, y);
        y += 8;
      }
    }
  }
  doc.save(`meldung_${item.id || Date.now()}.pdf`);
}
