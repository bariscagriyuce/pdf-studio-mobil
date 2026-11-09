// Uygulama adı — tek kaynak (masaüstündeki pdfstudio/branding.py karşılığı).
// Görünen ad seçili arayüz diline göre belirlenir. Teknik kimlikler (paket kimliği
// com.pdfstudio.mobile, ayar anahtarları, köprü adları) bilerek değişmez:
// değişirlerse 1.0.0'ın üzerine güncelleme yerine ikinci bir kopya kurulur
// ve kullanıcının ayarları kaybolur.

import { currentLanguage } from "./i18n.js";

export const APP_NAME_TR = "YUCE PDF Düzenleyici";
export const APP_NAME_EN = "YUCE PDF EDITOR";

/** Dağıtılan dosyaların adı: YUCE-PDF-Editor-1.2.3.apk vb. */
export const FILE_STEM = "YUCE-PDF-Editor";

/** Türkçe arayüzde "YUCE PDF Düzenleyici", diğer dillerde "YUCE PDF EDITOR".
 *  Masaüstündeki gibi seçili arayüz dilini izler (Görünüm → Dil). */
export function appName(lang = currentLanguage()) {
  return lang.startsWith("tr") ? APP_NAME_TR : APP_NAME_EN;
}
