import {expect,it} from "vitest";
import {isTaskStatusQuestion,isTaskCancelRequest,actionMessage,parseCameraAction} from "../shared/camera-tools";
it.each(["Is my image ready?","Have you finished the image?","You created the image","completed my image","Is it still working?"])("recognizes a progress question without authorizing generation: %s",text=>expect(isTaskStatusQuestion(text)).toBe(true));
it.each(["Create another image","Make the image brighter","How do I say hi?","Generate a finished drawing"])("keeps new requests and explanations out of the status path: %s",text=>expect(isTaskStatusQuestion(text)).toBe(false));
it("recognizes explicit cancellation without confusing descriptions",()=>{
 expect(isTaskCancelRequest("Please cancel the image.")).toBe(true);
 expect(isTaskCancelRequest("Stop it")).toBe(true);
 expect(isTaskCancelRequest("How do I stop waving?")).toBe(false);
});
it("announces the requested image edit and its source",()=>{
 const message=actionMessage(parseCameraAction("edit_camera_image",{prompt:"A friendly wave",source:"last_result"},"edit"));
 expect(message).toBe("I’m updating your image.");expect(message).not.toContain("A friendly wave");
});
