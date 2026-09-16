plugins { id("com.android.library"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.tmarhguy.envelop.core"
    compileSdk = 35
    defaultConfig {
        minSdk = 26
        val url = (project.findProperty("envelop.url") as String?) ?: System.getenv("ENVELOP_SUPABASE_URL") ?: ""
        val key = (project.findProperty("envelop.key") as String?) ?: System.getenv("ENVELOP_SUPABASE_KEY") ?: ""
        fun quoted(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
        buildConfigField("String", "ENVELOP_URL", quoted(url))
        buildConfigField("String", "ENVELOP_KEY", quoted(key))
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
