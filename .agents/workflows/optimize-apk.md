# Optimize Android APK Workflow

Inspect `android/app/build.gradle`, `android/variables.gradle`, and `android/app/proguard-rules.pro`:
1. Verify R8 code and resource shrinking (`minifyEnabled true`, `shrinkResources true`) are active for the `release` buildType.
2. Confirm ProGuard keeps Capacitor bridge classes (`com.getcapacitor.**`) and JavaScript interfaces.
3. Verify `packagingOptions` excludes `META-INF/DebugProbesKt.bin` and Kotlin Coroutines version files.
4. Ensure legacy raster `splash.png` files under `android/app/src/main/res/drawable-land-*` and `drawable-port-*` remain removed, relying on the modern `core-splashscreen` API.
5. Run `npx.cmd cap sync android` in the terminal to keep all web assets synchronized.
6. Push changes to GitHub to trigger the automated GitHub Actions build workflow.
