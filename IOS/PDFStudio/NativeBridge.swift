import UIKit
import UniformTypeIdentifiers
import WebKit

/// JS ↔ iOS köprüsü. Sözleşme MOBIL_ORTAK/web/js/bridge.js başındaki açıklamadadır;
/// Android tarafı (ANDROID/.../NativeBridge.kt) aynısını uygular.
///
/// Dosya tanıtıcısı (handle) güvenlik kapsamlı yer imidir (base64): uygulama
/// yeniden açıldığında da "son kullanılanlar" ve "Kaydet" aynı dosyaya ulaşır.
final class NativeBridge: NSObject, WKScriptMessageHandler, UIDocumentPickerDelegate {
    private weak var controller: WebViewController?
    private(set) var jsReady = false
    private var queued: [[String: Any]] = []

    private var files: [String: URL] = [:]
    private let filesLock = NSLock()

    private struct PendingWrite {
        let url: URL
        let handle: FileHandle
    }
    private var writes: [String: PendingWrite] = [:]
    private let io = DispatchQueue(label: "pdfstudio.io", qos: .userInitiated)

    private var pickCompletion: (([URL]?) -> Void)?

    init(controller: WebViewController) {
        self.controller = controller
        super.init()
    }

    // MARK: - JS girişi

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String,
              let data = text.data(using: .utf8),
              let msg = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        dispatch(msg)
    }

    private func dispatch(_ msg: [String: Any]) {
        let id = msg["id"] as? Int ?? 0
        let cmd = msg["cmd"] as? String ?? ""
        switch cmd {
        case "ready":
            jsReady = true
            queued.forEach { controller?.sendToJs($0) }
            queued.removeAll()
        case "openFiles":
            openFiles(id: id, kind: msg["kind"] as? String ?? "pdf", multiple: msg["multiple"] as? Bool ?? false)
        case "openHandle":
            openHandle(id: id, handle: msg["handle"] as? String ?? "")
        case "writeBegin":
            writeBegin(id: id)
        case "writeChunk":
            writeChunk(id: id, token: msg["token"] as? String ?? "", base64: msg["data"] as? String ?? "")
        case "writeEnd":
            writeEnd(id: id, msg: msg)
        case "openUrl":
            if let s = msg["url"] as? String, let url = URL(string: s) { openExternal(url) }
            reply(id, NSNull())
        case "copyText":
            UIPasteboard.general.string = msg["text"] as? String ?? ""
            reply(id, NSNull())
        case "setTheme":
            controller?.setDarkUi(msg["dark"] as? Bool ?? false)
            reply(id, NSNull())
        case "setDirty", "backResult":
            break // iOS'ta geri tuşu yok; kirli durum bilgisi şimdilik kullanılmıyor
        case "appInfo":
            let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
            reply(id, ["platform": "ios", "version": version, "system": UIDevice.current.systemVersion])
        default:
            if id != 0 { fail(id, "Bilinmeyen komut: \(cmd)") }
        }
    }

    // MARK: - JS çıkışı

    func sendEvent(_ object: [String: Any]) {
        if jsReady { controller?.sendToJs(object) } else { queued.append(object) }
    }

    private func reply(_ id: Int, _ result: Any) {
        guard id != 0 else { return }
        controller?.sendToJs(["id": id, "ok": true, "result": result])
    }

    private func fail(_ id: Int, _ message: String) {
        controller?.sendToJs(["id": id, "ok": false, "error": message])
    }

    // MARK: - Dosya kaydı

    private func register(_ url: URL) -> String {
        let token = UUID().uuidString
        filesLock.lock()
        files[token] = url
        filesLock.unlock()
        return token
    }

    /// Şema işleyicisi (arka plan kuyruğu) belge baytlarını buradan okur
    func fileData(token: String) -> Data? {
        filesLock.lock()
        let url = files[token]
        filesLock.unlock()
        guard let url else { return nil }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var result: Data?
        var error: NSError?
        // iCloud'daki dosyalar gerekirse önce indirilsin
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &error) { u in
            result = try? Data(contentsOf: u)
        }
        return result
    }

    private func bookmark(for url: URL) -> String {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) else { return "" }
        return data.base64EncodedString()
    }

    private func resolve(handle: String) -> URL? {
        guard let data = Data(base64Encoded: handle) else { return nil }
        var stale = false
        return try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
    }

    private func describe(_ url: URL, handle: String? = nil) -> [String: Any] {
        let token = register(url)
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? ""
        return [
            "name": url.lastPathComponent,
            "url": "\(WebViewController.scheme)://app/native/file/\(token)",
            "handle": handle ?? bookmark(for: url),
            "mime": mime,
        ]
    }

    // MARK: - Açma

    private func contentTypes(_ kind: String) -> [UTType] {
        switch kind {
        case "pdf": return [.pdf]
        case "image": return [.image]
        case "json": return [.json, .plainText]
        case "font": return [.font]
        case "doc":
            let extra = ["xps", "oxps", "cbz", "fb2"].compactMap { UTType(filenameExtension: $0) }
            return [.pdf, .image, .epub, .svg] + extra
        default: return [.item]
        }
    }

    private func openFiles(id: Int, kind: String, multiple: Bool) {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: contentTypes(kind), asCopy: false)
        picker.allowsMultipleSelection = multiple
        picker.delegate = self
        pickCompletion = { [weak self] urls in
            guard let self else { return }
            self.reply(id, (urls ?? []).map { self.describe($0) })
        }
        controller?.present(picker, animated: true)
    }

    private func openHandle(id: Int, handle: String) {
        guard let url = resolve(handle: handle) else {
            fail(id, "Dosyaya artık erişilemiyor")
            return
        }
        reply(id, describe(url, handle: handle))
    }

    /// Dosyalar uygulamasından "Birlikte aç" ile gelen belge
    func openIncoming(_ url: URL) {
        sendEvent(["event": "openFile", "file": describe(url)])
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        let done = pickCompletion
        pickCompletion = nil
        done?(urls)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let done = pickCompletion
        pickCompletion = nil
        done?(nil)
    }

    // MARK: - Yazma

    private func writeBegin(id: Int) {
        let token = UUID().uuidString
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("write-\(token)")
        FileManager.default.createFile(atPath: url.path, contents: nil)
        guard let handle = try? FileHandle(forWritingTo: url) else {
            fail(id, "Geçici dosya oluşturulamadı")
            return
        }
        writes[token] = PendingWrite(url: url, handle: handle)
        reply(id, ["token": token])
    }

    private func writeChunk(id: Int, token: String, base64: String) {
        guard let w = writes[token] else {
            fail(id, "Geçersiz yazma belirteci")
            return
        }
        io.async { [weak self] in
            guard let data = Data(base64Encoded: base64) else {
                DispatchQueue.main.async { self?.fail(id, "Bozuk veri") }
                return
            }
            w.handle.write(data)
            DispatchQueue.main.async { self?.reply(id, NSNull()) }
        }
    }

    private func sanitize(_ name: String) -> String {
        let bad = CharacterSet(charactersIn: "/\\:*?\"<>|")
        let clean = name.components(separatedBy: bad).joined(separator: "_")
        return clean.isEmpty ? "belge.pdf" : clean
    }

    private func writeEnd(id: Int, msg: [String: Any]) {
        guard let token = msg["token"] as? String, let w = writes.removeValue(forKey: token) else {
            fail(id, "Geçersiz yazma belirteci")
            return
        }
        let mode = msg["mode"] as? String ?? "saveAs"
        let name = sanitize(msg["name"] as? String ?? "belge.pdf")
        let handle = (msg["handle"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let landscape = msg["landscape"] as? Bool
        io.async { [weak self] in
            try? w.handle.close()
            DispatchQueue.main.async {
                guard let self else { return }
                do {
                    // Hedef ada taşı (paylaşım ve dışa aktarma pencereleri bu adı gösterir)
                    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("out-\(token)", isDirectory: true)
                    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                    let file = dir.appendingPathComponent(name)
                    try FileManager.default.moveItem(at: w.url, to: file)
                    switch mode {
                    case "save":
                        if let handle, let target = self.resolve(handle: handle) {
                            self.save(id: id, from: file, to: target, handle: handle)
                        } else {
                            self.saveAs(id: id, file: file)
                        }
                    case "saveAs": self.saveAs(id: id, file: file)
                    case "share": self.share(id: id, file: file)
                    case "print": self.printFile(id: id, file: file, landscape: landscape)
                    default: self.fail(id, "Bilinmeyen yazma kipi: \(mode)")
                    }
                } catch {
                    self.fail(id, error.localizedDescription)
                }
            }
        }
    }

    private func save(id: Int, from file: URL, to target: URL, handle: String) {
        io.async { [weak self] in
            let scoped = target.startAccessingSecurityScopedResource()
            defer { if scoped { target.stopAccessingSecurityScopedResource() } }
            var coordError: NSError?
            var writeError: Error?
            NSFileCoordinator().coordinate(writingItemAt: target, options: .forReplacing, error: &coordError) { u in
                do {
                    let data = try Data(contentsOf: file)
                    try data.write(to: u)
                } catch {
                    writeError = error
                }
            }
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
            DispatchQueue.main.async {
                if let e = writeError ?? coordError {
                    self?.fail(id, e.localizedDescription)
                } else {
                    self?.reply(id, ["handle": handle, "name": target.lastPathComponent])
                }
            }
        }
    }

    private func saveAs(id: Int, file: URL) {
        // asCopy: false → dosya seçilen konuma taşınır ve güvenlik kapsamlı URL döner;
        // böylece sonraki "Kaydet" aynı dosyanın üzerine yazabilir.
        let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: false)
        picker.delegate = self
        pickCompletion = { [weak self] urls in
            guard let self else { return }
            guard let dest = urls?.first else {
                try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
                self.reply(id, NSNull())
                return
            }
            self.reply(id, ["handle": self.bookmark(for: dest), "name": dest.lastPathComponent])
        }
        controller?.present(picker, animated: true)
    }

    private func share(id: Int, file: URL) {
        guard let controller else { return }
        let vc = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        if let pop = vc.popoverPresentationController {
            pop.sourceView = controller.view
            pop.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.maxY - 60, width: 1, height: 1)
            pop.permittedArrowDirections = [.down]
        }
        controller.present(vc, animated: true)
        reply(id, ["name": file.lastPathComponent])
    }

    private func printFile(id: Int, file: URL, landscape: Bool?) {
        let pc = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = file.lastPathComponent
        info.outputType = .general
        // Seçili alan yazdırmada geniş alan yatay kâğıda basılsın
        if let landscape { info.orientation = landscape ? .landscape : .portrait }
        pc.printInfo = info
        pc.printingItem = file
        pc.present(animated: true) { _, _, _ in
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
        }
        reply(id, ["name": file.lastPathComponent])
    }

    // MARK: - Diğer

    func openExternal(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), ["http", "https", "mailto", "tel"].contains(scheme) else { return }
        UIApplication.shared.open(url)
    }
}
