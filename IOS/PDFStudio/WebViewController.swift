import UIKit
import WebKit

/// PDF Studio'nun tek ekranı: ortak arayüzü (MOBIL_ORTAK/web → uygulama paketindeki
/// www klasörü) WKWebView içinde çalıştırır. PDF motoru (MuPDF/WebAssembly) tamamen
/// cihazda çalışır; dosya erişimi, paylaşım ve yazdırma NativeBridge üzerinden yapılır.
final class WebViewController: UIViewController {
    private(set) var webView: WKWebView!
    private(set) lazy var bridge = NativeBridge(controller: self)
    private var darkUi = false

    static let scheme = "pdfstudio"
    static let startURL = URL(string: "\(scheme)://app/index.html")!

    override func loadView() {
        let config = WKWebViewConfiguration()
        let handler = SchemeHandler(bridge: bridge)
        config.setURLSchemeHandler(handler, forURLScheme: Self.scheme)
        config.userContentController.add(WeakScriptHandler(bridge), name: "native")
        config.allowsInlineMediaPlayback = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        web.navigationDelegate = self
        // Sayfanın kendisi kaymaz; kaydırma ve yakınlaştırma arayüzün içinde yapılır
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) {
            #if DEBUG
            web.isInspectable = true
            #endif
        }
        webView = web
        view = web
        applyTheme()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: Self.startURL))
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        darkUi ? .lightContent : .darkContent
    }

    /// Arayüz koyu/açık tema değiştirince sistem öğeleri de uyum sağlasın
    func setDarkUi(_ dark: Bool) {
        darkUi = dark
        applyTheme()
    }

    private func applyTheme() {
        let bg = darkUi ? UIColor(red: 0x1C / 255, green: 0x1F / 255, blue: 0x26 / 255, alpha: 1)
            : UIColor(red: 0xF2 / 255, green: 0xF3 / 255, blue: 0xF7 / 255, alpha: 1)
        webView?.backgroundColor = bg
        webView?.scrollView.backgroundColor = bg
        overrideUserInterfaceStyle = darkUi ? .dark : .light
        setNeedsStatusBarAppearanceUpdate()
    }

    /// JS'e mesaj gönderir (`window.PDFStudioBridge.receive`)
    func sendToJs(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let json = String(data: data, encoding: .utf8),
              let literalData = try? JSONSerialization.data(withJSONObject: [json]),
              var literal = String(data: literalData, encoding: .utf8) else { return }
        // ["..."] → "..." : JSON dize değişmezi aynı zamanda geçerli bir JS dizesidir
        literal.removeFirst()
        literal.removeLast()
        let js = "window.PDFStudioBridge&&window.PDFStudioBridge.receive(\(literal))"
        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}

extension WebViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme == Self.scheme {
            decisionHandler(.allow)
        } else {
            // Uygulama dışına giden bağlantılar sistemde açılır
            bridge.openExternal(url)
            decisionHandler(.cancel)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // Bellek baskısıyla içerik süreci kapandıysa arayüzü yeniden yükle
        webView.load(URLRequest(url: Self.startURL))
    }
}

/// WKUserContentController betik işleyicisini güçlü tutar; döngüyü kırmak için sarmalayıcı
final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
