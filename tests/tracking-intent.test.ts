import { expect, it } from "vitest";
import { identifyTrackingObject, trackingIntent, clarifyTrackingObject, cancelsTracking } from "../shared/tracking-intent.ts";
it("routes explicit movement questions and direct tracking requests", () => {
  expect(trackingIntent("Which way did I move the mouse?")).toEqual({concept:"computer mouse"});
  expect(trackingIntent("mouse ye side move chesanu?")).toEqual({concept:"computer mouse"});
  expect(trackingIntent("Track the red cup")).toEqual({concept:"cup"});
  expect(trackingIntent("Which direction did it move?")).toEqual({concept:null});
  expect(identifyTrackingObject("the cable")).toBe("cable");
});
it("does not turn explanations, negations or unrelated questions into tracking", () => {
  for (const value of ["How does object tracking work?", "Do not track the mouse", "Stop tracking", "Explain movement", "Which cable should I use?", "I moved to a new city.", "Track my package", "Track my expenses", "Which side is the USB port?", "Which direction should I plug the cable?"])
    expect(trackingIntent(value)).toBeNull();
});
it("never chooses one object from an ambiguous or negative clarification", () => {
  expect(trackingIntent("Track the mouse and cable")).toEqual({concept:null});
  expect(clarifyTrackingObject("don't track the mouse")).toBeNull();
  expect(clarifyTrackingObject("where is the mouse?")).toBeNull();
  expect(clarifyTrackingObject("the mouse or cable")).toBeNull();
  expect(clarifyTrackingObject("the mouse")).toBe("computer mouse");
  expect(cancelsTracking("not now")).toBe(true);
  expect(cancelsTracking("mouse track cheyyaku")).toBe(true);
});
