import fs from "fs";
import path from "path";

const DATA_DIR = "./data";
const ABTEILUNGEN = ["Leitstand", "Technik", "IT", "Betrieb"];
const TYPEN = ["tasks", "meldungen"];

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log("📁 Ordner 'data' wurde erstellt.");
}

ABTEILUNGEN.forEach((abteilung) => {
  TYPEN.forEach((typ) => {
    const datei = path.join(DATA_DIR, `${abteilung}_${typ}.json`);
    if (!fs.existsSync(datei)) {
      fs.writeFileSync(datei, "[]", "utf-8");
      console.log(`✅ Datei erstellt: ${datei}`);
    }
  });
});
