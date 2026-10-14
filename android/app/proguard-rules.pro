# Preserve Capacitor core bridge classes and JS interfaces
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-dontwarn com.getcapacitor.**

# Preserve Cordova compatibility plugins
-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**
