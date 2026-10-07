import { describe, expect, it } from "vitest";
import goldenCorpus from "../../src-tauri/src/identity/golden_corpus.csv?raw";
import { recommendationIdentityKey } from "./recommendationWishList";

type CorpusRow = { level: string; left: string; right: string; relation: string };

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function looseRows(): CorpusRow[] {
  const [, ...lines] = goldenCorpus.split(/\r?\n/).filter((line) => line.length > 0);
  return lines
    .map((line) => {
      const [level, left, right, relation] = parseCsvLine(line);
      return { level, left, right, relation };
    })
    .filter((row) => row.level === "loose");
}

describe("recommendationIdentityKey", () => {
  it("matches the Rust loose_key golden corpus", () => {
    const rows = looseRows();
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) {
      const left = recommendationIdentityKey(row.left);
      const right = row.relation === "->" ? row.right : recommendationIdentityKey(row.right);
      if (row.relation === "!=") {
        expect(left, `${row.left} != ${row.right}`).not.toBe(right);
      } else {
        expect(left, `${row.left} ${row.relation} ${row.right}`).toBe(right);
      }
    }
  });
});
