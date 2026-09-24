import Foundation
import WebKit

/// `pdfstudio://app/...` isteklerini karşılar:
///  - `/native/file/<belirteç>` → açılan belgenin baytları (NativeBridge)
///  - diğer yollar           → uygulama paketindeki www klasörü (ortak arayüz)
/// ES modülleri, Worker ve WebAssembly doğru MIME türü ister; türler uzantıdan belirlenir.
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    private weak var bridge: NativeBridge?
    private let root: URL
    private let queue = DispatchQueue(label: "pdfstudio.scheme", qos: .userInitiated)
    private var stopped = Set<ObjectIdentifier>()
    private let lock = NSLock()

    private static let mime: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8", "wasm": "application/wasm",
        "ttf": "font/ttf", "otf": "font/otf", "png": "image/png", "svg": "image/svg+xml",
        "gz": "application/octet-stream", "txt": "text/plain; charset=utf-8", "md": "text/plain; charset=utf-8",
    ]

    init(bridge: NativeBridge) {
        self.bridge = bridge
        root = (Bundle.main.resourceURL ?? URL(fileURLWithPath: "/")).appendingPathComponent("www", isDirectory: true)
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let id = ObjectIdentifier(urlSchemeTask)
        let path = url.path
        let bridge = self.bridge
        queue.async { [weak self] in
            guard let self else { return }
            var data: Data?
            var type = "application/octet-stream"
            if path.hasPrefix("/native/file/") {
                let token = String(path.dropFirst("/native/file/".count))
                data = bridge?.fileData(token: token)
            } else {
                let relative = path == "/" ? "index.html" : String(path.dropFirst())
                let fileURL = self.root.appendingPathComponent(relative).standardizedFileURL
                if fileURL.path.hasPrefix(self.root.standardizedFileURL.path) {
                    data = try? Data(contentsOf: fileURL, options: .mappedIfSafe)
                    type = Self.mime[fileURL.pathExtension.lowercased()] ?? type
                }
            }
            DispatchQueue.main.async {
                if self.consumeStopped(id) { return }
                guard let data else {
                    let resp = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
                    urlSchemeTask.didReceive(resp)
                    urlSchemeTask.didReceive(Data())
                    urlSchemeTask.didFinish()
                    return
                }
                let headers = [
                    "Content-Type": type,
                    "Content-Length": String(data.count),
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache",
                ]
                let resp = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
                urlSchemeTask.didReceive(resp)
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
            }
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // Durdurulmuş göreve yanıt yazmak çökme sebebi; işaretle
        lock.lock()
        stopped.insert(ObjectIdentifier(urlSchemeTask))
        lock.unlock()
    }

    private func consumeStopped(_ id: ObjectIdentifier) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return stopped.remove(id) != nil
    }
}
