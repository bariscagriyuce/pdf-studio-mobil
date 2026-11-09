// Araç tanımları. Masaüstündeki ui/tools.py ile aynı araç kümesi ve adlar;
// mobilde alt çubukta kategorilere ayrılır. Metinler N_() ile işaretlidir;
// gösterilirken t() ile çevrilir (dil anında değişebilsin).

import { N_ } from "../i18n.js";

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
  select: N_("Seç / Düzenle"), pan: N_("Kaydır (el)"), text_edit: N_("Metni düzenle"), text_add: N_("Metin ekle"),
  highlight: N_("Vurgula"), underline: N_("Altını çiz"), strikeout: N_("Üstünü çiz"), squiggly: N_("Dalgalı çiz"),
  note: N_("Yapışkan not"), freetext: N_("Metin kutusu (açıklama)"), ink: N_("Serbest çizim"), eraser: N_("Açıklama sil"),
  rect: N_("Dikdörtgen"), ellipse: N_("Elips"), line: N_("Çizgi"), arrow: N_("Ok"), polygon: N_("Çokgen"),
  image: N_("Görüntü ekle"), signature: N_("İmza yerleştir"), stamp: N_("Damga"), link: N_("Bağlantı"),
  redact: N_("Karart (redaksiyon)"), erase_area: N_("Alanı sil"), crop: N_("Kırp"), form_text: N_("Form: metin kutusu"),
  form_check: N_("Form: onay kutusu"), measure: N_("Ölç"), print_area: N_("Alanı yazdır"),
};

export const SHORT = {
  select: N_("Seç"), pan: N_("Kaydır"), text_edit: N_("Metni düzenle"), text_add: N_("Metin ekle"), highlight: N_("Vurgula"),
  underline: N_("Altı çizili"), strikeout: N_("Üstü çizili"), squiggly: N_("Dalgalı"), note: N_("Not"), freetext: N_("Metin kutusu"),
  ink: N_("Kalem"), eraser: N_("Silgi"), rect: N_("Dikdörtgen"), ellipse: N_("Elips"), line: N_("Çizgi"), arrow: N_("Ok"),
  polygon: N_("Çokgen"), image: N_("Görüntü"), signature: N_("İmza"), stamp: N_("Damga"), link: N_("Bağlantı"), redact: N_("Karart"),
  erase_area: N_("Alanı sil"), crop: N_("Kırp"), form_text: N_("Metin alanı"), form_check: N_("Onay kutusu"), measure: N_("Ölç"), print_area: N_("Alanı yazdır"),
};

export const ICONS = {
  select: "select", pan: "hand", text_edit: "text-edit", text_add: "text-add", highlight: "highlight",
  underline: "underline", strikeout: "strikeout", squiggly: "squiggly", note: "note", freetext: "comment",
  ink: "pen", eraser: "eraser", rect: "rect", ellipse: "ellipse", line: "line", arrow: "arrow",
  polygon: "polygon", image: "image", signature: "signature", stamp: "stamp", link: "link", redact: "redact",
  erase_area: "eraser", crop: "crop", form_text: "form", form_check: "check", measure: "measure", print_area: "print-area",
};

export const HINTS = {
  select: N_("Açıklama, görüntü ya da form alanına dokunun. Metin seçmek için basılı tutup sürükleyin."),
  pan: N_("Sayfaları kaydırın; iki parmakla yakınlaştırın."),
  text_edit: N_("Bir metin bloğuna dokunun; içeriği, punto ve rengi düzenleyin."),
  text_add: N_("Sayfada bir kutu çizin (ya da dokunun) ve yeni metni yazın — sayfa içeriğine işlenir."),
  highlight: N_("Vurgulamak istediğiniz metnin üzerinde parmağınızı sürükleyin."),
  underline: N_("Altını çizmek istediğiniz metnin üzerinde sürükleyin."),
  strikeout: N_("Üstünü çizmek istediğiniz metnin üzerinde sürükleyin."),
  squiggly: N_("Dalgalı çizgi için metnin üzerinde sürükleyin."),
  note: N_("Notun duracağı yere dokunun."),
  freetext: N_("Kutu çizin ya da dokunun, sonra metni yazın."),
  ink: N_("Parmağınızla ya da kalemle çizin; iki parmakla sayfayı kaydırın."),
  eraser: N_("Silmek istediğiniz açıklamaya dokunun."),
  rect: N_("Dikdörtgeni sürükleyerek çizin."), ellipse: N_("Elipsi sürükleyerek çizin."),
  line: N_("Çizgiyi sürükleyerek çizin."), arrow: N_("Oku sürükleyerek çizin."),
  polygon: N_("Köşelere sırayla dokunun; bitirmek için “Bitti”ye basın."),
  image: N_("Görüntünün yerini çizin ya da dokunun."),
  signature: N_("İmzanın yerini çizin ya da dokunun."),
  stamp: N_("Damganın yerini çizin ya da dokunun (türü ayarlardan seçilir)."),
  link: N_("Bağlantı alanını çizin."),
  redact: N_("Alanları işaretleyin, sonra “Karartmaları uygula” deyin — içerik kalıcı silinir."),
  erase_area: N_("Silinecek alanı çizin; o alandaki metin/grafik kalıcı kaldırılır."),
  crop: N_("Yeni sayfa sınırını çizin."),
  form_text: N_("Metin alanının yerini çizin ya da dokunun."),
  form_check: N_("Onay kutusunun yerine dokunun."),
  measure: N_("Ölçmek için iki nokta arasında sürükleyin."),
  print_area: N_("Yazdırmak istediğiniz alanı çizin; yalnızca o bölge basılır."),
};

/** Alt çubuk kategorileri. Öğeler araç adı ya da "cmd:komut" olabilir. */
export const CATEGORIES = [
  { id: "view", label: N_("Görüntüle"), items: ["select", "pan", "print_area", "cmd:print", "cmd:zoom_out", "cmd:zoom_in", "cmd:fit_width", "cmd:fit_page", "cmd:layout", "cmd:theme"] },
  { id: "edit", label: N_("Düzenle"), items: ["text_edit", "text_add", "erase_area", "image", "link", "cmd:find_replace"] },
  { id: "comment", label: N_("Açıklama"), items: ["highlight", "underline", "strikeout", "squiggly", "note", "freetext", "stamp", "eraser"] },
  { id: "draw", label: N_("Çiz"), items: ["ink", "rect", "ellipse", "line", "arrow", "polygon", "measure"] },
  { id: "pages", label: N_("Sayfalar"), items: ["cmd:page_insert", "cmd:page_delete", "cmd:page_dup", "cmd:rot_left", "cmd:rot_right", "crop", "cmd:page_extract", "cmd:merge", "cmd:split", "cmd:images_as_pages"] },
  { id: "form", label: N_("Form"), items: ["form_text", "form_check", "cmd:forms_panel", "cmd:form_export", "cmd:form_import", "cmd:form_flatten"] },
  { id: "protect", label: N_("Koru"), items: ["redact", "cmd:apply_redactions", "signature", "cmd:encrypt", "cmd:decrypt", "cmd:sanitize"] },
];

export const TOOL_KEYS = {
  v: T.SELECT, h: T.PAN, e: T.TEXT_EDIT, t: T.TEXT_ADD, d: T.INK, r: T.RECT, l: T.LINE, a: T.ARROW,
  n: T.NOTE, s: T.SIGNATURE, i: T.IMAGE, k: T.LINK, c: T.CROP, m: T.MEASURE,
};
