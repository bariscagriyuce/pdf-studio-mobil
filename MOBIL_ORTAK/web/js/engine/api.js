// Motorun dışarıya açılan yüzü. Worker (tarayıcı) ve sınama (Node) bu tabloyu
// kullanır; arayüz yalnızca buradaki adlarla konuşur. Tüm dönüş değerleri
// yapılandırılmış kopyalamaya (postMessage) uygun sade nesnelerdir.

import { Engine } from "./engine.js";
import * as TE from "./textedit.js";
import * as AN from "./annots.js";
import * as IM from "./images.js";
import * as FO from "./forms.js";
import * as PO from "./pageops.js";
import * as SE from "./security.js";
import * as EX from "./exporting.js";
import { BUNDLED, BASE14_FAMILIES } from "./fonts.js";
import { makeZip } from "./zip.js";

const bind = (E, mod, names) => Object.fromEntries(names.map((n) => [n, (...a) => mod[n](E, ...a)]));

export function createApi(options) {
  const E = new Engine(options);
  const api = {
    // ---------------------------------------------------------- belge
    open: (bytes, name, password) => E.open(bytes, name, password),
    newBlank: (w, h, n) => E.newBlank(w, h, n),
    newFromImages: (files) => E.newFromImages(files),
    close: () => E.close(),
    info: () => E.info(),
    state: () => E.state(),
    save: (options) => E.save(options),
    exportBytes: (options) => E.exportBytes(options),
    markSaved: (name) => E.markSaved(name),
    undo: () => E.undo(),
    redo: () => E.redo(),
    pageSizes: () => E.pageSizes(),
    render: (pno, scale, clip, opts) => E.render(pno, scale, clip, opts),
    thumbnail: (pno, max) => E.thumbnail(pno, max),
    renderImage: (pno, opts) => E.renderImage(pno, opts),
    getMetadata: () => E.getMetadata(),
    setMetadata: (m) => E.setMetadata(m),
    getToc: () => E.getToc(),
    setToc: (t) => E.setToc(t),
    permissions: () => E.permissions(),
    hasForm: () => E.hasForm(),

    // ------------------------------------------------------ yazı tipleri
    fontFamilies: () => E.fonts.families(),
    userFonts: () => E.fonts.userFonts(),
    registerFont: (id, bytes) => E.fonts.registerUserFont(id, bytes),

    // ------------------------------------------------------------ metin
    ...bind(E, TE, [
      "textBlocks", "blockAt", "lineAt", "words", "wordsInRect", "selection", "rectText", "pageFullText",
      "replaceRegionText", "previewReplace", "insertTextBox", "deleteTextRegion", "redactAreas",
      "findAll", "replaceAll",
    ]),
    // ----------------------------------------------------- açıklamalar
    ...bind(E, AN, [
      "listAnnots", "allAnnots", "annotAt", "addMarkup", "addStickyNote", "addFreeText", "addInk",
      "addShape", "addPolygon", "addStamp", "addCaret", "addFileAttachment", "attachmentData",
      "addLink", "listLinks", "deleteLink", "deleteAnnot", "deleteAnnots", "clearAnnots",
      "updateAnnot", "moveAnnot", "resizeAnnot", "flatten",
    ]),
    // ------------------------------------------------------- görüntüler
    ...bind(E, IM, [
      "listImages", "allImages", "imageAt", "extractImage", "extractAllImages", "placeImage",
      "deleteImage", "replaceImage", "moveResizeImage",
    ]),
    // ----------------------------------------------------------- formlar
    ...bind(E, FO, [
      "listFields", "fieldAt", "setValue", "setValues", "exportValues", "exportJson", "importJson",
      "addField", "deleteField", "flattenForms",
    ]),
    // ------------------------------------------------------------ sayfa
    ...bind(E, PO, [
      "insertBlank", "duplicatePages", "deletePages", "reorderPages", "movePages", "reversePages",
      "rotatePages", "setRotation", "cropPages", "resetCrop", "resizePages", "mergeFiles",
      "insertImagesAsPages", "extractPages", "splitByRanges", "splitEvery", "addTextWatermark",
      "addImageWatermark", "addPageNumbers", "addHeaderFooter",
    ]),
    // ---------------------------------------------------------- güvenlik
    ...bind(E, SE, ["currentPermissions", "saveEncrypted", "saveDecrypted", "sanitize", "documentReport"]),
    // ------------------------------------------------------ dışa aktarma
    ...bind(E, EX, ["exportImages", "exportText", "exportPdfSubset", "compress", "ocrImage", "applyOcr"]),

    zip: (files) => makeZip(files),

    constants: () => ({
      stamps: AN.STAMP_TEXTS, stampLabels: AN.STAMP_LABELS, noteIcons: AN.NOTE_ICONS,
      freeTextFonts: Object.keys(AN.FREE_TEXT_FONTS), typeNames: AN.TYPE_NAMES,
      pagePresets: PO.PAGE_PRESETS, permissions: SE.PERMISSIONS, methods: SE.METHODS,
      textModes: EX.TEXT_MODES, imageFormats: EX.IMAGE_FORMATS, fieldTypes: FO.FIELD_TYPE_NAMES,
      bundledFamilies: [...new Set(BUNDLED.map((f) => f.family))], base14: BASE14_FAMILIES,
    }),
  };
  return { api, engine: E };
}

/** Değiştirici çağrılardan sonra arayüze gönderilecek özet. */
export function takeChange(E) {
  const change = E.change;
  E.change = null;
  return { state: E.state(), change };
}
