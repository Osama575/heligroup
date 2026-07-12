# Helicopter media manifest

Drop royalty-free helicopter photos here with these exact filenames so the
landing page picks them up automatically. Sources are royalty-free and
require no attribution to the user, though Pexels/Unsplash appreciate
credit somewhere if you can fit it.

If a file is missing the page degrades to a CSS gradient with the type name —
nothing breaks, it just looks less rich.

## Required files

```
public/img/
├── hero-poster.jpg            ← shown while video loads or as fallback
├── maintenance.jpg            ← HELI145 service card hero (1600×1000+)
├── training.jpg               ← HELI147 service card hero (1600×1000+)
└── types/
    ├── aw109.jpg
    ├── aw119.jpg
    ├── aw139.jpg
    ├── aw169.jpg
    ├── aw189.jpg
    ├── h125.jpg
    ├── h145.jpg
    └── bk117.jpg              ← any of the C2/D2/D3 variants
```

Type photos look best at ~1200×800. Cropped tight on the airframe is fine
— the cards crop to 4:3.

## Optional video

```
public/video/
└── hero.mp4                   ← 5–15s muted loop, 1920×1080 or 1280×720
```

Keep it under ~3 MB so it loads on mobile. WebM as a sibling
(`hero.webm`) is picked up automatically if present.

## Where to grab them (free, royalty-free)

- **pexels.com/search/helicopter/** — best for video. Filter by Orientation: Landscape.
- **unsplash.com/s/photos/helicopter** — best for stills.
- **pexels.com/search/aw139/**, /aw169/, /h145/, etc. — surprisingly decent type-specific results.
- **wikimedia.org** — search the type designation; many photos are CC-BY-SA. Attribute in the page footer if you use these.

For the type cards, the Wikipedia article for each helicopter type usually
has a clean side-on photo at the top — those are reliably licensed
(check each, most are CC).
