import { expect, it } from "vitest";
import { identifyTrackingObject, trackingIntent } from "../shared/tracking-intent.ts";
it("routes explicit movement questions and direct tracking requests", () => {
  expect(trackingIntent("Which way did I move the mouse?")).toEqual({concept:"computer mouse"});
  expect(trackingIntent("mouse ye side move chesanu?")).toEqual({concept:"computer mouse"});
  expect(trackingIntent("Track the red cup")).toEqual({concept:"cup"});
  expect(trackingIntent("Which direction did it move?")).toEqual({concept:null});
  expect(identifyTrackingObject("the cable")).toBe("cable");
});
it("does not turn explanations, negations or unrelated questions into tracking", () => {
  for (const value of ["How does object tracking work?", "Do not track the mouse", "Stop tracking", "Explain movement", "Which cable should I use?", "I moved to a new city.", "Track my package", "Track my expenses"])
    expect(trackingIntent(value)).toBeNull();
});
