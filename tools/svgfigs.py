"""Convert the book's small TikZ diagrams to inline SVG.

Two vocabularies occur in the book:
  * graphs: \\node (n) at (x,y) {label};  \\draw[->] (a) -- (b);  self-loop arcs;
    optional \\draw (x,y) rectangle (x,y) frames (modal-logic models)
  * shape rows: \\node[circle, grey_shape] (c1) {A}; \\node[right=10pt of c1, ...]
"""
from __future__ import annotations

import math
import re


def _strip_comments(raw: str) -> str:
    return "\n".join(re.sub(r"(?<!\\)%.*", "", ln) for ln in raw.split("\n"))


def _label_text(s: str) -> str:
    s = s.strip().strip("$").strip()
    s = s.replace("\\enot", "¬").replace("\\lnot", "¬").replace("\\eand", "∧") \
         .replace("\\eor", "∨").replace("\\eif", "→").replace("\\eiff", "↔") \
         .replace("\\ebox", "□").replace("\\ediamond", "◇")
    s = re.sub(r"\s+", "", s) if "¬" in s else s
    return s.replace("{", "").replace("}", "")


def tikz_to_svg(raw: str) -> str | None:
    raw = _strip_comments(raw)
    if re.search(r"\\node\s*\[", raw):
        return _shapes_svg(raw)
    return _graph_svg(raw)


# ----------------------------------------------------------------- graphs

def _graph_svg(raw: str) -> str | None:
    nodes = {}
    for m in re.finditer(r"\\node\s*\((\w+)\)\s*at\s*\(([-\d.]+),\s*([-\d.]+)\)\s*\{(.*?)\}\s*;", raw):
        nodes[m.group(1)] = (float(m.group(2)), float(m.group(3)), _label_text(m.group(4)))
    if not nodes:
        return None
    edges, loops, rects = [], [], []
    for stmt in re.findall(r"\\draw.*?;", raw, re.S):
        stmt = stmt.replace("\n", " ")
        m = re.search(r"\((\w+)\)\s*-+\s*\((\w+)\)", stmt)
        if m:
            a, b = m.group(1), m.group(2)
            if "<->" in stmt:
                edges.append((a, b, True))
            elif "<-" in stmt and "->" not in stmt:
                edges.append((b, a, False))
            else:
                edges.append((a, b, False))
            continue
        m = re.search(r"\((\w+)\)\+\(([-\d.]+),([-\d.]+)\)\s*arc", stmt)
        if m:
            loops.append((m.group(1), float(m.group(2)), float(m.group(3))))
            continue
        m = re.search(r"\(([-\d.]+),([-\d.]+)\)\s*rectangle\s*\(([-\d.]+),([-\d.]+)\)", stmt)
        if m:
            rects.append(tuple(float(x) for x in m.groups()))
            continue
        return None
    framed = bool(rects)
    scale = 70
    xs = [v[0] for v in nodes.values()] + [r[0] for r in rects] + [r[2] for r in rects]
    ys = [v[1] for v in nodes.values()] + [r[1] for r in rects] + [r[3] for r in rects]
    pad = 36
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    w = (maxx - minx) * scale + 2 * pad
    h = (maxy - miny) * scale + 2 * pad

    def P(x, y):
        return ((x - minx) * scale + pad, (maxy - y) * scale + pad)

    r = 12 if framed else 14
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img" class="fig-graph">']
    out.append('<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>')
    out.append('<g stroke="currentColor" stroke-width="1.6" fill="none">')
    for (x1, y1, x2, y2) in rects:
        (ax, ay), (bx, by) = P(x1, y1), P(x2, y2)
        out.append(f'<rect x="{min(ax,bx):.1f}" y="{min(ay,by):.1f}" width="{abs(bx-ax):.1f}" height="{abs(by-ay):.1f}" stroke-width="1.2"/>')
    for a, b, both in edges:
        (x1, y1), (x2, y2) = P(*nodes[a][:2]), P(*nodes[b][:2])
        dx, dy = x2 - x1, y2 - y1
        d = math.hypot(dx, dy) or 1
        ux, uy = dx / d, dy / d
        sx, sy = x1 + ux * (r + 2), y1 + uy * (r + 2)
        ex, ey = x2 - ux * (r + 2), y2 - uy * (r + 2)
        ms = ' marker-start="url(#arr)"' if both else ""
        out.append(f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" marker-end="url(#arr)"{ms}/>')
    for name, ox, oy in loops:
        x, y = P(*nodes[name][:2])
        sx = -1 if ox < 0 else 1
        sy = -1 if oy > 0 else 1
        cx, cy = x + sx * (r + 10), y + sy * (r + 10)
        lr = 11
        a0 = math.atan2(y - cy, x - cx)
        start = (cx + lr * math.cos(a0 + 0.9), cy + lr * math.sin(a0 + 0.9))
        end = (cx + lr * math.cos(a0 - 0.9), cy + lr * math.sin(a0 - 0.9))
        out.append(f'<path d="M{start[0]:.1f},{start[1]:.1f} A{lr},{lr} 0 1 1 {end[0]:.1f},{end[1]:.1f}" marker-end="url(#arr)"/>')
    out.append("</g>")
    for name, (x, y, label) in nodes.items():
        px, py = P(x, y)
        is_world = label.isdigit()
        if not framed:
            out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r}" fill="var(--fig-node, #fff)" stroke="currentColor" stroke-width="1.4"/>')
        elif is_world:
            out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r}" fill="var(--fig-node, #fff)" stroke="currentColor" stroke-width="1.2"/>')
        style = 'font-style="italic"' if not is_world else ""
        out.append(f'<text x="{px:.1f}" y="{py + 5:.1f}" text-anchor="middle" font-size="15" {style} fill="currentColor" font-family="inherit">{label}</text>')
    out.append("</svg>")
    return "".join(out)


# ------------------------------------------------------------- shape rows

def _shapes_svg(raw: str) -> str | None:
    items = []
    for m in re.finditer(r"\\node\s*\[([^\]]*)\]\s*\((\w+)\)\s*\{(.*?)\}\s*;", raw):
        opts, name, label = m.group(1), m.group(2), m.group(3).strip()
        shape = "circle" if "circle" in opts else ("diamond" if "diamond" in opts else "square")
        fill = "grey" if "grey_shape" in opts else ("none" if "phantom" in opts else "white")
        items.append((name, shape, fill, label))
    if not items:
        return None
    size = 34
    gap = 14
    pad = 6
    w = pad * 2 + len(items) * size + (len(items) - 1) * gap
    h = size + pad * 2
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" class="fig-shapes">']
    x = pad
    for name, shape, fill, label in items:
        cx, cy = x + size / 2, pad + size / 2
        f = {"grey": "var(--fig-grey, #c8c8c8)", "white": "var(--fig-node, #fff)", "none": "none"}[fill]
        stroke = "none" if fill == "none" else "currentColor"
        if shape == "circle":
            out.append(f'<circle cx="{cx}" cy="{cy}" r="{size/2}" fill="{f}" stroke="{stroke}" stroke-width="1.6"/>')
        elif shape == "square":
            out.append(f'<rect x="{x}" y="{pad}" width="{size}" height="{size}" fill="{f}" stroke="{stroke}" stroke-width="1.6"/>')
        if label:
            out.append(f'<text x="{cx}" y="{cy + 5.5}" text-anchor="middle" font-size="16" font-style="italic" fill="currentColor" font-family="inherit">{label}</text>')
        x += size + gap
    out.append("</svg>")
    return "".join(out)
