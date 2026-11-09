// Arayüz çevirisi — masaüstündeki pdfstudio/i18n.py ile aynı yaklaşım.
//
// Kaynak dil Türkçedir: koddaki Türkçe metinler aynı zamanda çeviri
// anahtarıdır (gettext). Diğer diller js/locales/<kod>.js içindeki sözlükten
// gelir. Çevirisi olmayan metin Türkçe görünür; arayüz bozulmaz
// (test/i18n.test.mjs eksikleri ve yer tutucu uyumsuzluklarını yakalar).
//
//   t("Kaydet")
//   t("Sayfa {n} / {total}", { n: 3, total: 10 })
//   tn("{n} sayfa", count, { n: count })     // tekil/çoğul
//
// Modül düzeyindeki sabitler (araç adları vb.) çevrilmeden saklanır ve
// gösterilirken t() ile çevrilir; böylece dil anında değiştirilebilir.

import en from "./locales/en.js";
import pt_BR from "./locales/pt_BR.js";

/** Desteklenen diller — adlar kendi dillerinde (kullanıcı tanısın diye) */
export const LANGUAGES = { tr: "Türkçe", en: "English", pt_BR: "Português (Brasil)" };
export const SOURCE_LANGUAGE = "tr";
export const SYSTEM = "system";

const CATALOGS = { en, pt_BR };
const LOCALES = { tr: "tr-TR", en: "en-US", pt_BR: "pt-BR" };

let current = SOURCE_LANGUAGE;
let catalog = {};
let systemOverride = null;

/** Yerel kabuğun bildirdiği gerçek cihaz dili. Android 13+'te uygulamaya dil
 *  atanınca WebView'in navigator.language değeri o dile döner; "sistem"e
 *  geri dönüldüğünde doğru dil buradan okunur. */
export function setSystemLocale(tag) {
  systemOverride = tag || null;
}

/** Cihaz dilini desteklenen bir koda eşler (tr / pt_BR / en). */
export function systemLanguage() {
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  const name = (systemOverride || langs[0] || "").toLowerCase();
  if (name.startsWith("tr")) return "tr";
  if (name.startsWith("pt")) return "pt_BR";
  return "en";
}

export function resolve(pref) {
  return pref in LANGUAGES ? pref : systemLanguage();
}

export function setLanguage(pref) {
  current = resolve(pref);
  catalog = CATALOGS[current] || {};
  document.documentElement.lang = current.replace("_", "-");
  return current;
}

export const currentLanguage = () => current;
export const locale = () => LOCALES[current];

function format(s, params) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m));
}

export function t(text, params) {
  if (!text) return text;
  let value = text;
  if (current !== SOURCE_LANGUAGE) {
    const v = catalog[text];
    value = (v && typeof v === "object" ? v.other : v) || text;
  }
  return format(value, params);
}

/** Sayıya göre tekil/çoğul. Katalog değeri { one, other } olabilir. Türkçede
 *  isim çoğul eki sayıdan sonra kullanılmadığı için kaynak tek biçimlidir. */
export function tn(text, n, params) {
  let value = text;
  if (current !== SOURCE_LANGUAGE) {
    const v = catalog[text];
    if (v && typeof v === "object") {
      // pt_BR'de 0 ve 1 tekil; İngilizcede yalnızca 1
      const one = current === "pt_BR" ? n === 0 || n === 1 : n === 1;
      value = (one ? v.one : v.other) || v.other || text;
    } else {
      value = v || text;
    }
  }
  return format(value, params || { n });
}

/** Ondalık sayı, dilin biçimiyle (2.00 / 2,00) */
export function num(v, digits = 0) {
  return Number(v).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Yüzde, dilin biçimiyle (%100 / 100%) */
export function pct(v) {
  return t("%{0}", { 0: num(v) });
}

/** Çeviri için *işaretler* ama çevirmez (modül sabitleri). Gösterilirken t() ile çevrilir. */
export const N_ = (text) => text;

/** Hata iletisini çevirir. Motor hataları değişken kısımları params ile taşır. */
export function errText(e) {
  if (!e) return "";
  return t(e.message || String(e), e.params);
}
