#!/usr/bin/env python3
"""Convert the forall x: Calgary LaTeX source into JSON for the web app.

Usage: python3 tools/convert.py          (writes content/build/*)

Writes:
  content/build/book.json            table of contents, glossary, label index
  content/build/chapters/<id>.json   one file per chapter / appendix
  content/build/report.txt           coverage report (unhandled macros etc.)
"""
from __future__ import annotations

import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from texparse import (Amp, Cmd, Env, Group, Math, Par, Text, Verb,  # noqa: E402
                      Parser, preprocess)
from svgfigs import tikz_to_svg  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "content", "source")
OUT = os.path.join(ROOT, "content", "build")

PART_FILES = ["what", "tfl", "truthtables", "prooftfl", "fol",
              "interpretations", "prooffol", "ml", "metatheory"]
APPENDIX_FILES = ["notation", "alternatives", "quickreference"]
SOL_FILES = ["what", "tfl", "truthtables", "prooftfl", "fol",
             "interpretations", "prooffol", "ml", "metatheory"]

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]

PROOF_CHAPTERS_TFL = {17, 18, 19, 20, 21}
PROOF_CHAPTERS_FOL = {36, 37, 38, 39, 40}
PROOF_CHAPTERS_ML = {43}
TT_CHAPTERS = {9, 10, 11, 12, 13, 14, 15}

report: dict[str, list[str]] = {}
counts: Counter = Counter()


def note(key: str, where: str = ""):
    report.setdefault(key, []).append(where)


# ------------------------------------------------------------------ math

def _replace_macro(s: str, name: str, nargs: int, fn) -> str:
    """Replace \\name{a}{b} (balanced braces) using fn(a, b)."""
    pat = re.compile(r"\\" + name + r"(?![A-Za-z])")
    out = []
    i = 0
    while True:
        m = pat.search(s, i)
        if not m:
            out.append(s[i:])
            break
        out.append(s[i:m.start()])
        j = m.end()
        args = []
        ok = True
        for _ in range(nargs):
            while j < len(s) and s[j] in " \t\n":
                j += 1
            if j < len(s) and s[j] == "{":
                d = 1
                k = j + 1
                while k < len(s) and d:
                    if s[k] == "{":
                        d += 1
                    elif s[k] == "}":
                        d -= 1
                    k += 1
                args.append(s[j + 1:k - 1])
                j = k
            elif j < len(s):
                args.append(s[j])
                j += 1
            else:
                ok = False
                break
        if not ok:
            out.append(s[m.start():])
            break
        out.append(fn(*args))
        i = j
    return "".join(out)


MATH_SIMPLE = {
    "enot": r"\lnot", "eand": r"\land", "eor": r"\lor", "eif": r"\rightarrow",
    "eiff": r"\leftrightarrow", "ered": r"\bot", "ebox": r"\Box",
    "ediamond": r"\Diamond", "proves": r"\vdash", "entails": r"\vDash",
    "nproves": r"\nvdash", "nentails": r"\nvDash", "mlK": r"\mathbf{K}",
    "mlT": r"\mathbf{T}", "mlSfour": r"\mathbf{S4}", "mlSfive": r"\mathbf{S5}",
    "texttherefore": r"\therefore", "ifeff": r"\text{iff}",
    "blank": r"\underline{\hspace{2em}}", "maththe": r"\text{℩}",
    "dots": r"\ldots", "small": "", "normalsize": "", "footnotesize": "",
    "protect": "", "noindent": "", "relax": "", "mathem": "",
    "textsc": r"\text", "mbox": r"\text", "emph": r"\textit",
    "textquoteright": "'", "S": r"\S", "ne": r"\neq",
}


MATH_FIXUPS = {
    # upstream typos (stray brackets); keys are the raw math as written in the source
    "(M \\eor \\enot M": "(M \\eor \\enot M)",
    "A \\eor \\forall x\\,\\atom{B}{x}) \\therefore \\forall x(A \\eor \\atom{B}{x})":
        "A \\eor \\forall x\\,\\atom{B}{x} \\therefore \\forall x(A \\eor \\atom{B}{x})",
    "\\forall x(A \\eor \\atom{B}{x}) \\therefore A \\eor \\forall x\\,\\atom{B}{x})":
        "\\forall x(A \\eor \\atom{B}{x}) \\therefore A \\eor \\forall x\\,\\atom{B}{x}",
}
# upstream label slips in proofs: (formula latex, refs as resolved) -> corrected refs
FITCH_REF_FIXUPS = {
    ("\\Box A \\rightarrow \\Box \\Box A", "1\u20136"): "1\u20134",
}


def convert_math(raw: str) -> str:
    """Turn book LaTeX math into KaTeX-friendly LaTeX."""
    s = MATH_FIXUPS.get(raw.strip(), raw)
    for k, v in MATH_SIMPLE.items():
        s = re.sub(r"\\" + k + r"(?![A-Za-z])", lambda m, v=v: v + (" " if v and v[-1].isalpha() else ""), s)
    for _ in range(4):
        s = _replace_macro(s, "atom", 2, lambda a, b: f" {a}({b})")
        if "\\atom" not in s:
            break
    s = _replace_macro(s, "metav", 1, lambda a: "\\mathcal{" + a + "}")
    s = _replace_macro(s, "script", 1, lambda a: "\\mathcal{" + a + "}")
    s = _replace_macro(s, "ntuple", 1, lambda a: "\\langle " + a + "\\rangle")
    s = _replace_macro(s, "model", 1, lambda a: "\\mathbb{" + a + "}")
    s = _replace_macro(s, "extension", 1, lambda a: "\\operatorname{extension}(" + a + ")")
    s = _replace_macro(s, "referent", 1, lambda a: "\\operatorname{referent}(" + a + ")")
    s = _replace_macro(s, "gap", 1, lambda a: "\\underline{\\hspace{2em}}_{" + a + "}")
    s = _replace_macro(s, "ensuremath", 1, lambda a: a)
    s = _replace_macro(s, "TTbf", 1, lambda a: "\\mathbf{" + a + "}")
    s = _replace_macro(s, "define", 1, lambda a: "\\textsc{" + a + "}")
    s = _replace_macro(s, "foreignlanguage", 2, lambda a, b: b)
    s = _replace_macro(s, "textcolor", 2, lambda a, b: b)
    s = _replace_macro(s, "myanswer", 1, lambda a: a)
    for k, v in MATH_SIMPLE.items():
        s = re.sub(r"\\" + k + r"(?![A-Za-z])", lambda m, v=v: v + (" " if v and v[-1].isalpha() else ""), s)
    # \textsc is unsupported by KaTeX; use \text
    s = s.replace("\\textsc{", "\\text{")
    # KaTeX has no \S in math; use the glyph
    s = s.replace("\\S ", "\\text{§}")
    # KaTeX's array does not accept @{} column separators (the book uses them to tighten
    # truth-table columns); drop them, the widths are cosmetic.
    s = re.sub(r"\\begin\{array\}\{((?:[^{}]|@\{\})*)\}",
               lambda m: "\\begin{array}{" + m.group(1).replace("@{}", "") + "}", s)
    # \fbox inside math is text mode in KaTeX (its contents and the nested $...$ fail);
    # \boxed is the math-mode equivalent, and the $ switches become redundant.
    if "\\fbox{" in s:
        s = s.replace("\\fbox{", "\\boxed{").replace("$", "")
    s = re.sub(r"\s+", " ", s).strip()
    # leftover unknown macros?
    for m in re.finditer(r"\\([A-Za-z]+)", s):
        if m.group(1) not in KATEX_OK:
            counts["math-macro:" + m.group(1)] += 1
    return s


KATEX_OK = set("""
lnot land lor rightarrow leftrightarrow bot Box Diamond vdash vDash nvdash nvDash
mathbf mathcal mathbb text textit textbf operatorname langle rangle underline hspace
therefore ldots cdots vdots forall exists neg wedge vee Leftrightarrow Rightarrow
left right bigl bigr Bigl Bigr quad qquad frac sqrt in notin subseteq subset cup cap
emptyset infty le ge leq geq neq ne times cdot sum prod to mapsed mapsto phantom
Delta Gamma Sigma Omega alpha beta gamma delta epsilon iota kappa lambda mu nu pi
rho sigma tau phi chi psi omega varphi equiv approx sim circ star dagger ast prime
vert mid colon dotsc dotsb dots top bigvee bigwedge mathrm mathit mathsf mathtt
overline widehat hat bar tilde vec stackrel overset underset binom pm mp div
backslash setminus implies iff impliedby lceil rceil lfloor rfloor rule
smallskip medskip bigskip textsc small normalsize varnothing ll gg Longrightarrow
longrightarrow Leftarrow leftarrow uparrow downarrow nearrow searrow mathord
mathbin mathrel textrm textsf texttt color textcolor kern mkern mskip
triangleright triangleleft blacktriangleright bullet circ ddots raisebox begin end hline array fbox boxed heartsuit supset overbrace underbrace nu intertext
""".split())


MATHCAL = {c: chr(0x1D49C + ord(c) - ord("A")) for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}
# a few script capitals are missing from the block
MATHCAL.update({"B": "ℬ", "E": "ℰ", "F": "ℱ", "H": "ℋ", "I": "ℐ", "L": "ℒ",
                "M": "ℳ", "R": "ℛ"})


def to_logic(latex: str) -> str:
    """KaTeX-style latex -> compact Unicode logic string for the app's parser."""
    s = latex
    s = _replace_macro(s, "mathcal", 1, lambda a: "".join(MATHCAL.get(c, c) for c in a))
    s = _replace_macro(s, "mathbf", 1, lambda a: a)
    s = _replace_macro(s, "text", 1, lambda a: " " + a + " ")
    s = _replace_macro(s, "textit", 1, lambda a: a)
    s = _replace_macro(s, "operatorname", 1, lambda a: a)
    s = s.replace("\\underline{\\hspace{2em}}", "___")
    rep = {
        r"\lnot": "¬", r"\neg": "¬", r"\land": "∧", r"\wedge": "∧", r"\lor": "∨",
        r"\vee": "∨", r"\rightarrow": "→", r"\to": "→", r"\leftrightarrow": "↔",
        r"\bot": "⊥", r"\forall": "∀", r"\exists": "∃", r"\Box": "□",
        r"\Diamond": "◇", r"\therefore": "∴", r"\vdash": "⊢", r"\vDash": "⊨",
        r"\nvdash": "⊬", r"\nvDash": "⊭", r"\neq": "≠", r"\ne": "≠",
        r"\Leftrightarrow": "⇔", r"\Rightarrow": "⇒", r"\langle": "⟨",
        r"\rangle": "⟩", r"\ldots": "…", r"\dots": "…", r"\cdots": "…",
        r"\bigl": "", r"\bigr": "", r"\Bigl": "", r"\Bigr": "", r"\left": "",
        r"\right": "", r"\,": "", r"\;": " ", r"\!": "", r"\ ": " ",
        r"\quad": " ", r"\qquad": " ", r"\in": "∈", r"\emptyset": "∅",
        r"\subseteq": "⊆", r"\cup": "∪", r"\cap": "∩", r"\mathcal": "",
        r"\Delta": "Δ", r"\Gamma": "Γ", r"\phantom": "", r"\textbf": "",
        r"\mathbf": "", r"\textsc": "", r"\textit": "", r"\mathit": "", r"\iota": "ι",
        r"\infty": "∞", r"\equiv": "≡", r"\top": "⊤", r"\mid": "|",
    }
    for k in sorted(rep, key=len, reverse=True):
        s = s.replace(k, rep[k])
    s = s.replace("{", "").replace("}", "")
    s = re.sub(r"\s+", " ", s).strip()
    if "\\" in s:
        counts["to_logic-leftover"] += 1
        note("to_logic leftover", s)
    return s


# -------------------------------------------------------------- text utils

TEXT_LIGATURES = [
    ("---", "—"), ("--", "–"), ("``", "“"), ("''", "”"),
    ("`", "‘"), ("'", "’"), ("~", " "),
]


def tex_text(s: str) -> str:
    for a, b in TEXT_LIGATURES:
        s = s.replace(a, b)
    return s


ACCENTS = {'"': "̈", "'": "́", "`": "̀", "^": "̂",
           "~": "̃", "c": "̧", "v": "̌", "H": "̋",
           "u": "̆", "r": "̊", "=": "̄", ".": "̇"}

SYMBOL_CMDS = {
    "eand": r"\land", "eor": r"\lor", "enot": r"\lnot", "eif": r"\rightarrow",
    "eiff": r"\leftrightarrow", "ered": r"\bot", "ebox": r"\Box",
    "ediamond": r"\Diamond", "proves": r"\vdash", "entails": r"\vDash",
    "nproves": r"\nvdash", "nentails": r"\nvDash", "mlK": r"\mathbf{K}",
    "mlT": r"\mathbf{T}", "mlSfour": r"\mathbf{S4}", "mlSfive": r"\mathbf{S5}",
    "forall": r"\forall", "exists": r"\exists", "lnot": r"\lnot",
    "land": r"\land", "lor": r"\lor", "neg": r"\lnot", "wedge": r"\land",
    "vee": r"\lor", "rightarrow": r"\rightarrow", "leftrightarrow": r"\leftrightarrow",
    "Leftrightarrow": r"\Leftrightarrow", "Rightarrow": r"\Rightarrow",
    "bot": r"\bot", "Box": r"\Box", "Diamond": r"\Diamond", "maththe": r"\text{℩}",
}

TEXT_CMDS = {
    "ldots": "…", "dots": "…", "cdots": "⋯", "vdots": "⋮",
    "texttherefore": "∴", "therefore": "∴", "ifeff": "iff",
    "S": "§", "ss": "ß", "L": "Ł", "l": "ł", "LaTeX": "LaTeX",
    "TeX": "TeX", "copyright": "©", "textbackslash": "\\", "textendash": "–",
    "textemdash": "—", "textquoteleft": "‘", "textquoteright": "’",
    "textquotedblleft": "“", "textquotedblright": "”", "slash": "/",
    "textbullet": "•", "textasciitilde": "~", "textgreater": ">",
    "textless": "<", "quad": " ", "qquad": "  ", ",": " ",
    " ": " ", "&": "&", "%": "%", "$": "$", "#": "#", "_": "_", "{": "{", "}": "}",
    ";": " ", "!": "", "/": "", "-": "", "@": "", "lxFcn": "",
}

IGNORE_CMDS = {
    "vspace", "hspace", "noindent", "hfill", "vfill", "bigskip", "medskip",
    "smallskip", "newpage", "clearpage", "protect", "relax", "small",
    "footnotesize", "large", "Large", "LARGE", "normalsize", "scriptsize",
    "tiny", "centering", "raggedright", "label", "index", "addcontentsline",
    "addtocontents", "sectionmark", "markright", "setcounter", "stepcounter",
    "refstepcounter", "solutions", "leftsolutions", "bmlDescription",
    "bmlPlusClass", "nocite", "glsaddall", "hrulefill", "onecolumn", "null",
    "phantom", "hphantom", "ignorespaces", "ignorespacesafterend",
    "selectfont", "fontsize", "sffamily", "rmfamily", "setlength", "newlength",
    "renewcommand", "newcommand", "renewenvironment", "newenvironment",
    "setkeys", "usepackage", "thispagestyle", "pagestyle", "tikzset",
    "midsloppy", "ndrules", "arraybackslash", "hsize", "linebreak", "newline",
    "nolinebreak", "nopagebreak", "pagebreak", "allowbreak", "penalty",
    "kern", "vskip", "hskip", "medbreak", "goodbreak", "nobreak", "samepage",
    "enlargethispage", "phantomsection", "currentpdfbookmark", "appendix",
    "frontmatter", "mainmatter", "backmatter", "tableofcontents",
    "printglossaries", "glsadd", "setlist", "newlist", "restartlist",
    "mathemwd", "mathem", "lxBeginTableHead", "lxEndTableHead",
    "gitAbbrevHash", "gitCommitterDate", "stockwidth", "stockheight",
    "barlength", "forallxversion", "bmlimage", "def", "extracolsep",
    "newcolumntype", "columnbreak", "addtodef", "includegraphics",
    "textwidth", "linewidth", "columnwidth", "textheight", "cline",
}


def plain(inl: list) -> str:
    """Plain text of a list of inline nodes (math rendered as logic string)."""
    out = []
    for n in inl:
        t = n.get("type")
        if t == "text":
            out.append(n["text"])
        elif t == "math":
            out.append(to_logic(n["latex"]))
        elif t in ("emph", "strong", "sc", "define", "link", "nobr", "sup", "u", "box", "mono"):
            out.append(plain(n.get("children", [])))
        elif t == "code":
            out.append(n["text"])
        elif t == "gls":
            out.append(n.get("text") or n.get("key", ""))
        elif t == "ref":
            out.append(n.get("text") or "[ref]")
        elif t == "blank":
            out.append("___")
        elif t == "forallx":
            out.append("forall x")
        elif t == "br":
            out.append("\n")
    return "".join(out)


# -------------------------------------------------------------- renderer

class Renderer:
    def __init__(self, book):
        self.book = book
        self.labels = book["labels"]
        self.chapter = None        # current chapter dict
        self.chap_num = 0          # numeric chapter counter
        self.part_num = 0
        self.sec = 0
        self.subsec = 0
        self.enum = 0              # enumerate counter (per chapter)
        self.foot = 0
        self.table_num = 0
        self.target = None         # most recent label target
        self.in_exercises = False
        self.part_letter = 0
        self.mode = "book"         # or "solutions"
        self.chapter_id = None
        self.macros = {}

    # -- labels / targets
    def set_target(self, kind, num, anchor=None, text=None):
        self.target = {"kind": kind, "num": num, "chapter": self.chapter_id,
                       "anchor": anchor or f"{kind}-{num}".replace(".", "-"),
                       "text": text}

    def add_label(self, name):
        if self.mode != "book":
            return
        if self.target is None:
            note("label without target", name)
            return
        if name in self.labels and self.labels[name] != self.target:
            # duplicates occur in HTML/print branches; keep first
            return
        self.labels[name] = dict(self.target)

    # -- inlines
    def inlines(self, nodes, ctx=None) -> list:
        out: list = []

        def push_text(s):
            if out and out[-1].get("type") == "text":
                out[-1]["text"] += s
            else:
                out.append({"type": "text", "text": s})

        i = 0
        nodes = list(nodes)
        while i < len(nodes):
            n = nodes[i]
            i += 1
            if isinstance(n, Text):
                push_text(tex_text(n.text))
            elif isinstance(n, Par):
                out.append({"type": "parbreak"})
            elif isinstance(n, Math):
                out.append({"type": "math", "latex": convert_math(n.raw), "display": n.display})
            elif isinstance(n, Group):
                out.extend(self.inlines(n.children, ctx))
            elif isinstance(n, Verb):
                out.append({"type": "code", "text": n.text})
            elif isinstance(n, Amp):
                push_text("&")
            elif isinstance(n, Env):
                # inline-level env: just recurse (tabular etc. handled as blocks)
                blk = self.env_block(n)
                if blk is not None:
                    out.append({"type": "block", "block": blk})
                else:
                    out.extend(self.inlines(n.children, ctx))
            elif isinstance(n, Cmd):
                r = self.inline_cmd(n, ctx)
                if r is None:
                    continue
                if isinstance(r, list):
                    for x in r:
                        if x.get("type") == "text":
                            push_text(x["text"])
                        else:
                            out.append(x)
                elif r.get("type") == "text":
                    push_text(r["text"])
                else:
                    out.append(r)
        return out

    def arg_inlines(self, c: Cmd, k=0, ctx=None):
        return self.inlines(c.args[k].children, ctx) if len(c.args) > k else []

    def inline_cmd(self, c: Cmd, ctx):
        name = c.name
        if name in self.macros:
            return self.inlines(self.macros[name].children, ctx)
        if name in IGNORE_CMDS:
            if name == "label":
                self.add_label(c.args[0].raw.strip())
            return None
        if name in TEXT_CMDS:
            return {"type": "text", "text": TEXT_CMDS[name]}
        if name in SYMBOL_CMDS:
            return {"type": "math", "latex": SYMBOL_CMDS[name]}
        if name in ACCENTS:
            base = plain(self.arg_inlines(c)) if c.args else ""
            return {"type": "text", "text": unicodedata.normalize("NFC", base + ACCENTS[name])}
        if name == "\\":
            return {"type": "br"}
        if name == "\n":
            return {"type": "text", "text": " "}
        if name == "text":
            return self.arg_inlines(c, 0, ctx)
        if name == "nu":
            return {"type": "math", "latex": "\\nu"}
        if name == "settowidth":
            return None
        if name in ("emph", "textit"):
            return {"type": "emph", "children": self.arg_inlines(c, 0, ctx)}
        if name in ("textbf", "TTbf"):
            return {"type": "strong", "children": self.arg_inlines(c, 0, ctx)}
        if name == "textsc":
            return {"type": "sc", "children": self.arg_inlines(c, 0, ctx)}
        if name in ("texttt",):
            return {"type": "code", "text": plain(self.arg_inlines(c, 0, ctx))}
        if name in ("textsf", "textrm", "lowercase", "uppercase", "MakeUppercase",
                    "MakeLowercase", "textcolor", "fbox", "arialabel", "enquote"):
            k = 1 if name == "textcolor" else 0
            ch = self.arg_inlines(c, k, ctx)
            if name == "enquote":
                return [{"type": "text", "text": "“"}] + ch + [{"type": "text", "text": "”"}]
            if name == "fbox":
                return {"type": "box", "children": ch}
            return ch
        if name == "mbox":
            return {"type": "nobr", "children": self.arg_inlines(c, 0, ctx)}
        if name == "underline":
            return {"type": "u", "children": self.arg_inlines(c, 0, ctx)}
        if name == "textsuperscript":
            return {"type": "sup", "children": self.arg_inlines(c, 0, ctx)}
        if name == "define":
            ch = self.arg_inlines(c, 0, ctx)
            return {"type": "define", "term": plain(ch), "children": ch}
        if name == "footnote":
            self.foot += 1
            return {"type": "footnote", "n": self.foot, "children": self.arg_inlines(c, 0, ctx)}
        if name in ("cref", "Cref", "ref", "pageref"):
            lab = c.args[0].raw.strip()
            if "," in lab:
                labs = [x.strip() for x in lab.split(",")]
                return {"type": "ref", "label": labs[0], "labels": labs, "variant": name}
            return {"type": "ref", "label": lab, "variant": name}
        if name in ("crefrange", "Crefrange"):
            return {"type": "ref", "label": c.args[0].raw.strip(), "label2": c.args[1].raw.strip(),
                    "variant": name}
        if name == "hyperref":
            lab = (c.opts[0] or "").strip() if c.opts else ""
            return {"type": "ref", "label": lab, "variant": "hyperref",
                    "children": self.arg_inlines(c, 0, ctx)}
        if name == "href":
            return {"type": "link", "href": c.args[0].raw.strip().replace("\\%", "%"),
                    "children": self.arg_inlines(c, 1, ctx)}
        if name == "url":
            u = c.args[0].raw.strip().replace("\\%", "%")
            return {"type": "link", "href": u, "children": [{"type": "text", "text": u}]}
        if name in ("gls", "glspl", "Gls", "Glspl"):
            key = c.args[0].raw.strip()
            return {"type": "gls", "key": key, "plural": name.endswith("pl"),
                    "cap": name[0] == "G"}
        if name == "ensuremath":
            return {"type": "math", "latex": convert_math(c.args[0].raw)}
        if name in ("metav", "script"):
            return {"type": "math", "latex": "\\mathcal{" + c.args[0].raw.strip() + "}"}
        if name == "atom":
            return {"type": "math", "latex": convert_math(f"\\atom{{{c.args[0].raw}}}{{{c.args[1].raw}}}")}
        if name == "ntuple":
            return [{"type": "text", "text": "\u27e8"}] + self.arg_inlines(c, 0, ctx) + [{"type": "text", "text": "\u27e9"}]
        if name in ("model", "extension", "referent", "gap"):
            return {"type": "math", "latex": convert_math(f"\\{name}{{{c.args[0].raw}}}")}
        if name == "blank":
            return {"type": "blank"}
        if name in ("forallx", "forallxyyc"):
            return {"type": "forallx", "calgary": name == "forallxyyc"}
        if name == "newglossaryentry":
            self.glossary_entry(c)
            return None
        if name == "myanswer":
            # inline answer (inside a paragraph)
            return {"type": "block", "block": {"type": "answer", "children": self.blocks(c.args[0].children)}}
        if name == "foreignlanguage":
            return self.arg_inlines(c, 1, ctx)
        if name in ("item",):
            note("item outside list", self.chapter_id or "")
            return None
        if name == "practiceproblems" or name == "problempart":
            note("exercise cmd inline", self.chapter_id or "")
            return None
        if name in ("hline", "multicolumn", "caption", "hbox", "makebox", "parbox",
                    "raisebox", "rule", "resizebox", "scalebox", "rotatebox"):
            if name in ("hbox", "makebox", "parbox", "raisebox", "resizebox", "scalebox", "rotatebox"):
                return self.arg_inlines(c, len(c.args) - 1, ctx)
            return None
        if name in ("PR", "AS", "by", "hypo", "have", "open", "close", "ellipsesline",
                    "ai", "ae", "oi", "oe", "ci", "ce", "bi", "be", "ni", "ne", "ri", "re",
                    "ii", "ie", "Ai", "Ae", "Ei", "Ee", "tnd", "ip", "dne", "mt", "ds",
                    "dem", "cq", "boxi", "boxe", "mc", "diadf", "rt", "rfour", "rfive"):
            note("fitch cmd outside proof", f"{self.chapter_id}:{name}")
            return None
        if name == "verb":
            return None
        counts["unhandled-inline:" + name] += 1
        note("unhandled inline \\" + name, self.chapter_id or "")
        return None

    # -- glossary
    def glossary_entry(self, c: Cmd):
        key = c.args[0].raw.strip()
        body = c.args[1].raw
        # fields: name=..., description={...}, plural=...
        fields = {}
        i = 0
        while i < len(body):
            m = re.compile(r"\s*([a-z]+)\s*=\s*").match(body, i)
            if not m:
                break
            fname = m.group(1)
            j = m.end()
            if j < len(body) and body[j] == "{":
                d, k = 1, j + 1
                while k < len(body) and d:
                    if body[k] == "{":
                        d += 1
                    elif body[k] == "}":
                        d -= 1
                    k += 1
                val = body[j + 1:k - 1]
                i = k
            else:
                k = body.find(",", j)
                if k == -1:
                    k = len(body)
                val = body[j:k]
                i = k
            fields[fname] = val
            # skip comma
            m2 = re.compile(r"\s*,?").match(body, i)
            i = m2.end()
        p = Parser(preprocess(fields.get("description", "")), report, "glossary")
        desc = self.inlines(p.parse())
        p2 = Parser(preprocess(fields.get("name", key)), report, "glossary")
        name_inl = self.inlines(p2.parse())
        self.book["glossary"].append({
            "key": key, "name": plain(name_inl), "nameInlines": name_inl,
            "plural": fields.get("plural"), "description": desc,
            "chapter": self.chapter_id,
        })

    # -- blocks
    def blocks(self, nodes) -> list:
        out: list = []
        cur: list = []

        def flush():
            nonlocal cur
            if not cur:
                return
            inl = self.inlines(cur)
            cur = []
            self.emit_para(out, inl)

        for n in nodes:
            if isinstance(n, Par):
                flush()
            elif isinstance(n, Math) and n.display:
                flush()
                out.append({"type": "displaymath", "latex": convert_math(n.raw)})
            elif isinstance(n, Env):
                # render the buffered text first, so a \label in it binds to the
                # heading before it and not to the last item of the list that follows
                flush()
                blk = self.env_block(n)
                if isinstance(blk, list):
                    out.extend(blk)
                elif blk is not None:
                    out.append(blk)
            elif isinstance(n, Cmd) and n.name == "bmlDescription":
                # the accessible description that follows a tikzpicture
                fig = out[-1] if out and out[-1].get("type") == "figure" else None
                if fig is not None and not fig.get("alt") and n.args:
                    fig["alt"] = re.sub(r"\s+", " ", plain(self.inlines(n.args[0].children))).strip()
            elif isinstance(n, Cmd) and n.name in self.macros:
                flush()
                out.extend(self.blocks(self.macros[n.name].children))
            elif isinstance(n, Cmd) and n.name in BLOCK_CMDS:
                flush()
                blk = self.block_cmd(n)
                if blk is not None:
                    if isinstance(blk, list):
                        out.extend(blk)
                    else:
                        out.append(blk)
            elif isinstance(n, Cmd) and n.name == "def":
                flush()
            elif isinstance(n, Group) and any(isinstance(x, (Par, Env)) for x in n.children):
                flush()
                out.extend(self.blocks(n.children))
            else:
                cur.append(n)
        flush()
        return out

    def emit_para(self, out, inl):
        # split on parbreaks and embedded blocks
        segs: list = [[]]
        for x in inl:
            if x.get("type") == "parbreak":
                segs.append([])
            elif x.get("type") == "block":
                segs.append(x["block"])
                segs.append([])
            else:
                segs[-1].append(x)
        for seg in segs:
            if isinstance(seg, dict):
                out.append(seg)
                continue
            seg = trim_inlines(seg)
            if seg:
                out.append({"type": "para", "children": seg})

    def block_cmd(self, c: Cmd):
        name = c.name
        if name == "part":
            return self.start_part(c)
        if name == "chapter":
            return self.start_chapter(c)
        if name in ("section", "subsection", "subsubsection", "paragraph"):
            title = self.arg_inlines(c, 0)
            if c.star:
                lvl = {"section": 2, "subsection": 3, "subsubsection": 4, "paragraph": 4}[name]
                anchor = "s-" + slug(plain(title))
                self.set_target("section*", "", anchor, plain(title))
                return {"type": "heading", "level": lvl, "children": title, "id": anchor}
            if name == "section":
                self.sec += 1
                self.subsec = 0
                num = f"{self.chap_label()}.{self.sec}"
                anchor = f"sec-{num.replace('.', '-')}"
                self.set_target("section", num, anchor, plain(title))
                return {"type": "heading", "level": 2, "number": num, "children": title, "id": anchor}
            if name == "subsection":
                self.subsec += 1
                num = f"{self.chap_label()}.{self.sec}.{self.subsec}"
                anchor = f"sec-{num.replace('.', '-')}"
                self.set_target("subsection", num, anchor, plain(title))
                return {"type": "heading", "level": 3, "number": num, "children": title, "id": anchor}
            anchor = "p-" + slug(plain(title))
            return {"type": "heading", "level": 4, "children": title, "id": anchor}
        if name == "practiceproblems":
            self.in_exercises = True
            self.part_letter = 0
            self.set_target("exercises", "", "exercises", "Practice exercises")
            return {"type": "exercises-start"}
        if name == "problempart":
            self.part_letter += 1
            letter = chr(ord("A") + self.part_letter - 1)
            self.set_target("exercise", f"{self.chap_label()}.{letter}", f"ex-{letter}",
                            f"Part {letter}")
            return {"type": "problempart", "letter": letter}
        if name == "myanswer":
            return {"type": "answer", "children": self.blocks(c.args[0].children)}
        if name == "factoidbox":
            return {"type": "factoid", "children": self.blocks(c.args[0].children)}
        if name == "newglossaryentry":
            self.glossary_entry(c)
            return None
        if name == "caption":
            return {"type": "caption", "children": self.arg_inlines(c, len(c.args) - 1)}
        if name == "columnbreak":
            return {"type": "colbreak"}
        if name in ("bigskip", "medskip", "vspace", "vspace*"):
            return {"type": "space"}
        return None

    def chap_label(self):
        return self.chapter["number"] if self.chapter else "0"

    def start_part(self, c: Cmd):
        if c.star:
            return None
        self.part_num += 1
        title = self.arg_inlines(c, 0)
        p = {"number": ROMAN[self.part_num - 1], "title": plain(title), "chapters": []}
        self.book["parts"].append(p)
        self.set_target("part", p["number"], "", p["title"])
        return None

    def start_chapter(self, c: Cmd):
        # handled by the chapter splitter; should not be reached
        note("nested chapter", self.chapter_id or "")
        return None

    # -- environments
    def env_block(self, e: Env):
        name = e.name
        if name in LIST_ENVS:
            return self.list_env(e)
        if name in ("quote", "quotation"):
            return {"type": "quote", "children": self.blocks(e.children)}
        if name == "center":
            inner = self.blocks(e.children)
            if len(inner) == 1 and inner[0]["type"] == "para":
                inner[0]["align"] = "center"
                return inner[0]
            return {"type": "center", "children": inner}
        if name in ("flushleft", "flushright", "raggedright", "raggedleft", "minipage",
                    "Spacing", "spacing", "small", "footnotesize", "table", "figure",
                    "sidewaystable", "document", "bmlimage", "arialabel"):
            if name in ("table", "sidewaystable"):
                # number the float before its contents, so the \label after \caption
                # binds to this table (not to the previous target)
                self.table_num += 1
                num = f"{self.chap_label()}.{self.table_num}"
                anchor = f"table-{num.replace('.', '-')}"
                self.set_target("table", num, anchor, "Table " + num)
            inner = self.blocks(e.children)
            if name in ("table", "sidewaystable"):
                cap = [b for b in inner if b["type"] == "caption"]
                # attach number, anchor and caption to the table block; a float with no
                # tabular (e.g. an align* of equivalences) carries them on its first block
                host = next((b for b in inner if b["type"] == "table"), None)
                if host is None:
                    host = next((b for b in inner if b["type"] == "displaymath"), None)
                if host is not None:
                    host["number"] = num
                    host["id"] = anchor
                    if cap:
                        host["caption"] = cap[0]["children"]
                    inner = [b for b in inner if b["type"] != "caption"]
                else:
                    inner = [{"type": "para", "children": b["children"]} if b["type"] == "caption" else b
                             for b in inner]
            if name == "flushright":
                for b in inner:
                    if b["type"] == "para":
                        b["align"] = "right"
            return inner
        if name == "factoidboxe":
            return {"type": "factoid", "children": self.blocks(e.children)}
        if name in ("fitchproof", "nd"):
            return self.fitch(e)
        if name in ("tabular", "tabular*", "tabularx", "tabu", "longtable", "array"):
            return self.table(e)
        if name in ("align*", "align", "multline*", "multline", "equation*", "equation", "gather*"):
            if "\\intertext" in e.raw:
                return self.split_intertext(e.raw, name.rstrip("*"))
            return {"type": "displaymath", "latex": convert_math(e.raw), "env": name.rstrip("*")}
        if name == "tikzpicture":
            alt = ""
            if e.opts and e.opts[0]:
                m = re.search(r"alt=\{(.*)\}", e.opts[0], re.S)
                if m:
                    alt = re.sub(r"\s+", " ", m.group(1)).strip()
            svg = tikz_to_svg(e.raw)
            if svg is None:
                note("tikz not converted", self.chapter_id or "")
            return {"type": "figure", "svg": svg, "alt": alt}
        if name == "multicols":
            return {"type": "columns", "children": self.blocks(e.children)}
        if name in ("textblock*", "wrapfigure", "verbatim", "comment"):
            return []
        if name == "itemize":
            return self.list_env(e)
        note("unhandled env " + name, self.chapter_id or "")
        return {"type": "unknown-env", "name": name, "children": self.blocks(e.children)}

    def split_intertext(self, raw: str, env: str):
        out = []
        i = 0
        pat = re.compile(r"\\intertext\s*\{")
        while True:
            m = pat.search(raw, i)
            if not m:
                tail = raw[i:].strip()
                if tail:
                    out.append({"type": "displaymath", "latex": convert_math(tail), "env": env})
                break
            head = raw[i:m.start()].strip().rstrip("\\").strip()
            if head:
                out.append({"type": "displaymath", "latex": convert_math(head), "env": env})
            d, k = 1, m.end()
            while k < len(raw) and d:
                if raw[k] == "{":
                    d += 1
                elif raw[k] == "}":
                    d -= 1
                k += 1
            text = raw[m.end():k - 1]
            p = Parser(preprocess(text), report, "intertext")
            self.emit_para(out, self.inlines(p.parse()))
            i = k
        return out

    def list_env(self, e: Env):
        kind = e.name
        items = []
        cur = None
        pre = []
        for n in e.children:
            if isinstance(n, Cmd) and n.name == "item":
                cur = {"nodes": [], "label": None}
                if n.opts and n.opts[0] is not None:
                    cur["label"] = n.opts[0]
                items.append(cur)
            elif cur is None:
                pre.append(n)
            else:
                cur["nodes"].append(n)
        out_items = []
        if kind == "enumerate" and e.opts and e.opts[0]:
            m = re.search(r"start\s*=\s*(\d+)", e.opts[0])
            if m:
                self.enum = int(m.group(1)) - 1
        local = 0
        for it in items:
            item = {}
            if kind == "enumerate":
                self.enum += 1
                item["n"] = self.enum
                self.set_target("item", str(self.enum), f"item-{self.enum}", f"sentence {self.enum}")
            elif kind in ("compactlist", "numberlist", "factoidnumber") and it["label"] is None:
                # a numbered list in running text (e.g. the Subsidiary Results of the
                # Functional Completeness Theorem): a \label in an item refers to its number
                local += 1
                labs = [x.args[0].raw.strip() for x in it["nodes"] if isinstance(x, Cmd) and x.name == "label"]
                if labs and not self.in_exercises:
                    anchor = "li-" + slug(labs[0])
                    self.set_target("item", str(local), anchor, f"item {local}")
                    item["anchor"] = anchor
            if it["label"] is not None:
                raw = it["label"]
                if kind == "ekey" and re.fullmatch(r"[A-Za-z](_\{?\d+\}?)?", raw.strip()):
                    item["label"] = [{"type": "math", "latex": raw.strip()}]
                else:
                    p = Parser(raw, report, "itemlabel")
                    item["label"] = self.inlines(p.parse())
            item["children"] = self.blocks(it["nodes"])
            out_items.append(item)
        rest = [x for x in pre if not (isinstance(x, (Text, Par)) and (isinstance(x, Par) or not x.text.strip()))]
        for x in rest:
            if isinstance(x, Cmd) and x.name == "label":
                self.add_label(x.args[0].raw.strip())
            else:
                note("content before first item", f"{self.chapter_id}: {type(x).__name__} {getattr(x, 'name', '')}")
        return {"type": "list", "kind": kind, "items": out_items}

    # -- fitch proofs
    def fitch(self, e: Env):
        lines = []
        depth = 0
        base = ""
        ctr = 1
        labels = {}
        cur = None
        pending_label = None

        def render_num():
            if base == "":
                return str(ctr)
            if ctr > 0:
                return f"{base}+{ctr}"
            if ctr < 0:
                return f"{base}{ctr}"
            return base

        for n in e.children:
            if isinstance(n, (Text, Par)):
                if isinstance(n, Text) and n.text.strip():
                    note("text in fitchproof", f"{self.chapter_id}: {n.text.strip()[:40]}")
                continue
            if not isinstance(n, Cmd):
                if isinstance(n, Group):
                    continue
                note("node in fitchproof", f"{self.chapter_id}: {type(n).__name__}")
                continue
            name = n.name
            if name == "open":
                depth += 1
                continue
            if name == "close":
                depth -= 1
                continue
            if name == "label":
                self.add_label(n.args[0].raw.strip())
                continue
            if name in ("hypo", "have", "ellipsesline"):
                if name == "ellipsesline":
                    opt, opt2, lab, formula = " ", None, "", "\\vdots"
                else:
                    opt = n.opts[0] if n.opts else None
                    opt2 = n.opts[1] if len(n.opts) > 1 else None
                    lab = n.args[0].raw.strip()
                    formula = n.args[1].raw
                if opt is not None:
                    o = re.sub(r"\\[ ,;!]|\\mathem", "", opt).strip()
                    base = o
                    ctr = 0
                if opt2 is not None and opt2.strip():
                    ctr = int(opt2.strip())
                num = base if (opt is not None and base == "") else render_num()
                ctr += 1
                cur = {"num": num, "depth": depth, "hypo": name == "hypo",
                       "formula": convert_math(formula), "rule": None, "refs": None,
                       "labelsBefore": dict(labels)}
                if lab:
                    labels[lab] = num
                if name == "ellipsesline":
                    cur["ellipsis"] = True
                lines.append(cur)
                continue
            if name == "by" or name in RULE_CMDS or name in ("PR", "AS"):
                if cur is None:
                    note("justification before line", self.chapter_id or "")
                    continue
                if name == "PR":
                    rule_raw, refs_raw = "PR", ""
                elif name == "AS":
                    rule_raw, refs_raw = "AS", ""
                elif name == "by":
                    rule_raw, refs_raw = n.args[0].raw, n.args[1].raw
                else:
                    rule_raw, refs_raw = RULE_CMDS[name], n.args[0].raw
                p = Parser(rule_raw, report, "rule")
                rule_inl = self.inlines(p.parse())
                cur["rule"] = rule_inl
                cur["ruleText"] = plain(rule_inl).strip()
                cur["refsRaw"] = refs_raw.strip()
                continue
            note("unhandled in fitchproof \\" + name, self.chapter_id or "")
        # resolve refs
        for ln in lines:
            rr = ln.pop("refsRaw", None)
            seen = ln.pop("labelsBefore", {})
            if rr is None:
                continue
            labels = {**labels, **seen}
            parts = re.split(r"(\s*[,;]\s*|\s*[-–]\s*|\s*\.\s*)", rr)
            out = []
            for pth in parts:
                if not pth:
                    continue
                st = pth.strip()
                if st in (",", ";", "-", "–", "."):
                    out.append({",": ", ", ";": "; ", "-": "–", "–": "–", ".": ". "}[st])
                    continue
                key = st.strip("() ")
                pre = "(" if st.startswith("(") else ""
                post = ")" if st.endswith(")") else ""
                if key in labels:
                    out.append(pre + labels[key] + post)
                else:
                    out.append(st)
            ln["refs"] = "".join(out).strip()
            ln["refs"] = FITCH_REF_FIXUPS.get((ln["formula"], ln["refs"]), ln["refs"])
        return {"type": "fitch", "lines": lines}

    # -- tables
    def table(self, e: Env):
        spec_raw = e.args[-1].raw if e.args else ""
        spec = parse_colspec(spec_raw)
        rows = []
        row = []
        cell = []
        hline_pending = 0
        caption = None
        multi = None   # a \multicolumn is the whole content of its cell

        def end_cell():
            nonlocal cell, multi
            if multi is not None:
                stray = trim_inlines(self.inlines(cell))
                if stray:
                    multi["children"] = multi["children"] + stray
                row.append(multi)
                multi = None
            else:
                row.append({"children": trim_inlines(self.inlines(cell))})
            cell = []

        def end_row():
            nonlocal row, hline_pending
            end_cell()
            if any(c["children"] for c in row) or len(row) > 1:
                rows.append({"cells": row, "hlineBefore": hline_pending})
                hline_pending = 0
            row = []

        for n in e.children:
            if isinstance(n, Amp):
                end_cell()
            elif isinstance(n, Cmd) and n.name == "\\":
                end_row()
            elif isinstance(n, Cmd) and n.name == "hline":
                if row or cell and any(isinstance(x, (Cmd, Math)) or (isinstance(x, Text) and x.text.strip()) for x in cell):
                    pass
                hline_pending += 1
            elif isinstance(n, Cmd) and n.name == "cline":
                hline_pending = max(hline_pending, 1)
            elif isinstance(n, Cmd) and n.name == "multicolumn":
                span = int(n.args[0].raw.strip())
                multi = {"children": trim_inlines(self.inlines(n.args[2].children)), "colspan": span}
                cell = []
            elif isinstance(n, Cmd) and n.name == "caption":
                caption = self.arg_inlines(n, len(n.args) - 1)
            elif isinstance(n, Cmd) and n.name == "lxTableColumnHead":
                cell.extend(n.args[0].children)
            elif isinstance(n, Par):
                continue
            else:
                cell.append(n)
        # final row (no trailing \\)
        if row or multi is not None or (cell and any(isinstance(x, (Cmd, Math, Group)) or (isinstance(x, Text) and x.text.strip()) for x in cell)):
            end_row()
        else:
            if hline_pending:
                if rows:
                    rows[-1]["hlineAfter"] = hline_pending
        tt = any(c["kind"] in ("d", "e", "f") for c in spec["cols"])
        if not tt and rows:
            body = [plain(c["children"]).strip() for r in rows[1:] for c in r["cells"]]
            if body and all(b in ("T", "F", "") for b in body):
                tt = True
        blk = {"type": "table", "cols": spec["cols"], "rows": rows, "truthTable": tt}
        if caption:
            blk["caption"] = caption
        return blk


def trim_inlines(seg: list) -> list:
    seg = [x for x in seg if not (x.get("type") == "text" and x["text"] == "")]
    if seg and seg[0].get("type") == "text":
        seg[0]["text"] = seg[0]["text"].lstrip()
        if not seg[0]["text"]:
            seg = seg[1:]
    if seg and seg[-1].get("type") == "text":
        seg[-1]["text"] = seg[-1]["text"].rstrip()
        if not seg[-1]["text"]:
            seg = seg[:-1]
    # collapse internal whitespace runs
    for x in seg:
        if x.get("type") == "text":
            x["text"] = re.sub(r"[ \t]+", " ", x["text"])
    return seg


def parse_colspec(spec: str):
    spec = re.sub(r"@\{[^}]*\}", "", spec)
    spec = re.sub(r">\{[^}]*\}", "", spec)
    spec = re.sub(r"p\{[^}]*\}", "l", spec)
    spec = spec.replace("\\textwidth", "")
    cols = []
    border = 0
    for ch in spec:
        if ch == "|":
            border += 1
        elif ch in "clrXdef":
            cols.append({"kind": ch, "align": {"l": "left", "r": "right", "X": "left"}.get(ch, "center"),
                         "borderLeft": border})
            border = 0
        elif ch in " \t\n{}*":
            continue
        else:
            counts["colspec-char:" + ch] += 1
    if cols and border:
        cols[-1]["borderRight"] = border
    return {"cols": cols}


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:60] or "x"


LIST_ENVS = {"itemize", "enumerate", "compactlist", "numberlist", "earg", "ekey",
             "factoiditems", "factoidnumber", "description"}
BLOCK_CMDS = {"part", "chapter", "section", "subsection", "subsubsection", "paragraph",
              "practiceproblems", "problempart", "myanswer", "newglossaryentry",
              "caption", "columnbreak", "factoidbox"}
RULE_CMDS = {
    "ai": "{\\eand}I", "ae": "{\\eand}E", "oi": "{\\eor}I", "oe": "{\\eor}E",
    "ci": "{\\eif}I", "ce": "{\\eif}E", "bi": "{\\eiff}I", "be": "{\\eiff}E",
    "ni": "{\\enot}I", "ne": "{\\enot}E", "ri": "{\\enot}E", "re": "X",
    "ii": "$=$I", "ie": "$=$E", "Ai": "$\\forall$I", "Ae": "$\\forall$E",
    "Ei": "$\\exists$I", "Ee": "$\\exists$E", "tnd": "LEM", "ip": "IP",
    "dne": "DNE", "mt": "MT", "ds": "DS", "dem": "DeM", "cq": "CQ",
    "boxi": "{\\ebox}I", "boxe": "{\\ebox}E", "mc": "MC", "diadf": "Def{\\ediamond}",
    "rt": "R$\\mathbf{T}$", "rfour": "R$\\mathbf{4}$", "rfive": "R$\\mathbf{5}$",
}


# ------------------------------------------------------------ book driver

def split_chapters(nodes):
    """Split a file's node list into [(kind, cmd, nodes)] at \\part and \\chapter."""
    chunks = []
    cur = None
    for n in nodes:
        if isinstance(n, Cmd) and n.name in ("part", "chapter"):
            cur = {"cmd": n, "nodes": []}
            chunks.append(cur)
        elif cur is None:
            if isinstance(n, (Text, Par)) and (isinstance(n, Par) or not n.text.strip()):
                continue
            if isinstance(n, Cmd) and n.name in IGNORE_CMDS | {"def", "label", "addcontentsline", "addtocontents"}:
                continue
            note("content before first chapter", type(n).__name__)
        else:
            cur["nodes"].append(n)
    return chunks


_DEF_RE = re.compile(r"\\def\\([A-Za-z@]+)\s*\{")
_CS_RE = re.compile(r"\\([A-Za-z@]+)")


def expand_defs(src: str) -> str:
    """Expand parameterless \\def\\name{body} macros at the text level, in source order.

    TeX expands a macro with the definition current at the point of use, so a macro
    redefined later in the file (\\tmptable in the proof-theory chapter) must not be
    replaced by its last definition. Expanding before parsing also puts any `&` and
    `\\\\` in the body where the tabular parser can see them. Comments are copied
    verbatim (never expanded into). Macros the converter already maps natively
    (e.g. \\mathem) are left to the node-level handler, so their output is unchanged."""
    native = set(MATH_SIMPLE) | IGNORE_CMDS | set(TEXT_CMDS) | set(SYMBOL_CMDS)
    native.discard("def")
    macros: dict[str, str] = {}
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == "%":
            j = src.find("\n", i)
            j = n if j == -1 else j
            out.append(src[i:j])
            i = j
            continue
        if c != "\\":
            out.append(c)
            i += 1
            continue
        m = _DEF_RE.match(src, i)
        if m and m.group(1) not in native:
            k, d = m.end(), 1
            while k < n and d:
                if src[k] == "\\":
                    k += 2
                    continue
                if src[k] == "{":
                    d += 1
                elif src[k] == "}":
                    d -= 1
                k += 1
            macros[m.group(1)] = src[m.end():k - 1]
            i = k
            continue
        m = _CS_RE.match(src, i)
        if m:
            name = m.group(1)
            out.append(macros[name] if name in macros else m.group(0))
            i = m.end()
            continue
        out.append(src[i:i + 2])  # control symbol such as \% or \\
        i += 2
    return "".join(out)


def handle_defs(nodes, r: Renderer):
    """Process \\def\\name{body} (parameterless) anywhere in the node list."""
    out = []
    i = 0
    while i < len(nodes):
        n = nodes[i]
        if isinstance(n, Cmd) and n.name == "def":
            # next node is the macro name cmd, then a group
            if i + 2 < len(nodes) and isinstance(nodes[i + 1], Cmd) and isinstance(nodes[i + 2], Group):
                r.macros[nodes[i + 1].name] = nodes[i + 2]
                i += 3
                continue
            note("unsupported \\def", "")
        if isinstance(n, Env):
            n.children = handle_defs(n.children, r)
        out.append(n)
        i += 1
    return out


def build_exercises(blocks: list, chapter_num, r: Renderer):
    """Split a chapter's block list into body + exercise parts."""
    body = []
    parts = []
    cur = None
    mode = "body"
    for b in blocks:
        if b["type"] == "exercises-start":
            mode = "ex"
            continue
        if mode == "body":
            body.append(b)
            continue
        if b["type"] == "problempart":
            cur = {"letter": b["letter"], "blocks": []}
            parts.append(cur)
            continue
        if cur is None:
            # text between \practiceproblems and the first \problempart
            cur = {"letter": "", "blocks": []}
            parts.append(cur)
        cur["blocks"].append(b)
    return body, parts


def flatten_items(blocks):
    """Collect top-level list items (compactlist/numberlist/enumerate) of a part."""
    items = []
    for b in blocks:
        if b["type"] == "list" and b["kind"] in ("compactlist", "numberlist", "enumerate"):
            for it in b["items"]:
                items.append(it)
        elif b["type"] in ("columns", "center"):
            items.extend(flatten_items(b["children"]))
    return items


def fold_example_enumerate(part):
    """A part whose only numbered list is an `enumerate` of example sentences (26 A:
    "Consider the sentence, 19. Every officer except Pavel ... Symbolize this sentence")
    asks one question; it is not a list of exercise items. The whole part becomes a
    single item, so the instructions come before the answer box and the sentence keeps
    its book number and its #item-N anchor. (The item count stays one, so the item id
    is unchanged.)"""
    lists = [b for b in part["blocks"]
             if b["type"] == "list" and b["kind"] in ("compactlist", "numberlist", "enumerate")]
    if len(lists) != 1 or lists[0]["kind"] != "enumerate":
        return
    if flatten_items([b for b in part["blocks"] if b is not lists[0]]):
        return  # other item lists nested in columns/center: leave alone
    part["blocks"] = [{"type": "list", "kind": "compactlist", "items": [{"children": part["blocks"]}]}]


def classify_part(chapter_num: int, part: dict) -> dict:
    instr = ""
    for b in part["blocks"]:
        if b["type"] == "para":
            instr = plain(b["children"]).lower()
            break
    has_key = any(b["type"] == "list" and b["kind"] == "ekey" for b in part["blocks"])
    items = part.get("items", [])
    n_math = sum(1 for it in items if it.get("formulas"))
    kind = "free"
    logic = "tfl" if chapter_num <= 22 else ("fol" if chapter_num <= 41 else ("ml" if chapter_num <= 44 else "tfl"))
    if chapter_num >= 45:
        logic = "tfl"
    sub = None
    if chapter_num in TT_CHAPTERS and ("truth table" in instr or "truth-table" in instr) and n_math and n_math >= len(items) / 2:
        kind = "truthtable"
        if "tautolog" in instr or "contradiction" in instr or "contingent" in instr:
            sub = "classify"
        elif "equivalent" in instr:
            sub = "equivalent"
        elif "satisfiable" in instr or "jointly possible" in instr or "consistent" in instr:
            sub = "satisfiable"
        elif "valid" in instr:
            sub = "valid"
        else:
            sub = "complete"
        if "partial" in instr or chapter_num == 15:
            sub = sub + "-partial" if sub != "complete" else "partial"
    elif chapter_num in PROOF_CHAPTERS_TFL | PROOF_CHAPTERS_FOL | PROOF_CHAPTERS_ML and n_math and \
            ("proof" in instr or "derivation" in instr or "prove" in instr or "show" in instr or "derive" in instr):
        kind = "proof"
    elif "symboliz" in instr and (has_key or "key" in instr) and items:
        kind = "symbolize"
    elif ("main connective" in instr or "main logical operator" in instr) and n_math:
        kind = "main-connective"
    elif "citation" in instr and any(b["type"] == "fitch" for it in items for b in it["children"]):
        kind = "cite"
    elif "strictly speaking" in instr and "sentence of tfl" in instr and n_math:
        kind = "is-sentence"
        sub = "two"
    elif ("sentence of tfl" in instr or "sentences of tfl" in instr or "sentence of fol" in instr or "sentences of fol" in instr) and n_math and "which" in instr:
        kind = "is-sentence"
    return {"kind": kind, "sub": sub, "logic": logic, "hasKey": has_key}


def first_math(blocks):
    for b in blocks:
        if b["type"] == "para":
            for x in b["children"]:
                if x["type"] == "math":
                    return x["latex"]
            return None
        if b["type"] == "displaymath":
            return b["latex"]
        if b["type"] == "para":
            return None
    return None


def item_formulas(blocks):
    """All top-level math in an item's first paragraph(s), as logic strings.
    An argument written as an earg list (premises, then a ∴ line) becomes one
    'P1, P2 ∴ C' string."""
    out = []
    for b in blocks:
        if b["type"] == "para":
            for x in b["children"]:
                if x["type"] == "math":
                    out.append(to_logic(x["latex"]))
        elif b["type"] == "displaymath":
            out.append(to_logic(b["latex"]))
        elif b["type"] == "list" and b["kind"] == "earg":
            prem, conc = [], None
            for it in b["items"]:
                maths = [to_logic(x["latex"]) for c in it["children"] if c["type"] == "para" for x in c["children"] if x["type"] == "math"]
                if not maths:
                    prem = None
                    break
                is_conc = it.get("label") and "∴" in plain(it["label"])
                if is_conc:
                    conc = maths[0]
                else:
                    prem.append(maths[0])
            if prem is not None and conc is not None:
                out.append(", ".join(prem) + " ∴ " + conc)
            break
        elif b["type"] == "list":
            break
    return out


def convert_book():
    os.makedirs(os.path.join(OUT, "chapters"), exist_ok=True)
    book = {"title": "forall x: Calgary", "subtitle": "An Introduction to Formal Logic",
            "parts": [], "appendices": [], "glossary": [], "labels": {}, "chapters": []}
    r = Renderer(book)
    chapters_out = []

    def process_file(fname, appendix=False):
        path = os.path.join(SRC, fname)
        with open(path, encoding="utf-8") as f:
            src = preprocess(f.read())
        src = expand_defs(protect_urls(src))
        p = Parser(src, report, fname)
        nodes = p.parse()
        nodes = handle_defs(nodes, r)
        for chunk in split_chapters(nodes):
            cmd = chunk["cmd"]
            if cmd.name == "part":
                r.start_part(cmd)
                # labels right after \part
                for n in chunk["nodes"]:
                    if isinstance(n, Cmd) and n.name == "label":
                        r.add_label(n.args[0].raw.strip())
                continue
            # chapter
            if appendix:
                r.chap_num += 1
                letter = chr(ord("A") + len(book["appendices"]))
                cid = f"app{letter}"
                number = letter
            elif fname.startswith("forallx-yyc-preface"):
                cid = "preface"
                number = ""
            else:
                r.chap_num += 1
                cid = f"ch{r.chap_num:02d}"
                number = str(r.chap_num)
            title_inl = r.inlines(cmd.args[0].children)
            ch = {"id": cid, "number": number, "title": plain(title_inl), "titleInlines": title_inl,
                  "part": book["parts"][-1]["number"] if (book["parts"] and not appendix and cid != "preface") else None,
                  "blocks": [], "exercises": [], "footnotes": []}
            r.chapter = ch
            r.chapter_id = cid
            r.sec = r.subsec = 0
            r.enum = 0
            r.foot = 0
            r.table_num = 0
            r.in_exercises = False
            r.part_letter = 0
            r.set_target("chapter", number, "", ch["title"])
            blocks = r.blocks(chunk["nodes"])
            body, parts = build_exercises(blocks, r.chap_num, r)
            ch["blocks"] = body
            for part in parts:
                fold_example_enumerate(part)
                part["items"] = flatten_items(part["blocks"])
                for idx, it in enumerate(part["items"], 1):
                    it["id"] = f"{cid}.{part['letter']}.{idx}"
                    it["formulas"] = item_formulas(it["children"])
                part["id"] = f"{cid}.{part['letter']}"
                part.update(classify_part(r.chap_num if not appendix else 0, part))
                if part["kind"] == "free" and not part["items"]:
                    instr = plain(part["blocks"][0]["children"]).lower() if part["blocks"] and part["blocks"][0]["type"] == "para" else ""
                    if "citation" in instr:
                        proofs = []
                        rest = []
                        for b in part["blocks"]:
                            if b["type"] == "fitch":
                                proofs.append(b)
                            elif b["type"] == "columns":
                                proofs.extend(x for x in b["children"] if x["type"] == "fitch")
                                others = [x for x in b["children"] if x["type"] != "fitch"]
                                if others:
                                    rest.append({"type": "columns", "children": others})
                            else:
                                rest.append(b)
                        if proofs:
                            part["blocks"] = rest + [{"type": "list", "kind": "compactlist", "items": [{"children": [p]} for p in proofs]}]
                            part["items"] = flatten_items(part["blocks"])
                            for idx, it in enumerate(part["items"], 1):
                                it["id"] = f"{cid}.{part['letter']}.{idx}"
                                it["formulas"] = []
                            part["kind"] = "cite"
            ch["exercises"] = parts
            chapters_out.append(ch)
            if appendix:
                book["appendices"].append({"id": cid, "number": number, "title": ch["title"]})
            elif cid != "preface":
                book["parts"][-1]["chapters"].append({"id": cid, "number": number, "title": ch["title"]})
            counts["chapters"] += 1
            counts["exercise-parts"] += len(parts)
            counts["exercise-items"] += sum(len(p["items"]) for p in parts)

    process_file("forallx-yyc-preface.tex")
    for f in PART_FILES:
        process_file(f"forallx-yyc-{f}.tex")
    for f in APPENDIX_FILES:
        process_file(f"forallx-yyc-{f}.tex", appendix=True)

    # ---- solutions
    sols = convert_solutions(book)
    merge_solutions(chapters_out, sols)

    # ---- resolve refs & glossary links, count things
    PART_FIRST.clear()
    PART_FIRST.update({p["number"]: p["chapters"][0]["id"] for p in book["parts"] if p["chapters"]})
    gloss_keys = {g["key"]: g for g in book["glossary"]}
    for ch in chapters_out:
        walk_lists(ch, strip_page_prefix)
        walk(ch, lambda n: resolve_inline(n, book["labels"], gloss_keys, ch))
        walk(ch, flatten_nested_refs)
        unique_define_anchors(ch)
        count_blocks(ch)
    # glossary descriptions carry refs and terms too
    for g in book["glossary"]:
        where = {"id": g.get("chapter") or "glossary"}
        for key in ("nameInlines", "description"):
            walk(g[key], lambda n: resolve_inline(n, book["labels"], gloss_keys, where))
            walk(g[key], flatten_nested_refs)

    # ---- write
    for ch in chapters_out:
        with open(os.path.join(OUT, "chapters", ch["id"] + ".json"), "w", encoding="utf-8") as f:
            json.dump(ch, f, ensure_ascii=False)
    book["chapters"] = [{"id": c["id"], "number": c["number"], "title": c["title"], "part": c["part"],
                         "exerciseCount": sum(len(p["items"]) for p in c["exercises"]),
                         "solvedCount": sum(1 for p in c["exercises"] for it in p["items"] if it.get("solution")),
                         "sections": [{"id": b["id"], "number": b.get("number"), "title": plain(b["children"])}
                                      for b in c["blocks"] if b["type"] == "heading" and b["level"] == 2]}
                        for c in chapters_out]
    with open(os.path.join(OUT, "book.json"), "w", encoding="utf-8") as f:
        json.dump(book, f, ensure_ascii=False)
    write_report()


def protect_urls(src: str) -> str:
    """Escape % inside \\href{url} and \\url{} so the tokenizer keeps it."""
    def fix(m):
        return m.group(1) + m.group(2).replace("%", "\\%") + "}"
    src = re.sub(r"(\\href\{)([^}]*)\}", fix, src)
    src = re.sub(r"(\\url\{)([^}]*)\}", fix, src)
    return src


# -------------------------------------------------------------- solutions

def convert_solutions(book):
    """Return {chapter_num: {letter: {'blocks': [...], 'items': [...], 'label': ...}}}."""
    r = Renderer(book)
    r.mode = "solutions"
    sols = {}
    ch = 0
    for f in SOL_FILES:
        path = os.path.join(SRC, "solutions", f"forallx-sol-{f}.tex")
        with open(path, encoding="utf-8") as fh:
            src = preprocess(fh.read())
        src = expand_defs(protect_urls(src))
        p = Parser(src, report, "sol-" + f)
        nodes = handle_defs(p.parse(), r)
        # split by chapter / stepcounter
        cur = None
        for n in nodes:
            if isinstance(n, Cmd) and n.name == "stepcounter" and n.args[0].raw.strip() == "chapter":
                ch += 1
                cur = None
                continue
            if isinstance(n, Cmd) and n.name == "chapter":
                ch += 1
                cur = {"nodes": []}
                sols[ch] = cur
                continue
            if cur is not None:
                cur["nodes"].append(n)
    out = {}
    for chn, data in sols.items():
        r.chapter = {"number": str(chn)}
        r.chapter_id = f"ch{chn:02d}"
        r.part_letter = 0
        r.enum = 0
        r.foot = 0
        r.in_exercises = True
        blocks = r.blocks(data["nodes"])
        parts = {}
        cur = None
        for b in blocks:
            if b["type"] == "problempart":
                cur = {"letter": b["letter"], "blocks": []}
                parts[b["letter"]] = cur
            elif cur is not None:
                cur["blocks"].append(b)
        if not parts and blocks:
            # a chapter whose exercises have no \problempart (chapter 1): the book's
            # part has the empty letter, so the whole chapter is that part's solution
            parts[""] = {"letter": "", "blocks": blocks}
        for letter, part in parts.items():
            part["items"] = extract_item_answers(part["blocks"])
            part["partAnswers"] = [b for b in part["blocks"] if b["type"] == "answer"]
        out[chn] = parts
    return out


def extract_item_answers(blocks):
    """From a solutions part: list of {question: blocks, answer: blocks} per real item."""
    items = []
    for b in blocks:
        if b["type"] == "list" and b["kind"] in ("compactlist", "numberlist", "enumerate"):
            for it in b["items"]:
                is_carrier = it.get("label") == [] or (it.get("label") is not None and plain(it["label"]).strip() == "")
                if is_carrier and items:
                    items[-1]["answer"].extend(it["children"])
                    continue
                ans = [x for x in it["children"] if x["type"] == "answer"]
                q = [x for x in it["children"] if x["type"] != "answer"]
                flat_ans = []
                for a in ans:
                    flat_ans.extend(a["children"])
                items.append({"question": q, "answer": flat_ans})
        elif b["type"] in ("columns", "center"):
            items.extend(extract_item_answers(b["children"]))
    # unwrap answer wrappers inside carrier items
    for it in items:
        flat = []
        for x in it["answer"]:
            if x["type"] == "answer":
                flat.extend(x["children"])
            else:
                flat.append(x)
        it["answer"] = flat
    return items


def _question_text(blocks) -> str:
    """Normalised text + maths of exercise questions, for matching book against solutions."""
    out = []

    def fn(n):
        t = n.get("type")
        if t == "text":
            out.append(n["text"])
        elif t in ("math", "displaymath"):
            out.append(n["latex"])
        elif t == "fitch":
            out.extend(ln["formula"] for ln in n["lines"])
    walk(blocks, fn)
    s = re.sub(r"\\[A-Za-z]+", " ", " ".join(out).lower())
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def match_solution_parts(ch, sol_parts):
    """Map each book part letter to a solutions part letter.

    By default the letters correspond. When a part's questions clearly differ from the
    same-letter solutions part but clearly match another one (the solutions booklet
    prints the T and S4 parts of chapter 44 in the opposite order), use that one."""
    from difflib import SequenceMatcher
    book_txt = {p["letter"]: _question_text([it["children"] for it in p["items"]]) for p in ch["exercises"]}
    sol_txt = {L: _question_text([it["question"] for it in sp["items"]]) for L, sp in sol_parts.items()}

    def sim(a, b):
        return SequenceMatcher(None, a, b, autojunk=False).ratio() if a and b else None

    assign = {L: L for L in book_txt}
    suspect = {L for L in book_txt if (s := sim(book_txt[L], sol_txt.get(L, ""))) is not None and s < 0.6}
    taken = set()
    for L in sorted(suspect):
        cands = [(sim(book_txt[L], sol_txt[M]), M) for M in sol_txt
                 if M != L and M not in taken and (M in suspect or M not in book_txt)]
        cands = [(s, M) for s, M in cands if s is not None and s >= 0.8]
        if cands:
            s, M = max(cands)
            assign[L] = M
            taken.add(M)
            note("solution part matched by content", f"{ch['id']} part {L} <- solutions part {M} ({s:.2f})")
    return assign


def merge_solutions(chapters, sols):
    for ch in chapters:
        if not ch["id"].startswith("ch"):
            continue
        n = int(ch["id"][2:])
        sol_parts = sols.get(n, {})
        assign = match_solution_parts(ch, sol_parts)
        for part in ch["exercises"]:
            sp = sol_parts.get(assign[part["letter"]])
            if not sp:
                continue
            counts["parts-with-solution-file"] += 1
            q_items = part["items"]
            s_items = sp["items"]
            if s_items and len(s_items) != len(q_items):
                note("solution item count mismatch",
                     f"{ch['id']} part {part['letter']}: book {len(q_items)} vs solutions {len(s_items)}")
            matched = 0
            for i, it in enumerate(q_items):
                if i < len(s_items) and s_items[i]["answer"]:
                    it["solution"] = s_items[i]["answer"]
                    matched += 1
            counts["items-with-solution"] += matched
            # part-level answers (e.g. commentary on incorrect proofs)
            if sp["partAnswers"]:
                flat = []
                for a in sp["partAnswers"]:
                    flat.extend(a["children"])
                part["solution"] = flat
            elif not matched and sp["blocks"]:
                # the solution is the whole part content (e.g. completed proofs)
                part["solutionFull"] = sp["blocks"]
            if matched or sp["partAnswers"] or sp["blocks"]:
                part["hasSolutions"] = True


# -------------------------------------------------------------- resolve

def walk(obj, fn):
    if isinstance(obj, dict):
        fn(obj)
        for v in list(obj.values()):
            walk(v, fn)
    elif isinstance(obj, list):
        for v in obj:
            walk(v, fn)


def resolve_inline(n: dict, labels: dict, gloss: dict, ch: dict):
    t = n.get("type")
    if t == "ref":
        lab = n.get("label", "")
        tgt = labels.get(lab)
        if tgt is None:
            if lab:
                note("unresolved ref", f"{ch['id']}: {lab}")
            n["text"] = n.get("text") or "?"
            return
        href = ref_href(tgt)
        if href:
            n["href"] = href
        v = n.get("variant", "cref")
        if v == "hyperref":
            return
        if v == "ref":
            n["text"] = tgt["num"] or tgt.get("text", "")
            return
        if v == "pageref":
            v = "cref"
        cap = v[0] == "C"
        text = ref_text(tgt, cap=cap)
        if n.get("labels"):
            tgts = [labels.get(x) for x in n["labels"]]
            if all(tgts):
                hrefs = [ref_href(t) for t in tgts]
                nouns = {simple_noun(t) for t in tgts}
                if len(nouns) == 1 and None not in nouns:
                    # "chapters 7, 18, 29, 35 and 47": one plural noun, each number linked
                    heads = [ref_text(tgts[0], cap=cap, plural=True)] + [t["num"] for t in tgts[1:]]
                else:
                    # mixed kinds: "section 10.3 and chapter 13"
                    heads = [ref_text(t, cap=cap and i == 0) for i, t in enumerate(tgts)]
                segs = []
                for i, (h, u) in enumerate(zip(heads, hrefs)):
                    if i:
                        segs.append({"text": " and " if i == len(heads) - 1 else ", "})
                    segs.append({"text": h, "href": u} if u else {"text": h})
                n["segments"] = segs
                n["text"] = "".join(s["text"] for s in segs)
                n["hrefs"] = hrefs
                return
        if v in ("crefrange", "Crefrange"):
            t2 = labels.get(n.get("label2", ""))
            if t2:
                if simple_noun(tgt) is not None and simple_noun(tgt) == simple_noun(t2):
                    first, second = ref_text(tgt, cap=cap, plural=True), t2["num"]
                else:
                    first, second = text, ref_text(t2)
                h2 = ref_href(t2)
                n["segments"] = [{"text": first, "href": href} if href else {"text": first},
                                 {"text": " to "},
                                 {"text": second, "href": h2} if h2 else {"text": second}]
                text = first + " to " + second
                if h2:
                    n["href2"] = h2
        n["text"] = text
    elif t == "gls":
        key = n["key"]
        g = gloss.get(key)
        if g is None:
            note("unknown glossary key", f"{ch['id']}: {key}")
            n["text"] = key
            return
        txt = g["name"]
        if n.get("plural"):
            txt = g.get("plural") or (txt + "s")
        if n.get("cap"):
            txt = txt[0].upper() + txt[1:]
        n["text"] = txt


PART_FIRST: dict[str, str] = {}   # part number (roman) -> id of its first chapter


def ref_href(tgt):
    chap = tgt.get("chapter")
    anchor = tgt.get("anchor") or ""
    if tgt["kind"] == "part":
        # the app has no part pages; a part reference opens the part's first chapter
        first = PART_FIRST.get(tgt["num"])
        return f"/read/{first}" if first else None
    if tgt["kind"] == "chapter":
        return f"/read/{chap}"
    return f"/read/{chap}#{anchor}" if anchor else f"/read/{chap}"


def simple_noun(tgt):
    """The noun of a 'noun number' reference (None for exercise-style references)."""
    return {"part": "part", "chapter": "chapter", "section": "section", "subsection": "section",
            "item": "sentence", "table": "table"}.get(tgt["kind"])


def walk_lists(obj, fn):
    """Call fn(list) on every list inside obj (children arrays and the like)."""
    if isinstance(obj, dict):
        for v in obj.values():
            walk_lists(v, fn)
    elif isinstance(obj, list):
        fn(obj)
        for v in obj:
            walk_lists(v, fn)


_PAGE_PREFIX = re.compile(r"(?:\bpp?\.|\bpage)[\s ]*$")


def strip_page_prefix(seq):
    """`p.~\\pageref{x}`: pages do not exist on the web, so drop the `p.` before the link."""
    for i in range(1, len(seq)):
        n, prev = seq[i], seq[i - 1]
        if isinstance(n, dict) and n.get("type") == "ref" and n.get("variant") == "pageref" \
                and isinstance(prev, dict) and prev.get("type") == "text":
            prev["text"] = _PAGE_PREFIX.sub("", prev["text"])


def flatten_nested_refs(n):
    """A reference inside a \\hyperref's link text becomes plain text (no link inside a link)."""
    if n.get("type") != "ref" or not n.get("children"):
        return

    def flat(nodes):
        out = []
        for x in nodes:
            if x.get("type") == "ref":
                x = {"type": "text", "text": x.get("text") or plain(x.get("children", []))}
            elif isinstance(x.get("children"), list):
                x = dict(x, children=flat(x["children"]))
            if x.get("type") == "text" and out and out[-1].get("type") == "text":
                out[-1] = {"type": "text", "text": out[-1]["text"] + x["text"]}
            else:
                out.append(x)
        return out
    n["children"] = flat(n["children"])


def js_slug(s: str) -> str:
    """Same as slug() in src/render/Inline.tsx."""
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def unique_define_anchors(ch):
    """A term defined twice in one chapter would give two elements the same id; the
    second and later ones get an explicit, numbered anchor."""
    seen: Counter = Counter()

    def fn(n):
        if n.get("type") == "define":
            base = "def-" + js_slug(n.get("term", ""))
            seen[base] += 1
            if seen[base] > 1:
                n["anchor"] = f"{base}-{seen[base]}"
    walk(ch, fn)


def ref_text(tgt, cap=False, plural=False):
    k = tgt["kind"]
    names = {"part": "part", "chapter": "chapter", "section": "section", "subsection": "section",
             "item": "sentence", "exercise": "exercise", "table": "table", "exercises": "exercises",
             "section*": "section"}
    name = names.get(k, k)
    if plural:
        name += "s"
    if cap:
        name = name[0].upper() + name[1:]
    if k == "section*":
        return f"{name} “{tgt.get('text','')}”"
    if k == "exercises":
        return f"the practice exercises of chapter {tgt.get('chapter','')[2:].lstrip('0')}"
    if k == "exercise":
        num = tgt["num"]
        ch, letter = num.split(".")
        return f"{name} {letter} of chapter {ch}"
    return f"{name} {tgt['num']}"


def count_blocks(ch):
    def fn(n):
        t = n.get("type")
        if t in ("fitch", "table", "figure", "factoid", "footnote", "displaymath", "list", "define"):
            counts["block:" + t] += 1
        if t == "table" and n.get("truthTable"):
            counts["block:truthtable"] += 1
    walk(ch, fn)


def write_report():
    lines = ["forall x: Calgary conversion report", ""]
    lines.append("Counts:")
    for k, v in sorted(counts.items()):
        lines.append(f"  {k}: {v}")
    lines.append("")
    lines.append("Notes (unhandled or suspicious):")
    for k, v in sorted(report.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"  [{len(v)}] {k}")
        for w in v[:8]:
            lines.append(f"       {w}")
    txt = "\n".join(lines)
    with open(os.path.join(OUT, "report.txt"), "w") as f:
        f.write(txt)
    print(txt)


if __name__ == "__main__":
    convert_book()
