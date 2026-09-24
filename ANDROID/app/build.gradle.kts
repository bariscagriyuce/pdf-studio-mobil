import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Sürüm numarasının tek kaynağı: MOBIL_ORTAK/package.json
// (etiketli CI derlemesinde MOBIL_ORTAK/scripts/set_version.mjs onu etiketten günceller)
val appVersion: String = run {
    val pkg = rootProject.file("../MOBIL_ORTAK/package.json")
    val m = Regex(""""version"\s*:\s*"([^"]+)"""").find(if (pkg.exists()) pkg.readText() else "")
    m?.groupValues?.get(1) ?: "1.0.0"
}
val appVersionCode: Int = run {
    val p = appVersion.split(".", "-").mapNotNull { it.toIntOrNull() } + listOf(0, 0, 0)
    p[0] * 10000 + p[1] * 100 + p[2]
}

// İsteğe bağlı yayın imzası: ANDROID/keystore.properties ya da ortam değişkenleri
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(key: String, env: String): String? = keystoreProps.getProperty(key) ?: System.getenv(env)

android {
    namespace = "com.pdfstudio.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pdfstudio.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersion
    }

    signingConfigs {
        val store = signingValue("storeFile", "ANDROID_KEYSTORE")
        if (store != null && file(store).exists()) {
            create("release") {
                storeFile = file(store)
                storePassword = signingValue("storePassword", "ANDROID_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "ANDROID_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Anahtar verilmediyse hata ayıklama anahtarıyla imzalanır: telefona
            // doğrudan kurulabilir, ama Play Store'a yüklenemez.
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    androidResources {
        // .wasm ve .gz dosyaları APK'da sıkıştırılmadan dursun (hızlı açılış)
        noCompress += listOf("wasm", "gz", "ttf")
    }

    applicationVariants.all {
        val variant = this
        outputs.all {
            (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
                "PDFStudio-${variant.versionName}-${variant.buildType.name}.apk"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}

// ------------------------------------------------------------------------
// Ortak arayüzü (MOBIL_ORTAK/web) derlemeden önce assets/www içine kopyala.
// Node.js gerekir; NODE ortam değişkeniyle yolu verilebilir.
val syncWeb by tasks.registering(Exec::class) {
    description = "MOBIL_ORTAK/web → app/src/main/assets/www"
    val script = rootProject.file("../MOBIL_ORTAK/scripts/sync.mjs")
    inputs.dir(rootProject.file("../MOBIL_ORTAK/web"))
    outputs.dir(file("src/main/assets/www"))
    commandLine(System.getenv("NODE") ?: "node", script.absolutePath, "android")
}
tasks.named("preBuild") { dependsOn(syncWeb) }
