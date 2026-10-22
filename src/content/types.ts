// Content model produced by tools/convert.py

export type Inline =
  | { type: "text"; text: string }
  | { type: "emph" | "strong" | "sc" | "nobr" | "u" | "sup" | "box"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "define"; term: string; anchor?: string; children: Inline[] }
  | { type: "math"; latex: string; display?: boolean }
  | { type: "footnote"; n: number; children: Inline[] }
  | { type: "ref"; label: string; variant: string; text?: string; href?: string; hrefs?: string[]; href2?: string; segments?: RefSegment[]; children?: Inline[] }
  | { type: "gls"; key: string; text?: string; plural?: boolean }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "blank"; sub?: string }
  | { type: "forallx"; calgary?: boolean }
  | { type: "br" }
  | { type: "parbreak" }
  | { type: "block"; block: Block };

/** One piece of a multi-target reference ("chapters 7, 18 and 29"); pieces with an href are links. */
export interface RefSegment { text: string; href?: string }

export interface FitchLine {
  num: string;
  depth: number;
  hypo: boolean;
  formula: string;
  rule: Inline[] | null;
  ruleText?: string;
  refs: string | null;
  ellipsis?: boolean;
}

export interface TableCol { kind: string; align: string; borderLeft: number; borderRight?: number }
export interface TableRow { cells: { children: Inline[]; colspan?: number }[]; hlineBefore: number; hlineAfter?: number }

export type Block =
  | { type: "para"; children: Inline[]; align?: string }
  | { type: "heading"; level: number; number?: string; children: Inline[]; id: string }
  | { type: "list"; kind: string; items: ListItem[] }
  | { type: "quote" | "center" | "factoid" | "columns" | "answer"; children: Block[] }
  | { type: "displaymath"; latex: string; env?: string; id?: string; number?: string; caption?: Inline[] }
  | { type: "fitch"; lines: FitchLine[] }
  | { type: "table"; cols: TableCol[]; rows: TableRow[]; truthTable: boolean; caption?: Inline[]; number?: string; id?: string }
  | { type: "figure"; svg: string | null; alt: string }
  | { type: "colbreak" | "space" | "exercises-start" }
  | { type: "problempart"; letter: string }
  | { type: "unknown-env"; name: string; children: Block[] };

export interface ListItem {
  n?: number;
  label?: Inline[];
  children: Block[];
  id?: string;
  /** DOM anchor of a labelled item in a numbered list of running text */
  anchor?: string;
  formulas?: string[];
  solution?: Block[];
}

export interface ExercisePart {
  id: string;
  letter: string;
  blocks: Block[];
  items: ListItem[];
  kind: "free" | "symbolize" | "truthtable" | "proof" | "main-connective" | "is-sentence" | "cite";
  sub: string | null;
  logic: "tfl" | "fol" | "ml";
  hasKey: boolean;
  solution?: Block[];
  solutionFull?: Block[];
  hasSolutions?: boolean;
}

export interface Chapter {
  id: string;
  number: string;
  title: string;
  titleInlines: Inline[];
  part: string | null;
  blocks: Block[];
  exercises: ExercisePart[];
}

export interface GlossaryEntry {
  key: string;
  name: string;
  nameInlines: Inline[];
  plural?: string | null;
  description: Inline[];
  chapter: string;
}

export interface Book {
  title: string;
  subtitle: string;
  parts: { number: string; title: string; chapters: ChapterRef[] }[];
  appendices: ChapterRef[];
  glossary: GlossaryEntry[];
  labels: Record<string, { kind: string; num: string; chapter: string; anchor: string; text?: string }>;
  chapters: (ChapterRef & { part: string | null; exerciseCount: number; solvedCount: number; sections: { id: string; number?: string; title: string }[] })[];
}

export interface ChapterRef { id: string; number: string; title: string }
