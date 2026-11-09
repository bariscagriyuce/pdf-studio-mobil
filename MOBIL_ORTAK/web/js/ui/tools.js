// Araç tanımları. Masaüstündeki ui/tools.py ile aynı araç kümesi ve adlar;
// mobilde alt çubukta kategorilere ayrılır.

export const T = {
  SELECT: "select", PAN: "pan", TEXT_EDIT: "text_edit", TEXT_ADD: "text_add",
  HIGHLIGHT: "highlight", UNDERLINE: "underline", STRIKEOUT: "strikeout", SQUIGGLY: "squiggly",
  NOTE: "note", FREETEXT: "freetext", INK: "ink", ERASER: "eraser", RECT: "rect", ELLIPSE: "ellipse",
  LINE: "line", ARROW: "arrow", POLYGON: "polygon", IMAGE: "image", SIGNATURE: "signature",
  STAMP: "stamp", LINK: "link", REDACT: "redact", ERASE_AREA: "erase_area", CROP: "crop",
  FORM_TEXT: "form_text", FORM_CHECK: "form_check", MEASURE: "measure", PRINT_AREA: "print_area",
};

/** Sürükleyerek dikdörtgen çizen araçlar */
export const RECT_TOOLS = new Set([T.FREETEXT, T.RECT, T.ELLIPSE, T.IMAGE, T.SIGNATURE, T.STAMP, T.LINK, T.REDACT, T.CROP, T.TEXT_ADD, T.ERASE_AREA, T.FORM_TEXT, T.FORM_CHECK, T.PRINT_AREA]);
/** İki nokta arasında çizgi çizen araçlar */
export const LINE_TOOLS = new Set([T.LINE, T.ARROW, T.MEASURE]);
/** Metin seçimi gerektiren araçlar */
export const MARKUP_TOOLS = new Set([T.HIGHLIGHT, T.UNDERLINE, T.STRIKEOUT, T.SQUIGGLY]);
/** Dokunmayla kaydırma yerine çizim yapan araçlar (iki parmakla kaydırılır) */
export const DRAW_TOOLS = new Set([...RECT_TOOLS, ...LINE_TOOLS, ...MARKUP_TOOLS, T.INK, T.POLYGON]);
/** Dokunulunca boyut vermeden varsayılan kutu açan araçlar */
export const TAP_SIZES = {
  [T.FREETEXT]: [200, 40], [T.STAMP]: [150, 45], [T.IMAGE]: [160, 160], [T.SIGNATURE]: [180, 70],
  [T.FORM_TEXT]: [180, 24], [T.FORM_CHECK]: [16, 16], [T.TEXT_ADD]: [260, 40], [T.RECT]: [120, 80], [T.ELLIPSE]: [120, 80],
};

export const LABELS = {
  select: "Seç / Düzenle", pan: "Kaydır (el)", text_edit: "Metni düzenle", text_add: "Metin ekle",
  highlight: "Vurgula", underline: "Altını çiz", strikeout: "Üstünü çiz", squiggly: "Dalgalı çiz",
  note: "Yapışkan not", freetext: "Metin kutusu (açıklama)", ink: "Serbest çizim", eraser: "Açıklama sil",
  rect: "Dikdörtgen", ellipse: "Elips", line: "Çizgi", arrow: "Ok", polygon: "Çokgen",
  image: "Görüntü ekle", signature: "İmza yerleştir", stamp: "Damga", link: "Bağlantı",
  redact: "Karart (redaksiyon)", erase_area: "Alanı sil", crop: "Kırp", form_text: "Form: metin kutusu",
  form_check: "Form: onay kutusu", measure: "Ölç", print_area: "Alanı yazdır",
};

export const SHORT = {
  select: "Seç", pan: "Kaydır", text_edit: "Metni düzenle", text_add: "Metin ekle", highlight: "Vurgula",
  underline: "Altı çizili", strikeout: "Üstü çizili", squiggly: "Dalgalı", note: "Not", freetext: "Metin kutusu",
  ink: "Kalem", eraser: "Silgi", rect: "Dikdörtgen", ellipse: "Elips", line: "Çizgi", arrow: "Ok",
  polygon: "Çokgen", image: "Görüntü", signature: "İmza", stamp: "Damga", link: "Bağlantı", redact: "Karart",
  erase_area: "Alanı sil", crop: "Kırp", form_text: "Metin alanı", form_check: "Onay kutusu", measure: "Ölç", print_area: "Alanı yazdır",
};

export const ICONS = {
  select: "select", pan: "hand", text_edit: "text-edit", text_add: "text-add", highlight: "highlight",
  underline: "underline", strikeout: "strikeout", squiggly: "squiggly", note: "note", freetext: "comment",
  ink: "pen", eraser: "eraser", rect: "rect", ellipse: "ellipse", line: "line", arrow: "arrow",
  polygon: "polygon", image: "image", signature: "signature", stamp: "stamp", link: "link", redact: "redact",
  erase_area: "eraser", crop: "crop", form_text: "form", form_check: "check", measure: "measure", print_area: "print-area",
};

export const HINTS = {
  select: "Açıklama, görüntü ya da form alanına dokunun. Metin seçmek için basılı tutup sürükleyin.",
  pan: "Sayfaları kaydırın; iki parmakla yakınlaştırın.",
  text_edit: "Bir metin bloğuna dokunun; içeriği, punto ve rengi düzenleyin.",
  text_add: "Sayfada bir kutu çizin (ya da dokunun) ve yeni metni yazın — sayfa içeriğine işlenir.",
  highlight: "Vurgulamak istediğiniz metnin üzerinde parmağınızı sürükleyin.",
  underline: "Altını çizmek istediğiniz metnin üzerinde sürükleyin.",
  strikeout: "Üstünü çizmek istediğiniz metnin üzerinde sürükleyin.",
  squiggly: "Dalgalı çizgi için metnin üzerinde sürükleyin.",
  note: "Notun duracağı yere dokunun.",
  freetext: "Kutu çizin ya da dokunun, sonra metni yazın.",
  ink: "Parmağınızla ya da kalemle çizin; iki parmakla sayfayı kaydırın.",
  eraser: "Silmek istediğiniz açıklamaya dokunun.",
  rect: "Dikdörtgeni sürükleyerek çizin.", ellipse: "Elipsi sürükleyerek çizin.",
  line: "Çizgiyi sürükleyerek çizin.", arrow: "Oku sürükleyerek çizin.",
  polygon: "Köşelere sırayla dokunun; bitirmek için “Bitti”ye basın.",
  image: "Görüntünün yerini çizin ya da dokunun.",
  signature: "İmzanın yerini çizin ya da dokunun.",
  stamp: "Damganın yerini çizin ya da dokunun (türü ayarlardan seçilir).",
  link: "Bağlantı alanını çizin.",
  redact: "Alanları işaretleyin, sonra “Karartmaları uygula” deyin — içerik kalıcı silinir.",
  erase_area: "Silinecek alanı çizin; o alandaki metin/grafik kalıcı kaldırılır.",
  crop: "Yeni sayfa sınırını çizin.",
  form_text: "Metin alanının yerini çizin ya da dokunun.",
  form_check: "Onay kutusunun yerine dokunun.",
  measure: "Ölçmek için iki nokta arasında sürükleyin.",
  print_area: "Yazdırmak istediğiniz alanı çizin; yalnızca o bölge basılır.",
};

/** Alt çubuk kategorileri. Öğeler araç adı ya da "cmd:komut" olabilir. */
export const CATEGORIES = [
  { id: "view", label: "Görüntüle", items: ["select", "pan", "print_area", "cmd:print", "cmd:zoom_out", "cmd:zoom_in", "cmd:fit_width", "cmd:fit_page", "cmd:layout", "cmd:theme"] },
  { id: "edit", label: "Düzenle", items: ["text_edit", "text_add", "erase_area", "image", "link", "cmd:find_replace"] },
  { id: "comment", label: "Açıklama", items: ["highlight", "underline", "strikeout", "squiggly", "note", "freetext", "stamp", "eraser"] },
  { id: "draw", label: "Çiz", items: ["ink", "rect", "ellipse", "line", "arrow", "polygon", "measure"] },
  { id: "pages", label: "Sayfalar", items: ["cmd:page_insert", "cmd:page_delete", "cmd:page_dup", "cmd:rot_left", "cmd:rot_right", "crop", "cmd:page_extract", "cmd:merge", "cmd:split", "cmd:images_as_pages"] },
  { id: "form", label: "Form", items: ["form_text", "form_check", "cmd:forms_panel", "cmd:form_export", "cmd:form_import", "cmd:form_flatten"] },
  { id: "protect", label: "Koru", items: ["redact", "cmd:apply_redactions", "signature", "cmd:encrypt", "cmd:decrypt", "cmd:sanitize"] },
];

export const TOOL_KEYS = {
  v: T.SELECT, h: T.PAN, e: T.TEXT_EDIT, t: T.TEXT_ADD, d: T.INK, r: T.RECT, l: T.LINE, a: T.ARROW,
  n: T.NOTE, s: T.SIGNATURE, i: T.IMAGE, k: T.LINK, c: T.CROP, m: T.MEASURE,
};
