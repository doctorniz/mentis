//! Typo-tolerant search over file titles: the in-memory title index the
//! TypeScript store builds with MiniSearch (`fuzzy: 0.2, prefix: true`, one
//! field), ported with the same rules so the same titles match in the same
//! order — BM25+ scoring, prefix and fuzzy weights, and OR across terms.
//!
//! Full-text search is SQLite FTS5; this only finds titles it missed.

use std::collections::{BTreeMap, HashMap, HashSet};

use super::text::tokenize;

const K: f64 = 1.2;
const B: f64 = 0.7;
const D: f64 = 0.5;
const FUZZY: f64 = 0.2;
const MAX_FUZZY: usize = 6;
const FUZZY_WEIGHT: f64 = 0.45;
const PREFIX_WEIGHT: f64 = 0.375;

struct Doc {
    seq: u64,
    /// Distinct tokens in the title: MiniSearch's field length.
    length: usize,
    terms: Vec<String>,
}

struct Posting {
    seq: u64,
    path: String,
    freq: u32,
}

pub struct TitleHit {
    pub path: String,
    pub score: f64,
    /// The index terms that matched, in the order they matched.
    pub terms: Vec<String>,
}

#[derive(Default)]
pub struct TitleIndex {
    docs: HashMap<String, Doc>,
    postings: BTreeMap<String, Vec<Posting>>,
    next_seq: u64,
    total_length: usize,
}

fn units(s: &str) -> usize {
    s.encode_utf16().count()
}

impl TitleIndex {
    pub fn insert(&mut self, path: &str, title: &str) {
        self.remove(path);
        let tokens = tokenize(title);
        let mut freqs: Vec<(String, u32)> = Vec::new();
        for token in &tokens {
            match freqs.iter_mut().find(|(t, _)| t == token) {
                Some((_, n)) => *n += 1,
                None => freqs.push((token.clone(), 1)),
            }
        }
        let seq = self.next_seq;
        self.next_seq += 1;
        let length = freqs.len();
        self.total_length += length;
        for (term, freq) in &freqs {
            self.postings
                .entry(term.clone())
                .or_default()
                .push(Posting {
                    seq,
                    path: path.to_string(),
                    freq: *freq,
                });
        }
        self.docs.insert(
            path.to_string(),
            Doc {
                seq,
                length,
                terms: freqs.into_iter().map(|(t, _)| t).collect(),
            },
        );
    }

    pub fn remove(&mut self, path: &str) {
        let Some(doc) = self.docs.remove(path) else {
            return;
        };
        self.total_length -= doc.length;
        for term in &doc.terms {
            if let Some(list) = self.postings.get_mut(term) {
                list.retain(|p| p.seq != doc.seq);
                if list.is_empty() {
                    self.postings.remove(term);
                }
            }
        }
    }

    /// Titles matching `text` by exact word, word prefix or small typo, best first.
    pub fn search(&self, text: &str) -> Vec<TitleHit> {
        let query_terms = tokenize(text);
        let mut combined: Vec<Scored> = Vec::new();
        let mut at: HashMap<u64, usize> = HashMap::new();
        for term in &query_terms {
            for scored in self.term_results(term) {
                match at.get(&scored.seq) {
                    Some(&i) => {
                        combined[i].score += scored.score;
                        for t in scored.terms {
                            if !combined[i].terms.contains(&t) {
                                combined[i].terms.push(t);
                            }
                        }
                        for t in scored.source_terms {
                            if !combined[i].source_terms.contains(&t) {
                                combined[i].source_terms.push(t);
                            }
                        }
                    }
                    None => {
                        at.insert(scored.seq, combined.len());
                        combined.push(scored);
                    }
                }
            }
        }
        let mut hits: Vec<TitleHit> = combined
            .into_iter()
            .map(|s| TitleHit {
                score: s.score * s.source_terms.len().max(1) as f64,
                path: s.path,
                terms: s.terms,
            })
            .collect();
        hits.sort_by(|a, b| b.score.total_cmp(&a.score));
        hits
    }

    fn term_results(&self, term: &str) -> Vec<Scored> {
        let mut results: Vec<Scored> = Vec::new();
        let mut at: HashMap<u64, usize> = HashMap::new();
        let n_docs = self.docs.len();
        let avg = if n_docs == 0 {
            0.0
        } else {
            self.total_length as f64 / n_docs as f64
        };

        let mut add = |derived: &str, weight: f64, results: &mut Vec<Scored>| {
            let Some(list) = self.postings.get(derived) else {
                return;
            };
            for p in list {
                let doc = &self.docs[&p.path];
                let score =
                    weight * bm25(p.freq as f64, list.len(), n_docs, doc.length as f64, avg);
                match at.get(&p.seq) {
                    Some(&i) => {
                        results[i].score += score;
                        if !results[i].terms.contains(&derived.to_string()) {
                            results[i].terms.push(derived.to_string());
                        }
                    }
                    None => {
                        at.insert(p.seq, results.len());
                        results.push(Scored {
                            seq: p.seq,
                            path: p.path.clone(),
                            score,
                            terms: vec![derived.to_string()],
                            source_terms: vec![term.to_string()],
                        });
                    }
                }
            }
        };

        add(term, 1.0, &mut results);

        let term_len = units(term);
        let mut prefixed: HashSet<&str> = HashSet::new();
        for (candidate, _) in self.postings.range(term.to_string()..) {
            if !candidate.starts_with(term) {
                break;
            }
            let distance = units(candidate) - term_len;
            if distance == 0 {
                continue;
            }
            prefixed.insert(candidate);
            let weight = PREFIX_WEIGHT * units(candidate) as f64
                / (units(candidate) as f64 + 0.3 * distance as f64);
            add(candidate, weight, &mut results);
        }

        let max_distance = MAX_FUZZY.min((term_len as f64 * FUZZY).round() as usize);
        if max_distance > 0 {
            for candidate in self.postings.keys() {
                if prefixed.contains(candidate.as_str()) {
                    continue;
                }
                if units(candidate).abs_diff(term_len) > max_distance {
                    continue;
                }
                let distance = strsim::levenshtein(term, candidate);
                if distance == 0 || distance > max_distance {
                    continue;
                }
                let weight = FUZZY_WEIGHT * units(candidate) as f64
                    / (units(candidate) as f64 + distance as f64);
                add(candidate, weight, &mut results);
            }
        }
        results
    }
}

struct Scored {
    seq: u64,
    path: String,
    score: f64,
    terms: Vec<String>,
    source_terms: Vec<String>,
}

fn bm25(freq: f64, matching: usize, total: usize, field_length: f64, avg_length: f64) -> f64 {
    let idf = (1.0 + (total as f64 - matching as f64 + 0.5) / (matching as f64 + 0.5)).ln();
    idf * (D + freq * (K + 1.0) / (freq + K * (1.0 - B + B * field_length / avg_length)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index(titles: &[(&str, &str)]) -> TitleIndex {
        let mut i = TitleIndex::default();
        for (p, t) in titles {
            i.insert(p, t);
        }
        i
    }

    fn paths(hits: &[TitleHit]) -> Vec<&str> {
        hits.iter().map(|h| h.path.as_str()).collect()
    }

    #[test]
    fn finds_typos_prefixes_and_exact_words() {
        let i = index(&[("a.md", "Quarterly report"), ("b.md", "Holiday plans")]);
        assert_eq!(paths(&i.search("quartrly")), vec!["a.md"]);
        assert_eq!(paths(&i.search("hol")), vec!["b.md"]);
        assert_eq!(paths(&i.search("holiday")), vec!["b.md"]);
        assert!(i.search("zzzzzz").is_empty());
    }

    #[test]
    fn short_words_get_no_typo_tolerance() {
        let i = index(&[("a.md", "cat")]);
        assert!(i.search("cu").is_empty());
        assert_eq!(paths(&i.search("ca")), vec!["a.md"]);
    }

    #[test]
    fn reinserting_and_removing_replace_a_title() {
        let mut i = index(&[("a.md", "alpha")]);
        i.insert("a.md", "bravo");
        assert!(i.search("alpha").is_empty());
        assert_eq!(paths(&i.search("bravo")), vec!["a.md"]);
        i.remove("a.md");
        assert!(i.search("bravo").is_empty());
    }

    #[test]
    fn exact_matches_outrank_typos() {
        let i = index(&[("a.md", "project plan"), ("b.md", "projct plan notes")]);
        assert_eq!(paths(&i.search("project"))[0], "a.md");
    }
}
