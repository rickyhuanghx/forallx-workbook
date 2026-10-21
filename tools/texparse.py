"""Minimal LaTeX tokenizer and parser for the forall x: Calgary source.

Produces a generic node tree; rendering to the content model lives in
convert.py. Only the subset of LaTeX used by the book is handled, and the
parser reports every command or environment it does not know.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------- nodes


@dataclass
class Text:
    text: str


@dataclass
class Par:
    pass


@dataclass
class Math:
    raw: str
    display: bool = False


@dataclass
class Group:
    children: list
    raw: str = ""


@dataclass
class Cmd:
    name: str
    star: bool = False
    opts: list = field(default_factory=list)       # list of raw strings
    args: list = field(default_factory=list)       # list of Group
    pos: int = 0


@dataclass
class Env:
    name: str
    opts: list = field(default_factory=list)
    args: list = field(default_factory=list)
    children: list = field(default_factory=list)
    raw: str = ""
    pos: int = 0


@dataclass
class Amp:
    pass


@dataclass
class Verb:
    text: str


# ------------------------------------------------------------ preprocess


def preprocess(src: str) -> str:
    """Resolve \\ifHTMLtarget / \\iflatexml conditionals (keep the true branch)."""
    out = []
    i = 0
    pat = re.compile(r"\\(ifHTMLtarget|iflatexml)\b")
    while True:
        m = pat.search(src, i)
        if not m:
            out.append(src[i:])
            break
        out.append(src[i:m.start()])
        # find matching \else / \fi, allowing nesting of \if...
        j = m.end()
        depth = 1
        true_branch_end = None
        fi_end = None
        tok = re.compile(r"\\(if[A-Za-z@]*|else|fi)\b")
        while True:
            t = tok.search(src, j)
            if not t:
                raise ValueError("unterminated conditional")
            name = t.group(1)
            if name.startswith("if"):
                depth += 1
            elif name == "else" and depth == 1:
                true_branch_end = t.start()
                else_end = t.end()
            elif name == "fi":
                depth -= 1
                if depth == 0:
                    fi_end = t.end()
                    fi_start = t.start()
                    break
            j = t.end()
        keep_true = m.group(1) == "ifHTMLtarget"
        if true_branch_end is not None:
            out.append(src[m.end():true_branch_end] if keep_true else src[else_end:fi_start])
        elif keep_true:
            out.append(src[m.end():fi_start])
        i = fi_end
    return "".join(out)


# -------------------------------------------------------------- tokenizer

@dataclass
class Tok:
    kind: str
    val: str
    pos: int
    end: int


def tokenize(src: str) -> list[Tok]:
    toks: list[Tok] = []
    i = 0
    n = len(src)
    buf = []
    buf_start = 0

    def flush():
        nonlocal buf
        if buf:
            s = "".join(buf)
            toks.append(Tok("text", s, buf_start, buf_start + len(s)))
            buf = []

    while i < n:
        c = src[i]
        if c == "%":
            flush()
            j = src.find("\n", i)
            if j == -1:
                break
            i = j + 1
            # TeX drops leading whitespace of the next line
            while i < n and src[i] in " \t":
                i += 1
            continue
        if c == "\\":
            flush()
            if i + 1 >= n:
                break
            d = src[i + 1]
            if d.isalpha():
                j = i + 1
                while j < n and src[j].isalpha():
                    j += 1
                name = src[i + 1:j]
                star = False
                if j < n and src[j] == "*":
                    star = True
                    j += 1
                if name == "verb":
                    delim = src[j]
                    k = src.find(delim, j + 1)
                    toks.append(Tok("verb", src[j + 1:k], i, k + 1))
                    i = k + 1
                    continue
                toks.append(Tok("cmd", name + ("*" if star else ""), i, j))
                # skip whitespace after a control word (TeX behaviour)
                while j < n and src[j] in " \t":
                    j += 1
                if j < n and src[j] == "\n":
                    # a single newline after a control word is a space,
                    # but a blank line is still a paragraph break
                    k = j + 1
                    while k < n and src[k] in " \t":
                        k += 1
                    if k < n and src[k] == "\n":
                        pass  # leave the newline for par detection
                    else:
                        j += 1
                i = j
                continue
            else:
                if d == "[":
                    toks.append(Tok("dmath_open", "\\[", i, i + 2))
                elif d == "]":
                    toks.append(Tok("dmath_close", "\\]", i, i + 2))
                elif d == "(":
                    toks.append(Tok("imath_open", "\\(", i, i + 2))
                elif d == ")":
                    toks.append(Tok("imath_close", "\\)", i, i + 2))
                else:
                    toks.append(Tok("cmd", d, i, i + 2))
                i += 2
                continue
        if c == "{":
            flush()
            toks.append(Tok("bgroup", "{", i, i + 1))
            i += 1
            continue
        if c == "}":
            flush()
            toks.append(Tok("egroup", "}", i, i + 1))
            i += 1
            continue
        if c == "$":
            flush()
            if i + 1 < n and src[i + 1] == "$":
                toks.append(Tok("dmath", "$$", i, i + 2))
                i += 2
            else:
                toks.append(Tok("math", "$", i, i + 1))
                i += 1
            continue
        if c == "&":
            flush()
            toks.append(Tok("amp", "&", i, i + 1))
            i += 1
            continue
        if c == "\n":
            # paragraph break?
            j = i + 1
            blank = False
            while j < n and src[j] in " \t\n":
                if src[j] == "\n":
                    blank = True
                j += 1
            if blank:
                flush()
                toks.append(Tok("par", "\n\n", i, j))
                i = j
            else:
                if not buf:
                    buf_start = i
                buf.append(" ")
                i += 1
            continue
        if not buf:
            buf_start = i
        buf.append(c)
        i += 1
    flush()
    return toks


# ---------------------------------------------------------------- parser

# command signatures: string of 'o' (optional [..]) and 'm' (mandatory {..})
CMD_SIG: dict[str, str] = {
    "chapter": "om", "section": "om", "subsection": "om", "subsubsection": "om",
    "part": "om", "paragraph": "om", "chapter*": "m", "section*": "m",
    "subsection*": "m", "part*": "m", "paragraph*": "m",
    "emph": "m", "textit": "m", "textbf": "m", "textsc": "m", "texttt": "m",
    "textsf": "m", "textrm": "m", "textsuperscript": "m", "textsubscript": "m",
    "underline": "m", "mbox": "m", "fbox": "m", "phantom": "m", "hphantom": "m",
    "define": "m", "footnote": "om", "label": "m", "ref": "m", "ref*": "m",
    "cref": "m", "cref*": "m", "Cref": "m", "Cref*": "m", "crefrange": "mm",
    "pageref": "m", "hyperref": "om", "href": "mm", "url": "m",
    "gls": "m", "glspl": "m", "Gls": "m", "Glspl": "m",
    "newglossaryentry": "mm", "ensuremath": "m", "metav": "m", "script": "m",
    "atom": "mm", "ntuple": "m", "model": "m", "extension": "m", "referent": "m",
    "gap": "m", "TTbf": "m", "myanswer": "m", "textcolor": "mm", "color": "m",
    "colorlet": "mm", "vspace": "m", "vspace*": "m", "hspace": "m", "hspace*": "m",
    "setcounter": "mm", "stepcounter": "m", "refstepcounter": "m",
    "addcontentsline": "mmm", "addtocontents": "mm", "sectionmark": "m",
    "markright": "m", "index": "m", "bmlDescription": "m", "bmlPlusClass": "m",
    "includegraphics": "om", "item": "o", "hypo": "oommo", "have": "oommo",
    "by": "mm", "open": "o", "close": "", "guard": "om", "ellipsesline": "",
    "PR": "", "AS": "", "hline": "", "cline": "m", "multicolumn": "mmm",
    "setlength": "mm", "newlength": "m", "renewcommand": "mm", "newcommand": "mm",
    "renewcommand*": "mm", "newcommand*": "mm", "renewenvironment": "mmm",
    "newenvironment": "mmm", "setkeys": "mm", "usepackage": "om", "input": "m",
    "include": "m", "caption": "om", "enquote": "m", "columnbreak": "",
    "noindent": "", "par": "", "newpage": "", "clearpage": "", "bigskip": "",
    "medskip": "", "smallskip": "", "vfill": "", "hfill": "", "centering": "",
    "raggedright": "", "small": "", "footnotesize": "", "large": "", "Large": "",
    "LARGE": "", "normalsize": "", "scriptsize": "", "tiny": "", "protect": "",
    "relax": "", "ignorespaces": "", "ignorespacesafterend": "", "solutions": "",
    "leftsolutions": "", "practiceproblems": "", "problempart": "",
    "appendix": "", "frontmatter": "", "mainmatter": "", "backmatter": "",
    "tableofcontents": "", "tableofcontents*": "", "printglossaries": "",
    "glsaddall": "", "currentpdfbookmark": "mm", "thispagestyle": "m",
    "pagestyle": "m", "addtodef": "mmm", "node": "", "draw": "", "tikzset": "m",
    "midsloppy": "", "ndrules": "", "selectfont": "", "fontsize": "mm",
    "arraybackslash": "", "hsize": "", "rule": "omm", "makebox": "oom",
    "parbox": "omm", "raisebox": "omm", "settowidth": "mm", "ldots": "",
    "dots": "", "cdots": "", "vdots": "", "forallx": "", "forallxyyc": "",
    "ifeff": "", "blank": "", "texttherefore": "", "therefore": "",
    "eand": "", "eor": "", "enot": "", "eif": "", "eiff": "", "ered": "",
    "ebox": "", "ediamond": "", "proves": "", "entails": "", "nproves": "",
    "nentails": "", "mlK": "", "mlT": "", "mlSfour": "", "mlSfive": "",
    "maththe": "", "forall": "", "exists": "", "lnot": "", "land": "", "lor": "",
    "neg": "", "wedge": "", "vee": "", "rightarrow": "", "leftrightarrow": "",
    "Leftrightarrow": "", "Rightarrow": "", "bot": "", "Box": "", "Diamond": "",
    "quad": "", "qquad": "", "textbackslash": "", "textendash": "",
    "textemdash": "", "textquoteleft": "", "textquoteright": "",
    "textquotedblleft": "", "textquotedblright": "", "slash": "",
    "textbullet": "", "textasciitilde": "", "textgreater": "", "textless": "",
    "copyright": "", "LaTeX": "", "TeX": "", "today": "", "and": "",
    "glossaryentry": "mm", "nocite": "m", "cite": "om", "bibliography": "m",
    "newcolumntype": "mm", "extracolsep": "m", "toprule": "", "midrule": "",
    "bottomrule": "", "multirow": "mmm", "tabularnewline": "", "cr": "",
    "linebreak": "o", "newline": "", "nolinebreak": "o", "nopagebreak": "o",
    "pagebreak": "o", "allowbreak": "", "penalty": "", "kern": "",
    "mathem": "", "resizebox": "mmm", "scalebox": "om", "rotatebox": "om",
    "textwidth": "", "linewidth": "", "columnwidth": "", "textheight": "",
    "glsentrytext": "m", "glsentryname": "m", "hyperlink": "mm",
    "hypertarget": "mm", "phantomsection": "", "arabic": "m", "Alph": "m",
    "alph": "m", "Roman": "m", "roman": "m", "thechapter": "", "theProbPart": "",
    "vskip": "", "hskip": "", "medbreak": "", "goodbreak": "", "nobreak": "",
    "nopagebreak": "o", "samepage": "", "enlargethispage": "m", "put": "",
    "ndref": "m", "ai": "m", "ae": "m", "oi": "m", "oe": "m", "ci": "m",
    "ce": "m", "bi": "m", "be": "m", "ni": "m", "ne": "m", "ri": "m", "re": "m",
    "ii": "m", "ie": "m", "Ai": "m", "Ae": "m", "Ei": "m", "Ee": "m",
    "tnd": "m", "ip": "m", "dne": "m", "mt": "m", "ds": "m", "dem": "m",
    "cq": "m", "boxi": "m", "boxe": "m", "mc": "m", "diadf": "m", "rt": "m",
    "rfour": "m", "rfive": "m", "ellipsesline": "",
    "glsadd": "m", "textsc*": "m", "lowercase": "m", "uppercase": "m",
    "MakeUppercase": "m", "MakeLowercase": "m",
    "setlist": "om", "newlist": "mmm", "restartlist": "m",
    "bmlimage": "", "arialabel": "m", "factoidbox": "m", "bigl": "", "bigr": "",
    "Bigl": "", "Bigr": "", "left": "", "right": "", "hrulefill": "",
    "foreignlanguage": "mm", "lxTableColumnHead": "m", "lxBeginTableHead": "",
    "lxEndTableHead": "", "def": "", "sffamily": "", "gitAbbrevHash": "",
    "gitCommitterDate": "", "Crefrange": "mm", "ss": "", "S": "", "onecolumn": "",
    "L": "", "l": "", "hbox": "m", "null": "", "stockheight": "", "stockwidth": "",
    "rmfamily": "", "forallxversion": "", "barlength": "", "tmptable": "",
    "mathemwd": "", "text": "m", "nu": "", '"': "m", "'": "m", "`": "m", "^": "m", "c": "m", "v": "m",
    "H": "m", "\\\\": "o", "ae": "m", "oe": "m",
}

# environments that take arguments: string signature like commands
ENV_SIG: dict[str, str] = {
    "tabular": "om", "tabular*": "mm", "tabularx": "mm", "tabu": "m",
    "array": "om", "multicols": "m", "minipage": "om", "tikzpicture": "o",
    "fitchproof": "o", "nd": "o", "table": "o", "sidewaystable": "o",
    "figure": "o", "wrapfigure": "omm", "textblock*": "mm", "itemize": "o",
    "enumerate": "o", "compactlist": "o", "numberlist": "o", "earg": "o",
    "ekey": "o", "factoiditems": "o", "factoidnumber": "o", "description": "o",
    "list": "mm", "longtable": "om", "Spacing": "m", "spacing": "m",
    "arialabel": "m", "bmlimage": "", "quote": "", "quotation": "", "center": "",
    "flushleft": "", "flushright": "", "raggedright": "", "raggedleft": "",
    "factoidboxe": "", "align*": "", "align": "", "multline*": "", "multline": "",
    "equation*": "", "equation": "", "gather*": "", "document": "", "small": "",
    "footnotesize": "", "verbatim": "", "comment": "",
}

# environments whose body is kept raw (math or drawing)
RAW_ENVS = {"align*", "align", "multline*", "multline", "equation*", "equation",
            "gather*", "tikzpicture", "verbatim", "comment"}


class ParseError(Exception):
    pass


class Parser:
    def __init__(self, src: str, report: dict | None = None, fname: str = ""):
        self.src = src
        self.toks = tokenize(src)
        self.i = 0
        self.report = report if report is not None else {}
        self.fname = fname

    # -- helpers
    def peek(self) -> Tok | None:
        return self.toks[self.i] if self.i < len(self.toks) else None

    def next(self) -> Tok:
        t = self.toks[self.i]
        self.i += 1
        return t

    def line_of(self, pos: int) -> int:
        return self.src.count("\n", 0, pos) + 1

    def note(self, key: str, pos: int):
        self.report.setdefault(key, []).append(f"{self.fname}:{self.line_of(pos)}")

    # -- parsing
    def parse(self, stop_env: str | None = None) -> list:
        out: list = []
        while self.i < len(self.toks):
            t = self.peek()
            if t.kind == "cmd" and t.val == "end":
                if stop_env is None:
                    raise ParseError(f"stray \\end at line {self.line_of(t.pos)}")
                return out
            if t.kind == "egroup":
                if stop_env == "{":
                    return out
                # stray brace: skip
                self.next()
                self.note("stray }", t.pos)
                continue
            out.append(self.parse_one())
        if stop_env is not None:
            raise ParseError(f"unterminated {stop_env} in {self.fname}")
        return out

    def parse_group(self) -> Group:
        t = self.next()
        assert t.kind == "bgroup"
        start = t.end
        children = self.parse("{")
        t2 = self.next()
        assert t2.kind == "egroup"
        return Group(children, self.src[start:t2.pos])

    def parse_one(self):
        t = self.next()
        k = t.kind
        if k == "text":
            return Text(t.val)
        if k == "par":
            return Par()
        if k == "verb":
            return Verb(t.val)
        if k == "amp":
            return Amp()
        if k == "bgroup":
            self.i -= 1
            return self.parse_group()
        if k == "math":
            j = self.i
            while self.toks[j].kind != "math":
                j += 1
            raw = self.src[t.end:self.toks[j].pos]
            self.i = j + 1
            return Math(raw, False)
        if k == "dmath":
            j = self.i
            while self.toks[j].kind != "dmath":
                j += 1
            raw = self.src[t.end:self.toks[j].pos]
            self.i = j + 1
            return Math(raw, True)
        if k == "dmath_open":
            j = self.i
            while self.toks[j].kind != "dmath_close":
                j += 1
            raw = self.src[t.end:self.toks[j].pos]
            self.i = j + 1
            return Math(raw, True)
        if k == "imath_open":
            j = self.i
            while self.toks[j].kind != "imath_close":
                j += 1
            raw = self.src[t.end:self.toks[j].pos]
            self.i = j + 1
            return Math(raw, False)
        if k == "cmd":
            return self.parse_cmd(t)
        raise ParseError(f"unexpected token {t}")

    def read_opt(self) -> str | None:
        """Read an optional [..] argument if the next text token starts with '['."""
        t = self.peek()
        if t is None or t.kind != "text" or not t.val.lstrip().startswith("["):
            return None
        lead = self.src[t.pos:t.pos + t.val.index("[")]
        if "\n" in lead:
            return None
        # find the matching ']' across tokens (brackets may contain commands)
        start_tok = self.i
        depth = 0
        buf_start = None
        j = self.i
        # scan characters within the source directly
        pos = t.pos + t.val.index("[")
        p = pos
        s = self.src
        depth = 0
        while p < len(s):
            c = s[p]
            if c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    break
            elif c == "{":
                # skip balanced group
                d = 1
                p += 1
                while p < len(s) and d:
                    if s[p] == "{":
                        d += 1
                    elif s[p] == "}":
                        d -= 1
                    p += 1
                continue
            p += 1
        raw = s[pos + 1:p]
        endpos = p + 1
        # advance token index past endpos
        while self.i < len(self.toks) and self.toks[self.i].end <= endpos:
            self.i += 1
        # the token containing endpos may extend beyond; split it
        if self.i < len(self.toks) and self.toks[self.i].pos < endpos:
            tk = self.toks[self.i]
            rest = s[endpos:tk.end]
            self.toks[self.i] = Tok(tk.kind, rest, endpos, tk.end)
        return raw

    def read_mand(self) -> Group:
        # skip whitespace-only text tokens
        while True:
            t = self.peek()
            if t is None:
                raise ParseError("missing argument")
            if t.kind == "text" and t.val.strip() == "":
                self.next()
                continue
            break
        t = self.peek()
        if t.kind == "bgroup":
            return self.parse_group()
        # single token argument
        if t.kind == "text":
            # take first non-space char
            s = t.val.lstrip()
            ch = s[0]
            rest = s[1:]
            self.next()
            if rest:
                self.toks.insert(self.i, Tok("text", rest, t.end - len(rest), t.end))
            return Group([Text(ch)], ch)
        node = self.parse_one()
        return Group([node], self.src[t.pos:self.toks[self.i - 1].end] if self.i > 0 else "")

    def parse_cmd(self, t: Tok):
        name = t.val
        if name == "begin":
            g = self.read_mand()
            env = g.raw.strip()
            sig = ENV_SIG.get(env)
            if sig is None:
                self.note(f"env {env}", t.pos)
                sig = ""
            opts, args = [], []
            for ch in sig:
                if ch == "o":
                    o = self.read_opt()
                    opts.append(o)
                else:
                    args.append(self.read_mand())
            body_start = self.toks[self.i].pos if self.i < len(self.toks) else len(self.src)
            if env in RAW_ENVS:
                # find \end{env} textually
                m = re.compile(r"\\end\{" + re.escape(env) + r"\}").search(self.src, body_start)
                raw = self.src[body_start:m.start()]
                while self.i < len(self.toks) and self.toks[self.i].pos < m.end():
                    self.i += 1
                return Env(env, opts, args, [], raw, t.pos)
            children = self.parse(env)
            e = self.next()  # \end
            g2 = self.read_mand()
            if g2.raw.strip() != env:
                raise ParseError(f"mismatched env {env} / {g2.raw} at line {self.line_of(e.pos)}")
            raw = self.src[body_start:e.pos]
            return Env(env, opts, args, children, raw, t.pos)
        sig = CMD_SIG.get(name)
        if sig is None:
            if name.isalpha() or name.endswith("*"):
                self.note(f"cmd \\{name}", t.pos)
            sig = ""
        c = Cmd(name.rstrip("*"), name.endswith("*"), [], [], t.pos)
        for ch in sig:
            if ch == "o":
                c.opts.append(self.read_opt())
            else:
                c.args.append(self.read_mand())
        return c


def parse_file(path: str, report: dict) -> list:
    with open(path, encoding="utf-8") as f:
        src = f.read()
    src = preprocess(src)
    p = Parser(src, report, path.split("/")[-1])
    return p.parse()
