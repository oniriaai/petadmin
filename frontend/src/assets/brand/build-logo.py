"""Build the Argos Suite "Vasija de figuras negras" logo set from the brand guide drawing."""
import io, json, os, shutil, sys, zipfile
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import cairosvg
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]

TINTA = "#1c1917"
MARMOL = "#faf8f5"
TERRACOTA = "#ea580c"


def glyph_path(font, ch, x, baseline, size, rotate180=False):
    gs = font.getGlyphSet()
    upm = font["head"].unitsPerEm
    name = font.getBestCmap()[ord(ch)]
    adv = font["hmtx"][name][0]
    k = size / upm
    pen = SVGPathPen(gs)
    if rotate180:
        # Cinzel has no Λ: a V turned 180° gives a serif Λ with the thick stroke on the right, like A.
        cap = font["OS/2"].sCapHeight
        t = (-k, 0, 0, k, x + adv * k, baseline - cap * k)
    else:
        t = (k, 0, 0, -k, x, baseline)
    gs[name].draw(TransformPen(pen, t))
    return pen.getCommands(), adv * k


def word(font, text, x, baseline, size, tracking):
    parts, cx = [], x
    for i, ch in enumerate(text):
        if ch == "Λ":
            d, w = glyph_path(font, "V", cx, baseline, size, rotate180=True)
        else:
            d, w = glyph_path(font, ch, cx, baseline, size)
        parts.append(d)
        cx += w + (tracking if i < len(text) - 1 else 0)
    return " ".join(parts), cx - x


def hound(hx, hy, s):
    pts = [(-6, -40), (2, -14), (10, -8), (34, -2), (34, 4), (16, 10), (2, 30), (-24, 30), (-18, -14)]
    body = "M" + " L".join(f"{hx + a * s:.2f},{hy + b * s:.2f}" for a, b in pts) + " Z"
    eye = (hx + 8 * s, hy - 1 * s, 3.5 * s)
    return body, eye


def fret(x0, n, u, fy, h):
    d = [f"M{x0} {fy + h}H{x0 + n * u}"]
    for i in range(n):
        x = x0 + u * i
        d.append(f"M{x} {fy + h}V{fy}H{x + u * 2 / 3:.2f}V{fy + h * 2 / 3:.2f}H{x + u / 3:.2f}V{fy + h / 3:.2f}")
    return " ".join(d)


def circle_path(cx, cy, r):
    return f"M{cx - r:.2f},{cy:.2f} a{r:.2f},{r:.2f} 0 1,0 {2 * r:.2f},0 a{r:.2f},{r:.2f} 0 1,0 {-2 * r:.2f},0 Z"


f700 = TTFont(os.path.join(HERE, "fonts/Cinzel-700.ttf"))
f600 = TTFont(os.path.join(HERE, "fonts/Cinzel-600.ttf"))

# Geometry from the guide's drawing (tile 3), with the tile origin moved to 0.
DISC = (120, 84, 58)
HOUND = hound(114, 90, 1.15)
TX, FRET_U, FRET_N = 200, 24, 8
FRET_W = FRET_U * FRET_N

# Size the wordmark so ΛRGOS spans the meander band, as in the drawing.
_, w38 = word(f700, "ΛRGOS", 0, 0, 38, 4)
size = 38 * FRET_W / w38
argos_d, argos_w = word(f700, "ΛRGOS", TX, 78, size, 4 * size / 38)
_, sw = word(f600, "SUITE", 0, 0, 13, 0)
suite_track = (FRET_W * 0.5 - sw) / 4
suite_d, _ = word(f600, "SUITE", TX + 1, 102, 13, suite_track)
FRET_D = fret(TX, FRET_N, FRET_U, 116, 18)


def mark_group(disc, ink, eye, knockout=False, ids=""):
    body, (ex, ey, er) = HOUND
    cx, cy, r = DISC
    if knockout:
        # One colour: the disc with the hound cut out; the eye stays as a dot of disc colour.
        return (f'<path fill="{disc}" fill-rule="evenodd" d="{circle_path(cx, cy, r)} {body}"/>'
                f'<circle cx="{ex:.2f}" cy="{ey:.2f}" r="{er:.2f}" fill="{disc}"/>')
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{disc}"/>'
            f'<path fill="{ink}" d="{body}"/>'
            f'<circle cx="{ex:.2f}" cy="{ey:.2f}" r="{er:.2f}" fill="{eye}"/>')


def lockup_svg(word_c, accent, disc, ink, eye, knockout=False, bg=None, title="Argos Suite"):
    pad = 24
    x0, y0 = DISC[0] - DISC[2] - pad, DISC[1] - DISC[2] - pad
    x1, y1 = TX + FRET_W + pad, DISC[1] + DISC[2] + pad
    w, h = x1 - x0, y1 - y0
    bgr = f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {h}" width="{w}" height="{h}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{bgr}{mark_group(disc, ink, eye, knockout)}'
            f'<path fill="{word_c}" d="{argos_d}"/><path fill="{accent}" d="{suite_d}"/>'
            f'<path fill="none" stroke="{accent}" stroke-width="2.5" stroke-linejoin="round" d="{FRET_D}"/></svg>'), (w, h)


def mark_svg(disc, ink, eye, knockout=False, bg=None, pad=8, radius=0, title="Argos Suite"):
    cx, cy, r = DISC
    side = 2 * (r + pad)
    x0, y0 = cx - side / 2, cy - side / 2
    bgr = f'<rect x="{x0}" y="{y0}" width="{side}" height="{side}" rx="{radius}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {side} {side}" width="{side}" height="{side}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{bgr}{mark_group(disc, ink, eye, knockout)}</svg>')


def small_mark_svg(bg=None, radius=0):
    """For 16 to 32 px: the hound scaled up inside a disc that fills the square, eye dropped."""
    cx, cy = 120, 84
    body, _ = hound(114 + 0, 90, 1.32)
    r = 58
    side = 2 * r + 4
    x0, y0 = cx - side / 2, cy - side / 2
    bgr = f'<rect x="{x0}" y="{y0}" width="{side}" height="{side}" rx="{radius}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {side} {side}" width="{side}" height="{side}">'
            f'<title>Argos Suite</title>{bgr}<circle cx="{cx}" cy="{cy}" r="{r}" fill="{TERRACOTA}"/>'
            f'<clipPath id="d"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>'
            f'<path clip-path="url(#d)" fill="{TINTA}" d="{body}"/></svg>')


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as fh:
        fh.write(text)
    return p


def png(svg_text, rel, width=None, height=None):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    cairosvg.svg2png(bytestring=svg_text.encode(), write_to=p, output_width=width, output_height=height)
    return p


def pdf(svg_text, rel):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    cairosvg.svg2pdf(bytestring=svg_text.encode(), write_to=p)


shutil.rmtree(OUT, ignore_errors=True)

variants = {
    "color": dict(word_c=TINTA, accent=TERRACOTA, disc=TERRACOTA, ink=TINTA, eye=TERRACOTA),
    "on-dark": dict(word_c=MARMOL, accent=TERRACOTA, disc=TERRACOTA, ink=TINTA, eye=TERRACOTA),
    "mono-black": dict(word_c=TINTA, accent=TINTA, disc=TINTA, ink=None, eye=None, knockout=True),
    "mono-white": dict(word_c="#ffffff", accent="#ffffff", disc="#ffffff", ink=None, eye=None, knockout=True),
}

for name, v in variants.items():
    s, (w, h) = lockup_svg(**v)
    write(f"svg/argos-vasija-lockup-{name}.svg", s)
    pdf(s, f"pdf/argos-vasija-lockup-{name}.pdf")
    for px in (400, 800, 1600, 3200):
        png(s, f"png/lockup/argos-vasija-lockup-{name}-{px}w.png", width=px)
    m = mark_svg(v["disc"], v["ink"], v["eye"], v.get("knockout", False))
    write(f"svg/argos-vasija-mark-{name}.svg", m)
    pdf(m, f"pdf/argos-vasija-mark-{name}.pdf")
    for px in (64, 128, 256, 512, 1024):
        png(m, f"png/mark/argos-vasija-mark-{name}-{px}.png", width=px)

# Small devices.
small = small_mark_svg()
write("icons/favicon.svg", small)
for px in (16, 32, 48):
    png(small, f"icons/favicon-{px}x{px}.png", width=px)
imgs = [Image.open(os.path.join(OUT, f"icons/favicon-{px}x{px}.png")).convert("RGBA") for px in (16, 32, 48)]
imgs[2].save(os.path.join(OUT, "icons/favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=imgs[:2])

# iOS ignores transparency, so the touch icon sits on Mármol; Android icons stay transparent.
png(mark_svg(TERRACOTA, TINTA, TERRACOTA, bg=MARMOL, pad=14), "icons/apple-touch-icon.png", width=180)
std = mark_svg(TERRACOTA, TINTA, TERRACOTA, pad=4)
for px in (192, 512):
    png(std, f"icons/android-chrome-{px}x{px}.png", width=px)
# Maskable: launchers crop to a circle or squircle, so the disc stays inside the central 80 % safe zone.
mask = mark_svg(TERRACOTA, TINTA, TERRACOTA, bg=MARMOL, pad=58 * 0.25 + 4)
for px in (192, 512):
    png(mask, f"icons/maskable-{px}x{px}.png", width=px)
png(mark_svg(TERRACOTA, TINTA, TERRACOTA, bg=MARMOL, pad=40), "icons/mstile-150x150.png", width=150)

write("icons/site.webmanifest", json.dumps({
    "name": "Argos Suite",
    "short_name": "Argos",
    "icons": [
        {"src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "/maskable-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
        {"src": "/maskable-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
    "theme_color": TINTA,
    "background_color": MARMOL,
    "display": "standalone",
}, indent=2) + "\n")

write("icons/head-snippet.html", """<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1c1917">
""")

shutil.copy(os.path.join(HERE, "fonts/OFL.txt"), os.path.join(OUT, "Cinzel-OFL.txt"))
print("built", sum(len(fs) for _, _, fs in os.walk(OUT)), "files")
