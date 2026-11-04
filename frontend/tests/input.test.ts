import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInflationSeries, parsePct } from "../src/lib/input.js";

test("percent fields preserve decimal commas and real zero", () => {
  assert.equal(parsePct("8,5"), 0.085);
  assert.equal(parsePct("0"), 0);
  assert.equal(parsePct(" -2.5 "), -0.025);
});

test("invalid percent fields cannot silently become zero", () => {
  for (const value of ["", " ", "8%", "abc", "Infinity", "0x10", "1,2,3"]) {
    assert.equal(parsePct(value), null, value);
  }
});

test("single-column decimal commas and blank lines keep exact observation count", () => {
  assert.deepEqual(parseInflationSeries("\uFEFFИнфляция\r\n0,5\r\n\r\n0,4\r\n"), [0.5, 0.4]);
});

test("semicolon CSV preserves decimal commas", () => {
  assert.deepEqual(parseInflationSeries("Дата;Инфляция\n2020-01;0,5\n2020-02;0,4\n"), [0.5, 0.4]);
});

test("comma CSV supports decimal points and quoted decimal commas", () => {
  assert.deepEqual(parseInflationSeries('Date,Inflation\n2020-01,0.5\n2020-02,"0,4"\n'), [0.5, 0.4]);
});

test("tab-separated data is supported", () => {
  assert.deepEqual(parseInflationSeries("Дата\tИПЦ\n2020-01\t0,5\n"), [0.5]);
});

test("bad values, missing cells and ambiguous delimiters are explicit errors", () => {
  for (const value of ["", "Инфляция\n", "0.5\noops", "Date,Inflation\n2020-01,0,5", "Дата;Инфляция\n2020-01;"]) {
    assert.throws(() => parseInflationSeries(value), Error, value);
  }
});
