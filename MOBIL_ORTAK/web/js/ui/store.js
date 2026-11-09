// Kalıcı ayarlar (tema, araç ayarları, son kullanılanlar, imza...). Tarayıcı
// deposu kullanılamazsa bellekte çalışır.

const KEY = "pdfstudio.settings.v1";

const DEFAULTS = {
  theme: "system",
  language: "system", // "system" | "tr" | "en" | "pt_BR"
  layout: "continuous",
  showTextBoxes: false,
  author: "",
  tool: {
    color: [0.9, 0.16, 0.16],
    fill: null,
    textColor: [0, 0, 0],
    highlightColor: [1, 0.9, 0.25],
    width: 2,
    opacity: 1,
    fontsize: 12,
    fontFamily: "Helvetica",
    bold: false,
    italic: false,
    align: 0,
    lineSpacing: 1.15,
    noteIcon: "Note",
    stampIndex: 0,
    redactFill: [0, 0, 0],
    polygonClosed: true,
  },
  recent: [],
  signature: null, // PNG, base64
  searchCase: false,
  searchWhole: false,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...data, tool: { ...DEFAULTS.tool, ...(data.tool || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const settings = load();

let timer = null;
export function saveSettings() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* depolama yok ya da dolu */
    }
  }, 250);
}

export function addRecent(entry) {
  if (!entry || !entry.handle) return;
  settings.recent = [entry, ...settings.recent.filter((r) => r.handle !== entry.handle)].slice(0, 12);
  saveSettings();
}

export function removeRecent(handle) {
  settings.recent = settings.recent.filter((r) => r.handle !== handle);
  saveSettings();
}
