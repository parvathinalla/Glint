import {z} from "zod";

// Configure before application schemas load. Avoid the dynamic-code capability
// probe entirely under the production CSP; validation still uses the interpreter.
z.config({jitless:true});
