//! Text handling shared by the index: query parsing, tokenizing, passage
//! chunking and snippets. These are ports of `src/lib/search/parse-query.ts`,
//! `snippet.ts` and `src/core/index/chunk.ts`, and must give the same answers:
//! the shared fixtures in `tests/fixtures/index/` run against both.
//!
//! JavaScript counts string length and indexes in UTF-16 units, and the chunk
//! and snippet sizes are defined that way, so those two work on `u16` slices.

use std::sync::LazyLock;

use regex::Regex;

pub const CHUNK_CHARS: usize = 1_500;
pub const CHUNK_OVERLAP: usize = 200;

/// JavaScript's `\s` and `String.prototype.trim` whitespace, as a regex class body.
const WS_CLASS: &str = r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";

static TAG_CHUNK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(&format!(r"(^|[{WS_CLASS}])#[a-zA-Z][A-Za-z0-9_\-/]*")).unwrap());
static TAG_CAPTURE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(r"(?:^|[{WS_CLASS}])#([a-zA-Z][A-Za-z0-9_\-/]*)")).unwrap()
});
static WS_RUN: LazyLock<Regex> = LazyLock::new(|| Regex::new(&format!(r"[{WS_CLASS}]+")).unwrap());
static SEPARATORS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[\n\r\p{Z}\p{P}]+").unwrap());
static WORD_START: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[\p{L}\p{N}_]+").unwrap());
static LETTER_OR_DIGIT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[\p{L}\p{N}]$").unwrap());

pub fn is_js_space(c: u16) -> bool {
    matches!(c, 0x09..=0x0D | 0x20 | 0xA0 | 0x1680 | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF)
}

pub fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| u16::try_from(c as u32).is_ok_and(is_js_space))
}

/// Strip `#tags` from the visible query and collect tag filters (lowercase,
/// without `#`, first occurrence order).
pub fn parse_search_query(raw: &str) -> (String, Vec<String>) {
    let s = raw.replace("\r\n", "\n");
    let mut tags: Vec<String> = Vec::new();
    for m in TAG_CAPTURE.captures_iter(&s) {
        let tag = m[1].to_lowercase();
        if !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    let stripped = TAG_CHUNK.replace_all(&s, "$1");
    let text = WS_RUN.replace_all(&stripped, " ");
    (js_trim(&text).to_string(), tags)
}

/// Query words, split the way MiniSearch splits them.
pub fn tokenize(text: &str) -> Vec<String> {
    SEPARATORS
        .split(&text.to_lowercase())
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect()
}

/// The words a prefix query actually matched ("proj" → "project"), so snippets
/// highlight whole words.
pub fn expand_terms(text: &str, tokens: &[String]) -> Vec<String> {
    let lower = text.to_lowercase();
    tokens
        .iter()
        .map(|token| {
            let at = lower.match_indices(token.as_str()).find(|(i, _)| {
                lower[..*i]
                    .chars()
                    .next_back()
                    .is_none_or(|c| !LETTER_OR_DIGIT.is_match(c.encode_utf8(&mut [0; 4])))
            });
            match at {
                Some((start, _)) => WORD_START
                    .find(&lower[start..])
                    .map_or_else(|| token.clone(), |w| w.as_str().to_string()),
                None => token.clone(),
            }
        })
        .collect()
}

// ---- UTF-16 helpers -------------------------------------------------------

fn u16s(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

fn string(v: &[u16]) -> String {
    String::from_utf16_lossy(v)
}

/// `slice(a, b)` for non-negative indices: clamped, empty when `a >= b`.
fn slice(v: &[u16], a: usize, b: usize) -> &[u16] {
    let b = b.min(v.len());
    let a = a.min(b);
    &v[a..b]
}

fn index_of(hay: &[u16], needle: &[u16], from: usize) -> Option<usize> {
    if needle.is_empty() {
        return Some(from.min(hay.len()));
    }
    if from >= hay.len() {
        return None;
    }
    hay[from..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|i| i + from)
}

fn index_of_char(hay: &[u16], c: u16, from: usize) -> Option<usize> {
    hay.get(from..)?
        .iter()
        .position(|&x| x == c)
        .map(|i| i + from)
}

/// `lastIndexOf(c, from)`: the last position at or before `from`.
fn last_index_of_char(hay: &[u16], c: u16, from: usize) -> Option<usize> {
    if hay.is_empty() {
        return None;
    }
    let end = from.min(hay.len() - 1);
    hay[..=end].iter().rposition(|&x| x == c)
}

fn trim16(v: &[u16]) -> &[u16] {
    let start = v.iter().position(|&c| !is_js_space(c)).unwrap_or(v.len());
    let end = v
        .iter()
        .rposition(|&c| !is_js_space(c))
        .map_or(start, |i| i + 1);
    &v[start..end]
}

const SPACE: u16 = b' ' as u16;
const NEWLINE: u16 = b'\n' as u16;

/// `text.split(/\n\s*\n/)`: a separator is a newline, any whitespace, then a
/// newline — the longest such run.
fn split_paragraphs(text: &[u16]) -> Vec<&[u16]> {
    let mut out = Vec::new();
    let mut piece_start = 0;
    let mut i = 0;
    while i < text.len() {
        if text[i] == NEWLINE {
            let mut run_end = i + 1;
            while run_end < text.len() && is_js_space(text[run_end]) {
                run_end += 1;
            }
            if let Some(last) = text[i + 1..run_end].iter().rposition(|&c| c == NEWLINE) {
                out.push(&text[piece_start..i]);
                i = i + 1 + last + 1;
                piece_start = i;
                continue;
            }
        }
        i += 1;
    }
    out.push(&text[piece_start..]);
    out
}

/// `text.split(/(?<=[.!?])\s+/)`.
fn split_sentences(text: &[u16]) -> Vec<&[u16]> {
    let mut out = Vec::new();
    let mut piece_start = 0;
    let mut i = 1;
    while i < text.len() {
        if is_js_space(text[i]) && matches!(text[i - 1], 0x2E | 0x21 | 0x3F) {
            let mut run_end = i;
            while run_end < text.len() && is_js_space(text[run_end]) {
                run_end += 1;
            }
            out.push(&text[piece_start..i]);
            piece_start = run_end;
            i = run_end;
        } else {
            i += 1;
        }
    }
    out.push(&text[piece_start..]);
    out
}

fn split_long(piece: &[u16], max: usize) -> Vec<Vec<u16>> {
    if piece.len() <= max {
        return vec![piece.to_vec()];
    }
    let sentences = split_sentences(piece);
    if sentences.len() > 1 {
        return sentences
            .into_iter()
            .flat_map(|s| split_long(s, max))
            .collect();
    }
    let mut out = Vec::new();
    let mut rest = piece;
    while rest.len() > max {
        let cut = match last_index_of_char(rest, SPACE, max) {
            Some(c) if (c as f64) >= max as f64 / 2.0 => c,
            _ => max,
        };
        out.push(trim16(&rest[..cut]).to_vec());
        rest = trim16(slice(rest, cut, usize::MAX));
    }
    if !rest.is_empty() {
        out.push(rest.to_vec());
    }
    out
}

/// The last `n` or so units of `text`, starting at a word.
fn tail(text: &[u16], n: usize) -> Vec<u16> {
    if text.len() <= n {
        return text.to_vec();
    }
    let from = text.len() - n;
    match index_of_char(text, SPACE, from) {
        None => text[from..].to_vec(),
        Some(space) => text[space + 1..].to_vec(),
    }
}

/// Splits a document's text into overlapping passages for chat retrieval.
pub fn chunk_text(text: &str) -> Vec<String> {
    chunk_units(&u16s(text), CHUNK_CHARS, CHUNK_OVERLAP)
        .iter()
        .map(|c| string(c))
        .collect()
}

fn chunk_units(text: &[u16], size: usize, overlap: usize) -> Vec<Vec<u16>> {
    let pieces: Vec<Vec<u16>> = split_paragraphs(text)
        .into_iter()
        .map(trim16)
        .filter(|p| !p.is_empty())
        .flat_map(|p| split_long(p, size - overlap))
        .collect();

    let mut chunks = Vec::new();
    let mut current: Vec<u16> = Vec::new();
    let mut fresh = false;
    for piece in pieces {
        if fresh && current.len() + piece.len() + 2 > size {
            let next = tail(&current, overlap);
            chunks.push(std::mem::replace(&mut current, next));
        }
        if !current.is_empty() {
            current.extend_from_slice(&[NEWLINE, NEWLINE]);
        }
        current.extend_from_slice(&piece);
        fresh = true;
    }
    if !current.is_empty() && fresh {
        chunks.push(current);
    }
    chunks
}

pub struct Snippet {
    pub before: String,
    pub hit: String,
    pub after: String,
}

/// A short excerpt highlighting the query terms (case-insensitive).
pub fn build_snippet(text: &str, terms: &[String], max_len: usize) -> Option<Snippet> {
    let collapsed = WS_RUN.replace_all(text, " ");
    let t = u16s(js_trim(&collapsed));
    if t.is_empty() {
        return None;
    }
    let head = |t: &[u16]| {
        let s = if t.len() > max_len {
            format!("{}…", string(&t[..max_len]))
        } else {
            string(t)
        };
        Snippet {
            before: s,
            hit: String::new(),
            after: String::new(),
        }
    };
    if terms.is_empty() {
        return Some(head(&t));
    }

    let lower = u16s(&string(&t).to_lowercase());
    let mut best: Option<(usize, usize)> = None;
    for term in terms {
        let q = u16s(&term.to_lowercase());
        if q.len() < 2 {
            continue;
        }
        if let Some(i) = index_of(&lower, &q, 0)
            && best.is_none_or(|(b, _)| i < b)
        {
            best = Some((i, u16s(term).len()));
        }
    }
    let Some((idx, term_len)) = best else {
        return Some(head(&t));
    };

    let hit_len = slice(&t, idx, idx + term_len).len();
    let max = max_len as i64;
    let pad = ((max - hit_len as i64).div_euclid(2)).max(0) as usize;
    let start = idx.saturating_sub(pad);
    let end = (t.len() as i64)
        .min((idx + hit_len) as i64 + (max - hit_len as i64 - (idx - start) as i64))
        .max(0) as usize;
    Some(Snippet {
        before: format!(
            "{}{}",
            if start > 0 { "…" } else { "" },
            string(slice(&t, start, idx))
        ),
        hit: string(slice(&t, idx, idx + hit_len)),
        after: format!(
            "{}{}",
            string(slice(&t, idx + hit_len, end)),
            if end < t.len() { "…" } else { "" }
        ),
    })
}

/// A prefix of `s` at most `max` UTF-16 units long (`s.slice(0, max)`).
pub fn truncate_units(s: &str, max: usize) -> String {
    let units = u16s(s);
    if units.len() <= max {
        s.to_string()
    } else {
        string(&units[..max])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_are_stripped_and_collected() {
        let (text, tags) = parse_search_query("meeting notes #work #urgent #WORK");
        assert_eq!(text, "meeting notes");
        assert_eq!(tags, vec!["work", "urgent"]);
        assert_eq!(
            parse_search_query("#a #b"),
            ("".into(), vec!["a".into(), "b".into()])
        );
        assert_eq!(parse_search_query("a#b").0, "a#b");
    }

    #[test]
    fn tokens_split_on_space_and_punctuation() {
        assert_eq!(
            tokenize("Hello, World-wide!"),
            vec!["hello", "world", "wide"]
        );
        assert!(tokenize("!!!").is_empty());
        assert!(tokenize("").is_empty());
    }

    #[test]
    fn prefixes_expand_to_whole_words() {
        let terms = expand_terms("The Project plan", &["proj".into(), "zzz".into()]);
        assert_eq!(terms, vec!["project", "zzz"]);
        let terms = expand_terms("subproject project", &["proj".into()]);
        assert_eq!(terms, vec!["project"]);
    }

    #[test]
    fn short_text_is_one_chunk() {
        assert_eq!(chunk_text("one\n\ntwo"), vec!["one\n\ntwo"]);
        assert!(chunk_text("  \n\n  ").is_empty());
    }

    #[test]
    fn long_text_chunks_overlap_and_stay_within_size() {
        let para = "word ".repeat(100);
        let text = [para.trim(); 12].join("\n\n");
        let chunks = chunk_text(&text);
        assert!(chunks.len() > 1);
        for c in &chunks {
            assert!(c.encode_utf16().count() <= CHUNK_CHARS);
        }
        let first_tail: String = chunks[0]
            .chars()
            .rev()
            .take(20)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        assert!(chunks[1].contains(first_tail.trim()));
    }

    #[test]
    fn snippets_centre_on_the_first_match() {
        let s = build_snippet("alpha beta gamma delta", &["gamma".into()], 140).unwrap();
        assert_eq!(
            (s.before.as_str(), s.hit.as_str(), s.after.as_str()),
            ("alpha beta ", "gamma", " delta")
        );
        let long = format!("{} needle {}", "x ".repeat(200), "y ".repeat(200));
        let s = build_snippet(&long, &["needle".into()], 140).unwrap();
        assert_eq!(s.hit, "needle");
        assert!(s.before.starts_with('…') && s.after.ends_with('…'));
        assert!(build_snippet("   ", &[], 140).is_none());
    }
}
