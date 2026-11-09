// Uygulama adı — tek kaynak (masaüstündeki pdfstudio/branding.py karşılığı).
// Görünen ad cihaz diline göre seçilir. Teknik kimlikler (paket kimliği
// com.pdfstudio.mobile, ayar anahtarları, köprü adları) bilerek değişmez:
// değişirlerse 1.0.0'ın üzerine güncelleme yerine ikinci bir kopya kurulur
// ve kullanıcının ayarları kaybolur.

export const APP_NAME_TR = "YUCE PDF Düzenleyici";
export const APP_NAME_EN = "YUCE PDF EDITOR";

/** Dağıtılan dosyaların adı: YUCE-PDF-Editor-1.2.3.apk vb. */
export const FILE_STEM = "YUCE-PDF-Editor";

export function appName() {
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  return (langs[0] || "").toLowerCase().startsWith("tr") ? APP_NAME_TR : APP_NAME_EN;
}
