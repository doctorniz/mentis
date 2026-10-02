//! Runs the shared fixtures in `tests/fixtures/index` against the native index.
//! `tests/index-fixtures.test.ts` runs the same files against the sqlite-wasm
//! store: both must give the same results in the same order. Scores are left
//! out, since the two engines' ranking arithmetic can differ in the last digits.

use std::fs;
use std::path::PathBuf;

use mentis_lib::index::in_memory_host;
use serde_json::Value;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("tests")
        .join("fixtures")
        .join("index")
}

/// JSON with sorted keys (serde_json's default), so equal values sort alike.
fn canon(v: &Value) -> String {
    v.to_string()
}

fn normalize(op: &str, result: Value) -> Value {
    match (op, result) {
        ("search" | "searchPassages", Value::Array(rows)) => Value::Array(
            rows.into_iter()
                .map(|mut row| {
                    if let Value::Object(map) = &mut row {
                        map.remove("score");
                    }
                    row
                })
                .collect(),
        ),
        ("manifest" | "links" | "children", Value::Array(mut rows)) => {
            rows.sort_by_key(canon);
            Value::Array(rows)
        }
        (_, other) => other,
    }
}

#[test]
fn shared_fixtures_match() {
    let mut names: Vec<PathBuf> = fs::read_dir(fixtures_dir())
        .expect("fixtures directory")
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    names.sort();
    assert!(!names.is_empty(), "no fixtures found");

    for path in names {
        let file = path.file_name().unwrap().to_string_lossy().into_owned();
        let fixture: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let mut host = in_memory_host();
        for (n, step) in fixture["steps"].as_array().unwrap().iter().enumerate() {
            let op = step["op"].as_str().unwrap();
            let arg = step.get("arg").cloned().unwrap_or(Value::Null);
            let got = host
                .call(op, arg)
                .unwrap_or_else(|e| panic!("{file} step {} ({op}): {e}", n + 1));
            let Some(expected) = step.get("expect") else {
                continue;
            };
            assert_eq!(
                normalize(op, got),
                *expected,
                "{file} step {} ({op}) with {}",
                n + 1,
                step["arg"]
            );
        }
    }
}
