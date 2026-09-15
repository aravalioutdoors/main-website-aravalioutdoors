# Offline Image Resizer — Android MVP Design

**Date:** 2026-08-23
**Status:** Approved for implementation planning

## 1. Goal

An Android app that resizes a user's image to a desired size, fully
offline. The app must run without any network access — this is both a
product requirement and a privacy guarantee enforced by declaring **no
`INTERNET` permission**.

## 2. Scope

### In scope (MVP)
- Resize a single image by **exact pixels** (width × height).
- Resize by **percentage** (e.g. 50%).
- Resize to a **target file size** (e.g. ≤ 500 KB).
- **Lock aspect ratio** toggle.
- **Save** the result to the device gallery / Downloads.
- **Share** the result to other apps via the system share sheet.

### Out of scope (deferred)
- Batch / multiple-image resizing.
- Crop and rotate editing.
- Output format picker (MVP is JPEG-only).
- Higher-quality resampling (Lanczos); MVP uses bilinear.

## 3. Key Decisions & Assumptions

| Decision | Choice | Rationale |
|---|---|---|
| Language / UI | Kotlin + Jetpack Compose | Modern Android standard, native bitmap/EXIF access, small APK |
| Architecture | Single-Activity, MVVM | Clear separation, testable core |
| minSdk | 26 (Android 8.0) | ~95%+ device coverage, modern storage APIs |
| Output format | JPEG @ ~90% quality | Simplest MVP; format picker deferred |
| Images per run | One at a time | Batch deferred to fast-follow |
| Offline guarantee | No `INTERNET` permission declared | Cannot make network calls even accidentally |

## 4. Architecture

Small, independently testable units communicating through clear interfaces.

| Unit | Responsibility | Depends on |
|---|---|---|
| **UI (Compose screens)** | Home / Editor / Result screens; render state, capture input | ViewModel |
| **ResizeViewModel** | Holds resize state (target W/H, %, lock-ratio, target KB); orchestrates work; exposes UI state | ResizeEngine, ImageRepository |
| **ResizeEngine** (pure Kotlin) | Bitmap math: scaling, aspect-ratio calc, target-size quality search | Android `Bitmap` only (no UI) |
| **ImageRepository** | Load image via `ContentResolver`, decode with downsampling, read EXIF orientation, save via `MediaStore`, provide share URI via `FileProvider` | Android framework |

### Data flow
```
User picks image (system photo picker)
  -> ImageRepository.load() decodes with inSampleSize + EXIF orientation
  -> ViewModel holds source bitmap + metadata
User sets W/H / % / target KB (+ aspect lock)
  -> ViewModel computes derived dimensions live
  -> ResizeEngine.resize() produces output bitmap/bytes
User taps Save  -> ImageRepository.save() -> MediaStore (Pictures/Downloads)
User taps Share -> FileProvider URI -> ACTION_SEND
```

## 5. Core Technical Details

- **Loading large images safely:** decode with `BitmapFactory.Options.inSampleSize`
  computed from the source dimensions to avoid `OutOfMemoryError` on large photos.
- **EXIF orientation:** read via `ExifInterface`; rotate the decoded bitmap so
  portrait photos are not saved sideways.
- **Resizing:** `Bitmap.createScaledBitmap(src, w, h, filter = true)` (bilinear).
- **Aspect-ratio lock:** when enabled, editing one dimension recomputes the other
  in the ViewModel using the source ratio.
- **Target file size:** binary-search JPEG quality (compress to a `ByteArrayOutputStream`,
  measure byte length, adjust quality bounds) until output ≤ requested size or
  quality bounds converge.
- **Saving (scoped storage):** `MediaStore.Images` insert into
  `Pictures/` (or `Downloads/`) — no storage permission required on Android 10+.
- **Sharing:** `FileProvider` + `Intent.ACTION_SEND` with the JPEG MIME type.

## 6. User Flow / Screens

1. **Home** — "Pick image" button launching the system photo picker
   (`ActivityResultContracts.PickVisualMedia`) — no runtime permission needed.
2. **Editor** — image preview; inputs for Width (px), Height (px), Percentage,
   "Lock aspect ratio" toggle, optional "Target size (KB)"; live estimated output
   dimensions/size.
3. **Result** — before/after dimensions and file size; **Save** and **Share** buttons;
   success confirmation.

## 7. Error Handling

- Unreadable / corrupt image → user-facing error, return to Home.
- Image too large to decode even downsampled → graceful message.
- Invalid dimension input (0, negative, non-numeric) → inline validation, block resize.
- Target size unachievable at min quality → save best effort and inform the user.
- Save failure (storage) → error surfaced, no silent failure.

## 8. Testing Strategy

- **Unit tests (JVM, no emulator)** on `ResizeEngine`:
  - exact-pixel scaling produces requested dimensions
  - percentage scaling math
  - aspect-ratio locked dimension calculation
  - target-size quality binary-search converges under target
- **Instrumented tests** for `ImageRepository` save into `MediaStore`.
- Manual verification of pick → resize → save → share on a device/emulator.

## 9. Build Order

1. Project scaffold — Gradle, Compose, **no `INTERNET` permission**.
2. `ResizeEngine` + unit tests (TDD; pure logic first).
3. Image pick → preview (Home → Editor).
4. Resize controls wired to engine + live derived dimensions.
5. Save to gallery + share (Result screen).
6. Polish — loading state, error handling, empty/invalid input.
