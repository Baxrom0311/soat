import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

android {
    namespace = "uz.boos.nursecall"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // flutter_local_notifications uses java.time on API levels that predate it.
        // Without desugaring the build fails outright; with it, the same bytecode runs
        // on the older phones a clinic is likely to be issuing to its nurses.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "uz.boos.nursecall"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }


    signingConfigs {
        create("release") {
            // The SAME key as the Expo build (mobile-app/android/keystores). Android
            // treats a differently-signed APK with the same package as a different app
            // and refuses to install it over the existing one -- which on a ward phone
            // reads as "App not installed" with no explanation.
            val props = Properties()
            val file = rootProject.file("keystore.properties")
            if (file.exists()) {
                props.load(FileInputStream(file))
                storeFile = rootProject.file(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
            // Some heavily-modified OEM builds and sideload installers refuse an APK
            // with no v1 signature, with errors that name neither cause nor cure.
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")

    // Wear OS data layer. This is what carries the nurse's session to the ward
    // watch over Bluetooth, so she signs in once on the phone rather than typing
    // an email and a password on a 45mm screen. The previous app generation had
    // it; the Flutter rewrite did not, which is why the watch has had to be
    // signed in by hand since.
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
}
