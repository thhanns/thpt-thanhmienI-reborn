# thpt-thanhmienI-reborn
Yes, I remade my high school website because it looked... uh... not good

Then it got remade again, this time around Apple's Liquid Glass.

## Structure

All four pages now share one design system instead of each carrying its own
copy of the CSS. HTML dropped from 3,443 lines to 838.

```
assets/
  liquid-glass.css   the material: tint, bevel light, specular rim, press
  liquid-glass.js    the refraction engine (canvas map -> SVG filter)
  glass-ui.css       the page design: ground, type, layout, components
  site.js            shared behaviour: nav, reveal, ambient ground, form
index.html  news.html  contact.html  news/thu-ngo.html
```

## Liquid Glass

Not a blur with a white overlay. A canvas paints a displacement map for each
surface, an SVG filter reads it through `feDisplacementMap`, and
`backdrop-filter` points at that filter, so the surface bends what is behind
it. The displacement runs three times at slightly different strengths, which
is what makes the colour fringing along the rim.

```html
<div data-glass>...</div>                    <!-- refracting glass -->
<div data-glass data-glass-dense>...</div>   <!-- text heavy, stays readable -->
```

| attribute                  | does                                    |
| -------------------------- | --------------------------------------- |
| `data-glass`               | enable                                  |
| `data-glass-dense`         | lift the backdrop so text stays legible  |
| `data-glass-bevel="18"`    | width of the bevel band, px             |
| `data-glass-refract="1.3"` | refraction multiplier for this surface  |
| `data-glass-static`        | skip the entrance sweep                 |

Tune globally: `LiquidGlass.configure({ refract: 15, bevel: 18, dispersion: 9 })`

## The ground

Refraction is invisible over a soft gradient, because there is nothing in it to
bend. So the ground is built in layers: the school's own campus photograph
blurred to colour, aurora fields for luminance, and a fine 1px rule that gives
the bevel something crisp to bite on. That rule is the reason the glass reads
as glass rather than as frost.

## Notes for future edits

- **The aurora only drifts while the hero is on screen.** A moving backdrop
  forces every glass surface above it to re-run its displacement passes every
  frame. Below the fold the panes are many, so down there the ground holds
  still. Pages without a hero never animate at all.
- **Never nest `data-glass` inside `data-glass`.** A backdrop-filter inside
  another one samples its parent instead of the page. The callout inside the
  Thư ngỏ article is painted rather than filtered for exactly this reason.
- **The scroll reveal is gated behind `.js-reveal`**, set by a one line inline
  script in `<head>`. CSS must never hide content on its own: if the observer
  failed to run, or JS is off, every section below the hero would stay
  invisible. There is also a 2.6s failsafe that reveals anything still hidden.
  Content wins over choreography.
- **The material never sets `position`, `border-radius` or `transition`** on a
  host element, and never touches its `::before` / `::after`. Both rules exist
  because breaking them broke real things during the first pass.
- Only Chromium can put an SVG `url()` filter inside `backdrop-filter`. Safari
  and Firefox fall back to a painted bevel automatically. Check with
  `LiquidGlass.supported`.

## Type

**Be Vietnam Pro** for display, **Inter** for body. Be Vietnam Pro is drawn for
Vietnamese, so stacked diacritics (ề, ữ, ợ) keep their spacing at large sizes
instead of getting clipped the way generic faces clip them.

## One content thing to check

The homepage stat says **15+ Năm thành lập**, but the Thư ngỏ article says the
school was founded in 1965 and has "trải qua 59 năm". Both were in the original
site and I left both exactly as they were, since correcting a school's own
published figures is your call, not mine.

## Backups

- `_backup_pre_liquid_glass/` — the original site, before any of this
- `_backup_pre_redesign/` — after glass was added, before the redesign

Delete both whenever you are happy.
