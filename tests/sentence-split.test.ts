import { expect, it } from "vitest";
import { SentenceStream } from "../shared/sentence-split.ts";

it("emits nothing until a sentence boundary arrives", () => {
  const stream = new SentenceStream();
  expect(stream.push("Hello there")).toEqual([]);
  expect(stream.push(" friend")).toEqual([]);
  expect(stream.finish()).toEqual(["Hello there friend"]);
});

it("splits streamed deltas on sentence ends", () => {
  const stream = new SentenceStream();
  expect(stream.push("I can see")).toEqual([]);
  expect(stream.push(" you. Are you")).toEqual(["I can see you."]);
  expect(stream.push(" ready? Yes! ")).toEqual(["Are you ready?", "Yes!"]);
  expect(stream.finish()).toEqual([]);
});

it("keeps abbreviations and decimals inside one sentence", () => {
  const stream = new SentenceStream();
  expect(
    stream.push("Ask Dr. Smith at 3.14 p.m. about Mr. Jones. Next. "),
  ).toEqual(["Ask Dr. Smith at 3.14 p.m. about Mr. Jones."]);
  expect(stream.finish()).toEqual(["Next."]);
});

it("holds a lowercase continuation after etc.", () => {
  const stream = new SentenceStream();
  expect(stream.push("It costs $5.00 etc. ok? Yes. ")).toEqual([
    "It costs $5.00 etc. ok?",
  ]);
  expect(stream.finish()).toEqual(["Yes."]);
});

it("treats newlines as boundaries and drops empties", () => {
  const stream = new SentenceStream();
  expect(stream.push("First line\n\nSecond line\n")).toEqual([
    "First line",
    "Second line",
  ]);
  expect(stream.finish()).toEqual([]);
});

it("flushes a trailing fragment on finish and ignores blank input", () => {
  const stream = new SentenceStream();
  expect(stream.push("   ")).toEqual([]);
  expect(stream.push("Trailing words")).toEqual([]);
  expect(stream.finish()).toEqual(["Trailing words"]);
  expect(stream.finish()).toEqual([]);
});
