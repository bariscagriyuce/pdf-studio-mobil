package com.pdfstudio.mobile

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * PDF Studio'nun tek ekranı: ortak arayüzü (MOBIL_ORTAK/web → assets/www)
 * WebView içinde çalıştırır. PDF motoru (MuPDF/WebAssembly) tamamen cihazda
 * çalışır; dosya erişimi, paylaşım ve yazdırma NativeBridge üzerinden yapılır.
 */
class MainActivity : ComponentActivity() {

    lateinit var web: WebView
    private lateinit var root: FrameLayout
    lateinit var bridge: NativeBridge
    private var darkUi = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        darkUi = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
            android.content.res.Configuration.UI_MODE_NIGHT_YES
        root = FrameLayout(this)
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        applyBarColors()

        // Android 15 kenardan kenara çizimi zorunlu kılar: sistem çubukları, çentik
        // ve klavye için boşluğu WebView'in çevresine biz bırakırız.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        WebView.setWebContentsDebuggingEnabled(debuggable)

        bridge = NativeBridge(this)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebAssets.AssetHandler(this))
            .addPathHandler("/native/", bridge.files.pathHandler())
            .build()

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            mediaPlaybackRequiresUserGesture = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_NO_CACHE
        }
        web.setBackgroundColor(if (darkUi) Color.parseColor("#1C1F26") else Color.parseColor("#F2F3F7"))
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Uygulama dışına giden bağlantılar sistem tarayıcısında açılır
                val url = request.url
                if (url.host == WebAssets.HOST) return false
                bridge.openExternal(url.toString())
                return true
            }
        }
        web.addJavascriptInterface(bridge, "PDFStudioNative")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (bridge.jsReady) bridge.sendEvent(JSONObject().put("event", "back"))
                else finish()
            }
        })

        handleIntent(intent)
        web.loadUrl(WebAssets.START_URL)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onDestroy() {
        bridge.shutdown()
        web.destroy()
        super.onDestroy()
    }

    /** "Birlikte aç" / "Paylaş" ile gelen dosya. */
    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        val uri: Uri? = when (intent.action) {
            Intent.ACTION_VIEW -> intent.data
            Intent.ACTION_SEND ->
                if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
            else -> null
        }
        if (uri != null) bridge.openIncoming(uri, intent.flags)
    }

    /** Arayüz koyu/açık tema değiştirince sistem çubuklarının simge rengi uyumlu olsun. */
    fun setDarkUi(dark: Boolean) {
        darkUi = dark
        applyBarColors()
    }

    private fun applyBarColors() {
        val bar = if (darkUi) Color.parseColor("#232733") else Color.WHITE
        root.setBackgroundColor(bar)
        val ctl = WindowCompat.getInsetsController(window, window.decorView)
        ctl.isAppearanceLightStatusBars = !darkUi
        ctl.isAppearanceLightNavigationBars = !darkUi
    }
}
