plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android {
    namespace = "com.tmarhguy.envelop.bridge"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.tmarhguy.envelop.bridge"; minSdk = 26; targetSdk = 35
        versionCode = 1; versionName = "0.2.0"
        val url = (project.findProperty("envelop.url") as String?) ?: System.getenv("ENVELOP_SUPABASE_URL") ?: ""
        val key = (project.findProperty("envelop.key") as String?) ?: System.getenv("ENVELOP_SUPABASE_KEY") ?: ""
        fun quoted(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
        buildConfigField("String", "ENVELOP_URL", quoted(url)); buildConfigField("String", "ENVELOP_KEY", quoted(key))
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation(project(":core"))
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3:1.3.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    testImplementation("junit:junit:4.13.2")
}
