"""Turn the supplied artwork into the icon files Android actually wants.

The source is a picture *of* an app icon: a rounded white card with a drop
shadow, floating on a near-white page, filling about 57% of its own canvas. Used
as-is it would be wrong three times over -- Android applies its own mask, so the
card's corners would be rounded twice and the shadow would be baked into a
square that gets clipped, and the mark itself would end up tiny inside whatever
shape the launcher draws.

So the mark is cut out of the card and re-composed:

  legacy mipmaps    the mark on white, filling 72% of the tile
  adaptive layers   foreground on transparent at 62% of the 108dp canvas (the
                    middle 72dp is all that survives a circular mask), with a
                    plain white background layer

Densities are the five Android asks for; 48dp at each multiplier.
"""

import pathlib
import sys

from PIL import Image

SRC = pathlib.Path(sys.argv[1])
RES = pathlib.Path(sys.argv[2])

# Measured from the source: the blue mark, ignoring the card and its shadow.
BLUE_MIN_DELTA = 40

# Alpha ramp for cutting the mark out of its card, in blue-minus-red.
#
# Measured rather than guessed, and the measurement is the point: the card's drop
# shadow is not grey, it is tinted blue, reaching b-r = 42 at its darkest. A
# threshold of 6 therefore kept the shadow at partial alpha and it reappeared as a
# ghost rounded-rectangle behind the mark in two successive renders. The mark
# itself sits at b-r = 253, so there is a wide gap to put the ramp in.
EDGE_LOW = 60
EDGE_HIGH = 140

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
BASE_DP = 48

# How much of the tile the mark fills. 0.72 for the legacy square icon, which is
# drawn as given; 0.62 for the adaptive foreground, whose canvas is 108dp with
# only the middle 72dp guaranteed to survive the launcher's mask -- 0.62 keeps
# the wave tips clear of a circle.
LEGACY_FILL = 0.72
ADAPTIVE_FILL = 0.62

WHITE = (255, 255, 255, 255)


def mark_bounds(img: Image.Image) -> tuple[int, int, int, int]:
    """Tight box around the blue artwork, found by colour rather than by alpha.

    The card and the page behind it are both near-white and the shadow is grey,
    so transparency and luminance are both useless here. Blue-minus-red is what
    separates the mark from everything that is not it.
    """
    rgb = img.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, _, b = px[x, y]
            if b - r > BLUE_MIN_DELTA:
                minx = min(minx, x)
                maxx = max(maxx, x)
                miny = min(miny, y)
                maxy = max(maxy, y)
    if minx > maxx:
        raise SystemExit("rasmda ko'k chizma topilmadi")
    return minx, miny, maxx + 1, maxy + 1


def cropped_mark(img: Image.Image) -> Image.Image:
    """The mark on a transparent square, centred on its own bounding box."""
    left, top, right, bottom = mark_bounds(img)
    # A square crop around the mark's centre, so composing it later cannot
    # stretch it. Padded by a few per cent so antialiased edges are not shaved.
    cx, cy = (left + right) / 2, (top + bottom) / 2
    side = max(right - left, bottom - top) * 1.04
    box = (
        int(cx - side / 2),
        int(cy - side / 2),
        int(cx + side / 2),
        int(cy + side / 2),
    )
    square = img.convert("RGBA").crop(box)

    # The crop still carries the card's white behind the mark. Turned
    # transparent so the same pixels can sit on the adaptive foreground layer,
    # where anything opaque would become a white square inside the mask.
    out = square.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            # Keyed on blueness, not on distance from white. Distance from white
            # also catches the card's grey drop shadow, which then reappears as a
            # ghost rounded-rectangle behind the mark -- visible in the first
            # render of this. Blue-minus-red is zero for every grey, whatever its
            # lightness, and large for every part of the mark.
            blueness = b - r
            if blueness <= EDGE_LOW:
                px[x, y] = (r, g, b, 0)
            elif blueness >= EDGE_HIGH:
                px[x, y] = (r, g, b, 255)
            else:
                # A ramp rather than a hard cut, so the antialiased outline stays
                # smooth instead of turning into stair-steps at 48px.
                t = (blueness - EDGE_LOW) / (EDGE_HIGH - EDGE_LOW)
                px[x, y] = (r, g, b, int(255 * t))
    return out



# ---------------------------------------------------------------- notification
#
# Android's status bar uses ONLY the alpha channel of a notification's small
# icon: every opaque pixel is painted a single flat colour. A full-colour icon
# therefore shows up as a solid white square -- which is exactly what this app
# shipped, on the one screen that matters most for a product whose entire job is
# notifications.
#
# So the small icon is the mark's silhouette: white where the mark is,
# transparent everywhere else. 24dp at each density, as Android asks.

NOTIFICATION_DP = 24
NOTIFICATION_FILL = 0.92  # the mark fills the tile; the system adds its own padding


def notification_icon(mark: Image.Image, size: int) -> Image.Image:
    """White silhouette of the mark on transparent."""
    inner = max(1, int(size * NOTIFICATION_FILL))
    scaled = mark.resize((inner, inner), Image.LANCZOS)
    # Colour is discarded: only the shape survives into the status bar.
    silhouette = Image.new("RGBA", scaled.size, (255, 255, 255, 0))
    silhouette.putalpha(scaled.getchannel("A"))
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile.alpha_composite(silhouette, ((size - inner) // 2, (size - inner) // 2))
    return tile


def compose(mark: Image.Image, size: int, fill: float, background) -> Image.Image:
    tile = Image.new("RGBA", (size, size), background)
    inner = max(1, int(size * fill))
    scaled = mark.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    tile.alpha_composite(scaled, (offset, offset))
    return tile


def main() -> None:
    source = Image.open(SRC)
    mark = cropped_mark(source)

    for name, mult in DENSITIES.items():
        out = RES / f"mipmap-{name}"
        out.mkdir(parents=True, exist_ok=True)
        (RES / f"drawable-{name}").mkdir(parents=True, exist_ok=True)
        size = int(BASE_DP * mult)

        compose(mark, size, LEGACY_FILL, WHITE).save(out / "ic_launcher.png")
        compose(mark, size, LEGACY_FILL, WHITE).save(out / "ic_launcher_round.png")

        adaptive = int(108 * mult)
        compose(mark, adaptive, ADAPTIVE_FILL, (0, 0, 0, 0)).save(
            out / "ic_launcher_foreground.png"
        )
        notif = int(NOTIFICATION_DP * mult)
        notification_icon(mark, notif).save(out.parent / f"drawable-{name}" / "ic_notification.png")
        print(f"  {name}: {size}px + {adaptive}px adaptive + {notif}px bildirishnoma")

    # A full-resolution copy, for the Play listing and anywhere else a big one
    # is wanted without re-deriving it from the original.
    compose(mark, 512, LEGACY_FILL, WHITE).convert("RGB").save(RES / "ic_launcher-512.png")
    print("  512px (do'kon uchun)")


if __name__ == "__main__":
    main()
