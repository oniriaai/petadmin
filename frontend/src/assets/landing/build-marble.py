"""Builds marble.webp, the veined tile behind the public page.

    python3 build-marble.py            # writes marble.webp beside this file
    python3 build-marble.py --preview DIR   # also writes it laid over Mármol and Tinta

Needs numpy and Pillow. The output is the same on every run (fixed seed).

The tile is a greyscale picture of the veins, white where the stone is marked. `Landing.tsx`
uses it as a luminance mask over the ink colour, so one file veins the light canvas dark and the
dark canvas light. Everything is built from noise that repeats over the unit square, so the tile
has no seam.

It is a picture and not a transparency on purpose. WebP compresses a picture lossily and keeps
its gradients; it only shrinks an alpha channel by cutting it down to a dozen levels, which
shows as flat bands with hard edges where the stone should shade off.

Three layers, strongest last:
  - clouding: broad, continuous shading, the stone's uneven body;
  - veins: the zero crossings of a diagonal wave bent by turbulence, which is what makes them
    run roughly one way, as in a cut slab, and wander instead of looping;
  - hairlines: the same at a finer scale and a fraction of the strength.
A slow mask thins each family of veins in and out, so no line crosses the tile at one weight.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 2048
SEED = 7
HERE = Path(__file__).parent


def perlin(x, y, freq, rng):
    """Gradient noise of period 1 in x and y, with `freq` cells across; roughly in [-1, 1]."""
    angles = rng.uniform(0, 2 * np.pi, (freq, freq))
    gx, gy = np.cos(angles), np.sin(angles)
    x, y = x * freq, y * freq
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    x0, y0, x1, y1 = x0 % freq, y0 % freq, (x0 + 1) % freq, (y0 + 1) % freq
    u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    n00 = gx[y0, x0] * fx + gy[y0, x0] * fy
    n10 = gx[y0, x1] * (fx - 1) + gy[y0, x1] * fy
    n01 = gx[y1, x0] * fx + gy[y1, x0] * (fy - 1)
    n11 = gx[y1, x1] * (fx - 1) + gy[y1, x1] * (fy - 1)
    top = n00 + u * (n10 - n00)
    bottom = n01 + u * (n11 - n01)
    return (top + v * (bottom - top)) * 1.5


def fbm(x, y, freq, octaves, rng, gain=0.5):
    """Octaves of `perlin`, each twice as fine and `gain` as strong; roughly in [-1, 1]."""
    total, amplitude, norm = 0.0, 1.0, 0.0
    for octave in range(octaves):
        total = total + amplitude * perlin(x, y, freq * 2**octave, rng)
        norm += amplitude
        amplitude *= gain
    return total / norm


def smoothstep(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def veins(x, y, rng, *, wave, turbulence, freq, width, power):
    """Lines where a diagonal wave, bent by turbulence, crosses zero.

    `wave` is how many times the wave repeats across the tile in x and y (whole numbers, so it
    tiles); `width` is the half-width of a line as a share of the wave's swing.
    """
    bend = fbm(x, y, freq, 4, rng, gain=0.45)
    phase = 2 * np.pi * (wave[0] * x + wave[1] * y) + turbulence * bend
    # Lines thicken and thin along their length.
    swell = 0.55 + 0.9 * smoothstep(-0.4, 0.5, fbm(x, y, freq * 2, 3, rng))
    line = np.clip(1 - np.abs(np.sin(phase)) / (width * swell), 0, 1) ** power
    present = smoothstep(-0.2, 0.35, fbm(x, y, max(2, freq // 2), 3, rng))
    return line * present


def build(size=SIZE):
    rng = np.random.default_rng(SEED)
    axis = ((np.arange(size) + 0.5) / size).astype(np.float32)
    x, y = np.meshgrid(axis, axis)

    # Everything is drawn in coordinates pushed about by a slow field, which keeps the veins
    # from running parallel. The push is periodic, so the tile still is.
    wx = x + 0.07 * fbm(x, y, 2, 4, rng)
    wy = y + 0.07 * fbm(x, y, 2, 4, rng)

    cloud = smoothstep(-0.25, 0.75, fbm(wx, wy, 2, 5, rng, gain=0.55))
    major = veins(wx, wy, rng, wave=(1, 2), turbulence=3.0, freq=2, width=0.06, power=1.6)
    minor = veins(wx, wy, rng, wave=(2, 3), turbulence=3.6, freq=3, width=0.04, power=1.4)
    hair = veins(wx, wy, rng, wave=(-3, 2), turbulence=4.0, freq=4, width=0.035, power=1.2)

    # Broad, weak bands along the same grain as the major lines but not under them: the
    # staining that runs beside a vein rather than a shadow of it.
    halo = veins(
        wx, wy, np.random.default_rng(SEED + 1), wave=(1, 2), turbulence=3.0, freq=2, width=0.5, power=2.2
    )

    marked = 0.20 * cloud + 0.16 * halo
    for layer, strength in ((hair, 0.22), (minor, 0.45), (major, 0.95)):
        marked = marked + (1 - marked) * strength * layer
    return np.clip(marked, 0, 1)


def main():
    veining = (build() * 255).round().astype(np.uint8)
    out = HERE / "marble.webp"
    Image.fromarray(veining, "L").convert("RGB").save(out, "WEBP", quality=60, method=6)
    print(f"{out.name}: {out.stat().st_size / 1024:.1f} KB")

    if "--preview" in sys.argv:
        target = Path(sys.argv[sys.argv.index("--preview") + 1])
        saved = np.asarray(Image.open(out).convert("L"), dtype=float) / 255
        # Two tiles across, at the strength the page lays them at.
        for name, canvas, ink, opacity in (
            ("light", (250, 248, 245), (28, 25, 23), 0.16),
            ("dark", (28, 25, 23), (250, 250, 249), 0.13),
        ):
            mask = np.tile(saved * opacity, (1, 2))[..., None]
            image = np.array(canvas) * (1 - mask) + np.array(ink) * mask
            Image.fromarray(image.round().astype(np.uint8)).save(target / f"marble-{name}.png")


if __name__ == "__main__":
    main()
