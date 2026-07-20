# Images for Aravali Outdoors

Drop your photos into this folder using the **exact filenames** below. Once they're
all here, tell me (or see "Switching to local images" at the bottom) and the page
will use your images instead of the temporary stock ones.

## Filenames the page expects

| Filename                     | Where it appears                         | Best shape / crop      |
|------------------------------|------------------------------------------|------------------------|
| `hero.jpg`                   | Full-screen hero background (top)        | Landscape, ~1920×1080+ |
| `activity-camping.jpg`       | Activity 01 — Camping                    | Portrait, ~1200×1500   |
| `activity-trekking.jpg`      | Activity 02 — Trekking                   | Portrait, ~1200×1500   |
| `activity-rappelling.jpg`    | Activity 03 — Rappelling                 | Portrait, ~1200×1500   |
| `activity-nightcamp.jpg`     | Activity 04 — Night camps / stargazing   | Portrait, ~1200×1500   |
| `voice-1.jpg`                | Testimonial marquee — Aarav              | Landscape, ~800×550    |
| `voice-2.jpg`                | Testimonial marquee — Meher              | Landscape, ~800×550    |
| `voice-3.jpg`                | Testimonial marquee — Kabir              | Landscape, ~800×550    |
| `voice-4.jpg`                | Testimonial marquee — Ishani             | Landscape, ~800×550    |
| `voice-5.jpg`                | Testimonial marquee — Rohan              | Landscape, ~800×550    |
| `voice-6.jpg`                | Testimonial marquee — Priya              | Landscape, ~800×550    |
| `adventure-base-camp.jpg`    | Featured — Ridge Base Camp               | Landscape, ~900×600    |
| `adventure-summit-trek.jpg`  | Featured — Sunrise Summit Trek           | Landscape, ~900×600    |
| `adventure-cliff-rope.jpg`   | Featured — Cliff & Rope Day              | Landscape, ~900×600    |
| `contact.jpg`                | Faint background of the enquiry section  | Landscape, ~1920×1080+ |

## Notes

- **Format:** `.jpg` is assumed above. `.webp` or `.png` are fine too — just keep the
  base name (e.g. `hero.webp`) and let me know so the extension is matched in the code.
- **File size:** aim for < 400 KB each (hero/contact can be a touch larger). Large
  photos will make the page slow to load. Resize/compress before adding.
- **Missing an image?** No problem — any file that isn't here yet will simply keep
  showing the current stock photo until you add it.

## Switching to local images

Right now `index.html` points at stock photos so the page works before your shoot.
When your images are in this folder, I'll repoint the code to `img/…`. If you'd
rather do it yourself, each stock URL in `index.html` maps 1:1 to a row above —
replace the `https://images.unsplash.com/...` value with `img/<filename>`.
