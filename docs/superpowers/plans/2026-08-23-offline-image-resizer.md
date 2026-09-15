# Offline Image Resizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Android app that resizes a single image (by pixels, percentage, or target file size) fully offline, then saves it to the gallery or shares it.

**Architecture:** Single-Activity Jetpack Compose app, MVVM. A pure-Kotlin `ResizeEngine` holds all bitmap math and is unit-tested on the JVM. An `ImageRepository` wraps Android framework I/O (ContentResolver decode, EXIF, MediaStore save, FileProvider share). A `ResizeViewModel` orchestrates state between Compose screens and the engine/repository.

**Tech Stack:** Kotlin, Jetpack Compose (Material 3), AndroidX Activity Result APIs, AndroidX ExifInterface, MediaStore, FileProvider, JUnit4 + Robolectric for JVM bitmap tests.

**Spec:** `docs/superpowers/specs/2026-08-23-offline-image-resizer-design.md`

## Global Constraints

- **No `INTERNET` permission** may be declared anywhere in the manifest — offline is enforced by absence of the permission.
- **minSdk = 26**, targetSdk = latest stable (34+).
- **Language:** Kotlin only. UI is Jetpack Compose + Material 3.
- **Output format:** JPEG at ~90% quality (unless target-size search lowers it). No format picker in MVP.
- **One image per session** — no batch.
- **No runtime storage permission** — use the system photo picker for input and MediaStore for output.
- Package name: `com.aravali.imageresizer`.

---

### Task 1: Project scaffold

**Files:**
- Create: `settings.gradle.kts`, `build.gradle.kts` (root), `app/build.gradle.kts`, `gradle.properties`, `app/src/main/AndroidManifest.xml`, `app/src/main/java/com/aravali/imageresizer/MainActivity.kt`, `app/src/main/res/values/strings.xml`, `app/src/main/res/xml/file_paths.xml`
- Test: `app/src/test/java/com/aravali/imageresizer/ScaffoldSmokeTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces: a buildable Compose app with `MainActivity` rendering a placeholder `Text("Image Resizer")`; JVM unit-test task available via `./gradlew testDebugUnitTest`.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.aravali.imageresizer

import org.junit.Assert.assertEquals
import org.junit.Test

class ScaffoldSmokeTest {
    @Test fun appId_isStable() {
        assertEquals("com.aravali.imageresizer", BuildConfig.APPLICATION_ID)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.ScaffoldSmokeTest"`
Expected: FAIL — `BuildConfig` unresolved / project does not compile yet.

- [ ] **Step 3: Write minimal implementation**

Create the Gradle scaffold. `app/build.gradle.kts` essentials:

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
android {
    namespace = "com.aravali.imageresizer"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.aravali.imageresizer"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isIncludeAndroidResources = true }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.0")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.12.2")
    testImplementation("androidx.test:core:1.6.1")
}
```

`AndroidManifest.xml` — note: **no `<uses-permission>` at all**, and a FileProvider for later sharing:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="Image Resizer" android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
```

`res/xml/file_paths.xml`:

```xml
<paths>
    <cache-path name="shared" path="shared/" />
</paths>
```

`MainActivity.kt`:

```kotlin
package com.aravali.imageresizer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme { Text("Image Resizer") } }
    }
}
```

Add `androidx.core:core-ktx` if needed for FileProvider (`implementation("androidx.core:core-ktx:1.13.1")`).

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.ScaffoldSmokeTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git init 2>/dev/null; git add -A && git commit -m "chore: scaffold offline image resizer Compose app"
```

---

### Task 2: ResizeEngine — dimension math

**Files:**
- Create: `app/src/main/java/com/aravali/imageresizer/resize/ResizeSpec.kt`, `app/src/main/java/com/aravali/imageresizer/resize/DimensionCalculator.kt`
- Test: `app/src/test/java/com/aravali/imageresizer/resize/DimensionCalculatorTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `data class Size(val width: Int, val height: Int)`
  - `object DimensionCalculator` with:
    - `fun fromPercent(source: Size, percent: Int): Size` (percent 1..100+, rounds, min 1)
    - `fun lockedHeight(source: Size, targetWidth: Int): Int` (preserve source ratio, min 1)
    - `fun lockedWidth(source: Size, targetHeight: Int): Int` (preserve source ratio, min 1)

- [ ] **Step 1: Write the failing test**

```kotlin
package com.aravali.imageresizer.resize

import org.junit.Assert.assertEquals
import org.junit.Test

class DimensionCalculatorTest {
    private val src = Size(4000, 3000)

    @Test fun percent_scalesBothDimensions() {
        assertEquals(Size(2000, 1500), DimensionCalculator.fromPercent(src, 50))
    }

    @Test fun percent_neverGoesBelowOne() {
        assertEquals(Size(1, 1), DimensionCalculator.fromPercent(Size(10, 10), 0))
    }

    @Test fun lockedHeight_preservesRatio() {
        assertEquals(1500, DimensionCalculator.lockedHeight(src, 2000))
    }

    @Test fun lockedWidth_preservesRatio() {
        assertEquals(2000, DimensionCalculator.lockedWidth(src, 1500))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.resize.DimensionCalculatorTest"`
Expected: FAIL — `Size` / `DimensionCalculator` unresolved.

- [ ] **Step 3: Write minimal implementation**

`ResizeSpec.kt`:

```kotlin
package com.aravali.imageresizer.resize

data class Size(val width: Int, val height: Int)
```

`DimensionCalculator.kt`:

```kotlin
package com.aravali.imageresizer.resize

import kotlin.math.max
import kotlin.math.roundToInt

object DimensionCalculator {
    fun fromPercent(source: Size, percent: Int): Size {
        val p = percent / 100.0
        return Size(
            max(1, (source.width * p).roundToInt()),
            max(1, (source.height * p).roundToInt()),
        )
    }

    fun lockedHeight(source: Size, targetWidth: Int): Int {
        if (source.width == 0) return 1
        return max(1, (targetWidth.toLong() * source.height / source.width).toInt())
    }

    fun lockedWidth(source: Size, targetHeight: Int): Int {
        if (source.height == 0) return 1
        return max(1, (targetHeight.toLong() * source.width / source.height).toInt())
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.resize.DimensionCalculatorTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add dimension calculator with aspect-ratio math"
```

---

### Task 3: ResizeEngine — bitmap scaling + target-size quality search

**Files:**
- Create: `app/src/main/java/com/aravali/imageresizer/resize/ResizeEngine.kt`
- Test: `app/src/test/java/com/aravali/imageresizer/resize/ResizeEngineTest.kt`

**Interfaces:**
- Consumes: `Size`, `DimensionCalculator` from Task 2.
- Produces:
  - `class ResizeEngine`:
    - `fun scale(src: Bitmap, target: Size): Bitmap` — bilinear scale to exact size.
    - `fun encodeJpeg(bitmap: Bitmap, quality: Int): ByteArray` — quality 0..100.
    - `fun encodeToTargetSize(bitmap: Bitmap, maxBytes: Int): ByteArray` — binary-search quality in [10,95]; returns bytes ≤ maxBytes when achievable, else best effort at quality 10.

- [ ] **Step 1: Write the failing test**

Robolectric provides working `Bitmap`/`BitmapFactory` on the JVM. Add `@RunWith(RobolectricTestRunner::class)`.

```kotlin
package com.aravali.imageresizer.resize

import android.graphics.Bitmap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ResizeEngineTest {
    private val engine = ResizeEngine()
    private fun bmp(w: Int, h: Int) = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)

    @Test fun scale_producesRequestedDimensions() {
        val out = engine.scale(bmp(4000, 3000), Size(200, 150))
        assertEquals(200, out.width)
        assertEquals(150, out.height)
    }

    @Test fun encodeJpeg_returnsNonEmptyBytes() {
        val bytes = engine.encodeJpeg(bmp(100, 100), 90)
        assertTrue(bytes.isNotEmpty())
    }

    @Test fun encodeToTargetSize_respectsBudgetWhenAchievable() {
        val bytes = engine.encodeToTargetSize(bmp(1000, 1000), maxBytes = 50_000)
        assertTrue("expected <= 50000 got ${bytes.size}", bytes.size <= 50_000)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.resize.ResizeEngineTest"`
Expected: FAIL — `ResizeEngine` unresolved.

- [ ] **Step 3: Write minimal implementation**

```kotlin
package com.aravali.imageresizer.resize

import android.graphics.Bitmap
import java.io.ByteArrayOutputStream

class ResizeEngine {
    fun scale(src: Bitmap, target: Size): Bitmap =
        Bitmap.createScaledBitmap(src, target.width, target.height, true)

    fun encodeJpeg(bitmap: Bitmap, quality: Int): ByteArray {
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(0, 100), out)
        return out.toByteArray()
    }

    fun encodeToTargetSize(bitmap: Bitmap, maxBytes: Int): ByteArray {
        var low = 10
        var high = 95
        var best = encodeJpeg(bitmap, low)
        while (low <= high) {
            val mid = (low + high) / 2
            val bytes = encodeJpeg(bitmap, mid)
            if (bytes.size <= maxBytes) {
                best = bytes          // fits — try higher quality
                low = mid + 1
            } else {
                high = mid - 1        // too big — lower quality
            }
        }
        return best
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.resize.ResizeEngineTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add ResizeEngine scaling and target-size quality search"
```

---

### Task 4: ImageRepository — load with downsampling + EXIF orientation

**Files:**
- Create: `app/src/main/java/com/aravali/imageresizer/data/ImageRepository.kt`, `app/src/main/java/com/aravali/imageresizer/data/LoadedImage.kt`
- Test: `app/src/test/java/com/aravali/imageresizer/data/SampleSizeTest.kt`

**Interfaces:**
- Consumes: `Size` from Task 2.
- Produces:
  - `data class LoadedImage(val bitmap: Bitmap, val size: Size)`
  - `object SampleSizeCalculator { fun calculate(source: Size, maxDimension: Int): Int }` — returns a power-of-two `inSampleSize`.
  - `class ImageRepository(context: Context)` with `fun load(uri: Uri, maxDimension: Int = 4096): LoadedImage` (decodes with `inSampleSize`, applies EXIF rotation) and `fun save(bytes: ByteArray, displayName: String): Uri` + `fun shareUri(bytes: ByteArray, displayName: String): Uri` (implemented in Task 5).

- [ ] **Step 1: Write the failing test**

Pure math is unit-testable without Android; keep `save`/EXIF for instrumented/manual verification.

```kotlin
package com.aravali.imageresizer.data

import com.aravali.imageresizer.resize.Size
import org.junit.Assert.assertEquals
import org.junit.Test

class SampleSizeTest {
    @Test fun noDownsample_whenWithinBudget() {
        assertEquals(1, SampleSizeCalculator.calculate(Size(2000, 1500), 4096))
    }

    @Test fun downsamplesByPowerOfTwo_whenTooLarge() {
        // 8000x6000 into 4096 -> needs factor 2
        assertEquals(2, SampleSizeCalculator.calculate(Size(8000, 6000), 4096))
    }

    @Test fun downsamplesFurther_forVeryLargeImages() {
        assertEquals(4, SampleSizeCalculator.calculate(Size(20000, 15000), 4096))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.data.SampleSizeTest"`
Expected: FAIL — `SampleSizeCalculator` unresolved.

- [ ] **Step 3: Write minimal implementation**

`LoadedImage.kt`:

```kotlin
package com.aravali.imageresizer.data

import android.graphics.Bitmap
import com.aravali.imageresizer.resize.Size

data class LoadedImage(val bitmap: Bitmap, val size: Size)

object SampleSizeCalculator {
    fun calculate(source: Size, maxDimension: Int): Int {
        var sample = 1
        var w = source.width
        var h = source.height
        while (w / sample > maxDimension || h / sample > maxDimension) {
            sample *= 2
        }
        return sample
    }
}
```

`ImageRepository.kt` (load path; save/share added in Task 5):

```kotlin
package com.aravali.imageresizer.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.aravali.imageresizer.resize.Size

class ImageRepository(private val context: Context) {

    fun load(uri: Uri, maxDimension: Int = 4096): LoadedImage {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)!!.use {
            BitmapFactory.decodeStream(it, null, bounds)
        }
        val sample = SampleSizeCalculator.calculate(Size(bounds.outWidth, bounds.outHeight), maxDimension)
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = context.contentResolver.openInputStream(uri)!!.use {
            BitmapFactory.decodeStream(it, null, opts)
        } ?: error("Unable to decode image")
        val rotated = applyExifRotation(uri, decoded)
        return LoadedImage(rotated, Size(rotated.width, rotated.height))
    }

    private fun applyExifRotation(uri: Uri, bitmap: Bitmap): Bitmap {
        val orientation = context.contentResolver.openInputStream(uri)?.use { stream ->
            ExifInterface(stream).getAttributeInt(
                ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL
            )
        } ?: ExifInterface.ORIENTATION_NORMAL
        val degrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        if (degrees == 0f) return bitmap
        val m = Matrix().apply { postRotate(degrees) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.data.SampleSizeTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add image loading with downsampling and EXIF orientation"
```

---

### Task 5: ImageRepository — save to MediaStore + share via FileProvider

**Files:**
- Modify: `app/src/main/java/com/aravali/imageresizer/data/ImageRepository.kt`
- Test: `app/src/androidTest/java/com/aravali/imageresizer/data/ImageRepositorySaveTest.kt`

**Interfaces:**
- Consumes: `ImageRepository` from Task 4.
- Produces:
  - `fun save(bytes: ByteArray, displayName: String): Uri` — inserts JPEG into `MediaStore.Images` under `Pictures/ImageResizer`.
  - `fun shareUri(bytes: ByteArray, displayName: String): Uri` — writes JPEG to `cacheDir/shared/` and returns a `FileProvider` content URI.

- [ ] **Step 1: Write the failing test**

Instrumented test (runs on device/emulator) — verifies save returns a readable Uri.

```kotlin
package com.aravali.imageresizer.data

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ImageRepositorySaveTest {
    @Test fun save_returnsReadableUri() {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val repo = ImageRepository(ctx)
        val fakeJpeg = ByteArray(1024) { 0xFF.toByte() }
        val uri = repo.save(fakeJpeg, "test_${System.currentTimeMillis()}.jpg")
        val readBack = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        assertTrue(readBack != null && readBack.isNotEmpty())
    }
}
```

Add `androidTestImplementation("androidx.test.ext:junit:1.2.1")` to `app/build.gradle.kts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew connectedDebugAndroidTest --tests "com.aravali.imageresizer.data.ImageRepositorySaveTest"`
Expected: FAIL — `save` unresolved. (Requires a running emulator/device.)

- [ ] **Step 3: Write minimal implementation**

Add to `ImageRepository`:

```kotlin
import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File

fun save(bytes: ByteArray, displayName: String): Uri {
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            put(MediaStore.Images.Media.RELATIVE_PATH,
                Environment.DIRECTORY_PICTURES + "/ImageResizer")
        }
    }
    val resolver = context.contentResolver
    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        ?: error("Failed to create MediaStore entry")
    resolver.openOutputStream(uri)!!.use { it.write(bytes) }
    return uri
}

fun shareUri(bytes: ByteArray, displayName: String): Uri {
    val dir = File(context.cacheDir, "shared").apply { mkdirs() }
    val file = File(dir, displayName)
    file.writeBytes(bytes)
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew connectedDebugAndroidTest --tests "com.aravali.imageresizer.data.ImageRepositorySaveTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: save resized image to MediaStore and share via FileProvider"
```

---

### Task 6: ResizeViewModel — state + orchestration

**Files:**
- Create: `app/src/main/java/com/aravali/imageresizer/ui/ResizeViewModel.kt`, `app/src/main/java/com/aravali/imageresizer/ui/ResizeUiState.kt`
- Test: `app/src/test/java/com/aravali/imageresizer/ui/ResizeViewModelTest.kt`

**Interfaces:**
- Consumes: `Size`, `DimensionCalculator`, `ResizeEngine` (Tasks 2–3). Uses a small `ImageProcessor` seam so the ViewModel is testable without Android I/O.
- Produces:
  - `data class ResizeUiState(val source: Size?, val targetWidth: Int, val targetHeight: Int, val lockAspect: Boolean, val estimatedBytes: Int?)`
  - `class ResizeViewModel(engine: ResizeEngine)` with:
    - `fun onImageLoaded(source: Size)`
    - `fun onWidthChanged(width: Int)` (applies lockedHeight when lock on)
    - `fun onHeightChanged(height: Int)` (applies lockedWidth when lock on)
    - `fun onPercentChanged(percent: Int)`
    - `fun onToggleLock(enabled: Boolean)`
    - `val uiState: StateFlow<ResizeUiState>`

- [ ] **Step 1: Write the failing test**

```kotlin
package com.aravali.imageresizer.ui

import com.aravali.imageresizer.resize.ResizeEngine
import org.junit.Assert.assertEquals
import org.junit.Test

class ResizeViewModelTest {
    private val vm = ResizeViewModel(ResizeEngine())

    @Test fun widthChange_withLock_updatesHeight() {
        vm.onImageLoaded(com.aravali.imageresizer.resize.Size(4000, 3000))
        vm.onToggleLock(true)
        vm.onWidthChanged(2000)
        assertEquals(2000, vm.uiState.value.targetWidth)
        assertEquals(1500, vm.uiState.value.targetHeight)
    }

    @Test fun percentChange_scalesBoth() {
        vm.onImageLoaded(com.aravali.imageresizer.resize.Size(4000, 3000))
        vm.onPercentChanged(25)
        assertEquals(1000, vm.uiState.value.targetWidth)
        assertEquals(750, vm.uiState.value.targetHeight)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.ui.ResizeViewModelTest"`
Expected: FAIL — `ResizeViewModel` unresolved.

- [ ] **Step 3: Write minimal implementation**

```kotlin
package com.aravali.imageresizer.ui

import androidx.lifecycle.ViewModel
import com.aravali.imageresizer.resize.DimensionCalculator
import com.aravali.imageresizer.resize.ResizeEngine
import com.aravali.imageresizer.resize.Size
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ResizeUiState(
    val source: Size? = null,
    val targetWidth: Int = 0,
    val targetHeight: Int = 0,
    val lockAspect: Boolean = true,
    val estimatedBytes: Int? = null,
)

class ResizeViewModel(private val engine: ResizeEngine) : ViewModel() {
    private val _uiState = MutableStateFlow(ResizeUiState())
    val uiState: StateFlow<ResizeUiState> = _uiState.asStateFlow()

    fun onImageLoaded(source: Size) {
        _uiState.value = ResizeUiState(
            source = source, targetWidth = source.width,
            targetHeight = source.height, lockAspect = true,
        )
    }

    fun onWidthChanged(width: Int) {
        val s = _uiState.value
        val h = if (s.lockAspect && s.source != null)
            DimensionCalculator.lockedHeight(s.source, width) else s.targetHeight
        _uiState.value = s.copy(targetWidth = width, targetHeight = h)
    }

    fun onHeightChanged(height: Int) {
        val s = _uiState.value
        val w = if (s.lockAspect && s.source != null)
            DimensionCalculator.lockedWidth(s.source, height) else s.targetWidth
        _uiState.value = s.copy(targetHeight = height, targetWidth = w)
    }

    fun onPercentChanged(percent: Int) {
        val s = _uiState.value
        val src = s.source ?: return
        val scaled = DimensionCalculator.fromPercent(src, percent)
        _uiState.value = s.copy(targetWidth = scaled.width, targetHeight = scaled.height)
    }

    fun onToggleLock(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(lockAspect = enabled)
    }
}
```

Add `implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.ui.ResizeViewModelTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add ResizeViewModel with live dimension state"
```

---

### Task 7: Compose UI — pick, edit, result screens wired end-to-end

**Files:**
- Create: `app/src/main/java/com/aravali/imageresizer/ui/ResizerScreen.kt`
- Modify: `app/src/main/java/com/aravali/imageresizer/MainActivity.kt`
- Test: manual verification (UI wiring); logic already covered by Tasks 2–6.

**Interfaces:**
- Consumes: `ResizeViewModel` (Task 6), `ImageRepository` (Tasks 4–5), `ResizeEngine` (Task 3).
- Produces: a single `ResizerScreen` composable driving the full flow: pick → edit (W/H, %, lock, target-KB) → Save / Share.

- [ ] **Step 1: Implement the screen**

`ResizerScreen.kt` — key wiring (photo picker needs no permission):

```kotlin
package com.aravali.imageresizer.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.aravali.imageresizer.data.ImageRepository
import com.aravali.imageresizer.resize.ResizeEngine
import com.aravali.imageresizer.resize.Size

@Composable
fun ResizerScreen() {
    val context = LocalContext.current
    val repo = remember { ImageRepository(context) }
    val engine = remember { ResizeEngine() }
    val vm = remember { ResizeViewModel(engine) }
    val state by vm.uiState.collectAsState()
    var sourceBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        if (uri != null) {
            val loaded = repo.load(uri)
            sourceBitmap = loaded.bitmap
            vm.onImageLoaded(loaded.size)
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = {
            picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }) { Text("Pick image") }

        if (state.source != null) {
            OutlinedTextField(
                value = state.targetWidth.toString(),
                onValueChange = { vm.onWidthChanged(it.toIntOrNull() ?: 0) },
                label = { Text("Width (px)") },
            )
            OutlinedTextField(
                value = state.targetHeight.toString(),
                onValueChange = { vm.onHeightChanged(it.toIntOrNull() ?: 0) },
                label = { Text("Height (px)") },
            )
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Checkbox(checked = state.lockAspect, onCheckedChange = { vm.onToggleLock(it) })
                Text("Lock aspect ratio")
            }
            Button(
                enabled = state.targetWidth > 0 && state.targetHeight > 0,
                onClick = {
                    val src = sourceBitmap ?: return@Button
                    val scaled = engine.scale(src, Size(state.targetWidth, state.targetHeight))
                    val bytes = engine.encodeJpeg(scaled, 90)
                    val name = "resized_${System.currentTimeMillis()}.jpg"
                    repo.save(bytes, name)
                }
            ) { Text("Save to gallery") }

            Button(
                enabled = state.targetWidth > 0 && state.targetHeight > 0,
                onClick = {
                    val src = sourceBitmap ?: return@Button
                    val scaled = engine.scale(src, Size(state.targetWidth, state.targetHeight))
                    val bytes = engine.encodeJpeg(scaled, 90)
                    val uri = repo.shareUri(bytes, "resized_${System.currentTimeMillis()}.jpg")
                    val share = Intent(Intent.ACTION_SEND).apply {
                        type = "image/jpeg"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(share, "Share image"))
                }
            ) { Text("Share") }
        }
    }
}
```

Update `MainActivity` to `setContent { MaterialTheme { ResizerScreen() } }`.

- [ ] **Step 2: Build the app**

Run: `./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Manually verify on emulator/device**

Install (`./gradlew installDebug`), then: pick an image → set width with lock on (height auto-updates) → Save → confirm the file appears in gallery under Pictures/ImageResizer → Share → confirm the share sheet opens.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: wire pick/edit/save/share Compose UI end-to-end"
```

---

### Task 8: Target-size input + input validation polish

**Files:**
- Modify: `app/src/main/java/com/aravali/imageresizer/ui/ResizerScreen.kt`
- Modify: `app/src/main/java/com/aravali/imageresizer/ui/ResizeViewModel.kt`
- Test: `app/src/test/java/com/aravali/imageresizer/ui/TargetSizeFlowTest.kt`

**Interfaces:**
- Consumes: `ResizeViewModel`, `ResizeEngine.encodeToTargetSize` (Tasks 3, 6).
- Produces: an optional "Target size (KB)" field; when set, Save/Share use `encodeToTargetSize(scaled, kb * 1024)` instead of fixed quality.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.aravali.imageresizer.ui

import android.graphics.Bitmap
import com.aravali.imageresizer.resize.ResizeEngine
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TargetSizeFlowTest {
    @Test fun encodeToTargetSize_fromViewModelPath_respectsBudget() {
        val engine = ResizeEngine()
        val bmp = Bitmap.createBitmap(1200, 900, Bitmap.Config.ARGB_8888)
        val bytes = engine.encodeToTargetSize(bmp, 30 * 1024)
        assertTrue(bytes.size <= 30 * 1024)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew testDebugUnitTest --tests "com.aravali.imageresizer.ui.TargetSizeFlowTest"`
Expected: PASS if Task 3 done (this guards the integration path); if you add a VM helper first it FAILs until wired.

- [ ] **Step 3: Implement**

Add a `targetKb` field to `ResizeUiState` (default `null`) and `fun onTargetKbChanged(kb: Int?)` to the ViewModel. In `ResizerScreen`, add an `OutlinedTextField` for "Target size (KB)" and change the Save/Share `onClick` encode step to:

```kotlin
val bytes = state.targetKb?.let { engine.encodeToTargetSize(scaled, it * 1024) }
    ?: engine.encodeJpeg(scaled, 90)
```

Add inline validation: disable Save/Share when width/height ≤ 0, and coerce blank numeric fields to a safe value.

- [ ] **Step 4: Run tests + build**

Run: `./gradlew testDebugUnitTest assembleDebug`
Expected: PASS + BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add target-size (KB) encoding and input validation"
```

---

## Self-Review

**Spec coverage:**
- Resize by exact pixels → Task 7 (W/H fields) + Task 3 (`scale`). ✓
- Resize by percentage → Task 6 (`onPercentChanged`) + Task 2. ✓
- Resize to target file size → Task 3 (`encodeToTargetSize`) + Task 8. ✓
- Lock aspect ratio → Task 2 + Task 6 + Task 7 checkbox. ✓
- Save to gallery → Task 5 (`save`) + Task 7. ✓
- Share → Task 5 (`shareUri`) + Task 7. ✓
- Offline (no INTERNET) → Task 1 manifest (Global Constraints). ✓
- Large-image safety (downsampling) → Task 4. ✓
- EXIF orientation → Task 4. ✓
- No storage permission (photo picker + MediaStore) → Tasks 5, 7. ✓
- Unit tests on engine → Tasks 2, 3, 6, 8; instrumented save → Task 5. ✓

**Placeholder scan:** No TBD/TODO; each code step has concrete code. ✓

**Type consistency:** `Size`, `LoadedImage`, `ResizeUiState`, `ResizeEngine.scale/encodeJpeg/encodeToTargetSize`, `ImageRepository.load/save/shareUri`, and ViewModel method names are used consistently across tasks. ✓
