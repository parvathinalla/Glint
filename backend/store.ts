import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Task } from "../shared/model.ts";

export class Store {
  private db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS progress (owner TEXT PRIMARY KEY, task TEXT NOT NULL, expires INTEGER NOT NULL)",
    );
    this.prune();
  }
  load(owner: string): Task | null {
    this.prune();
    const row = this.db
      .prepare("SELECT task FROM progress WHERE owner=?")
      .get(owner) as { task: string } | undefined;
    return row ? (JSON.parse(row.task) as Task) : null;
  }
  save(owner: string, task: Task | null) {
    if (!task?.remember) {
      this.db.prepare("DELETE FROM progress WHERE owner=?").run(owner);
      return;
    }
    // Only the reviewed task schema is persisted. No credential, observation, or conversation fields.
    this.db
      .prepare(
        "INSERT OR REPLACE INTO progress(owner,task,expires) VALUES(?,?,?)",
      )
      .run(owner, JSON.stringify(task), Date.now() + 7 * 86400000);
  }
  prune() {
    this.db.prepare("DELETE FROM progress WHERE expires<?").run(Date.now());
  }
  close() {
    this.db.close();
  }
}
