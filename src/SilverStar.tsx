import { useEffect, useRef, useState } from "react";

const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
const fragment = `precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float activity;
uniform float dark;
uniform float motion;
float shape(vec3 p){
  float a=atan(p.x,p.y);
  float radius=.72+.16*cos(5.*a);
  return (length(vec3(p.xy/radius,p.z/.34))-1.)*.32;
}
float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y*2.45;
 float breath=1.+motion*(.012*sin(time*1.6)+activity*.008*sin(time*5.));
 uv.y-=motion*.035*sin(time*1.3);
 float tilt=motion*.035*sin(time*.7);
 uv=mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*uv/breath;
 vec3 origin=vec3(uv,2.5), ray=vec3(0.,0.,-1.);
 float travel=0.; vec3 p=origin; bool hit=false;
 for(int i=0;i<48;i++){p=origin+ray*travel;float d=shape(p);if(d<.0015){hit=true;break;}travel+=max(d,.002);if(travel>3.5)break;}
 float rimDistance=max(0.,length(uv)-(.72+.16*cos(5.*atan(uv.x,uv.y))));
 float halo=exp(-rimDistance*23.)*.12*dark;
 if(!hit){float alpha=halo*(.75+activity*.4);gl_FragColor=vec4(vec3(.55,.78,.9)*alpha,alpha);return;}
 // A smooth inflated face avoids polar ridges meeting at the eyes.
 vec3 n=normalize(vec3(p.xy*.9,p.z*2.5));
 vec3 light=normalize(vec3(-.65,.8,1.3));
 float diffuse=max(dot(n,light),0.);
 float spec=pow(max(dot(n,normalize(light+vec3(0.,0.,1.))),0.),42.);
 float edge=pow(1.-max(n.z,0.),2.4);
 vec3 base=mix(vec3(.36,.51,.61),vec3(.78,.87,.91),diffuse);
 base+=vec3(.75,.87,.94)*spec*.35;
 base+=vec3(.35,.7,.92)*edge*(.55+dark*.4);
 float grain=(noise(gl_FragCoord.xy)-.5)*.055;
 base+=grain;
 float blink=1.-motion*.92*pow(max(0.,cos(time*1.1)),60.);
 vec2 eye1=(p.xy-vec2(-.155,.015))/vec2(.039,.078*blink);
 vec2 eye2=(p.xy-vec2(.155,.015))/vec2(.039,.078*blink);
 float eyes=min(dot(eye1,eye1),dot(eye2,eye2));
 base=mix(base,vec3(.96,1.,1.),1.-smoothstep(.5,1.15,eyes));
 base+=vec3(.42,.7,.8)*exp(-eyes*.65)*(.3+activity*.15);
 gl_FragColor=vec4(base,1.);
}`;

/** One small, local GPU surface; no model, network request or audio capture. */
export function SilverStar({ state, children }: {state: string; children: React.ReactNode}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const gl = node.getContext("webgl", {alpha:true, premultipliedAlpha:true, antialias:false, powerPreference:"low-power"});
    if (!gl) return;
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let frame = 0, disposed = false, last = -1000, signature = "";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const created = performance.now();
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw Error("Shader unavailable");
        shaders.push(shader); gl.shaderSource(shader,source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error("Shader unsupported");
      }
      program=gl.createProgram(); if(!program) throw Error("Renderer unavailable");
      for(const shader of shaders) gl.attachShader(program,shader);
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error("Renderer unsupported");
      gl.useProgram(program);
      buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,"position");gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      const uniforms=Object.fromEntries(["resolution","time","activity","dark","motion"].map(key=>[key,gl.getUniformLocation(program!,key)]));
      const render=(now:number)=>{
        if(disposed || gl.isContextLost()) return;
        if(!document.hidden && now-last>=33){
          last=now;
          const size=node.getBoundingClientRect(), ratio=Math.min(devicePixelRatio||1,1.5);
          if(!size.width || !size.height){frame=requestAnimationFrame(render);return;}
          const width=Math.max(1,Math.round(size.width*ratio)), height=Math.max(1,Math.round(size.height*ratio));
          const nextSignature=[width,height,stateRef.current,document.documentElement.dataset.theme,reduced.matches].join(":");
          if(reduced.matches && signature===nextSignature){frame=requestAnimationFrame(render);return;}
          signature=nextSignature;
          if(node.width!==width || node.height!==height){node.width=width;node.height=height;gl.viewport(0,0,width,height);}
          const active=stateRef.current;
          gl.uniform2f(uniforms.resolution,width,height);
          gl.uniform1f(uniforms.time,reduced.matches?1.4:(now-created)/1000);
          gl.uniform1f(uniforms.activity,active==="speaking"?1:active==="thinking"?.6:active==="listening"?.3:0);
          gl.uniform1f(uniforms.motion,reduced.matches?0:1);
          gl.uniform1f(uniforms.dark,document.documentElement.dataset.theme==="dark"?1:0);
          gl.drawArrays(gl.TRIANGLES,0,6);
        }
        frame=requestAnimationFrame(render);
      };
      frame=requestAnimationFrame(render); setReady(true);
    } catch { setReady(false); }
    const lost=(event:Event)=>{event.preventDefault();cancelAnimationFrame(frame);setReady(false);};
    node.addEventListener("webglcontextlost",lost);
    return ()=>{
      disposed=true;cancelAnimationFrame(frame);node.removeEventListener("webglcontextlost",lost);
      if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);
      for(const shader of shaders)gl.deleteShader(shader);
    };
  },[]);
  return <span className={`spark silver-star spark-${state} ${ready?"silver-star-ready":""}`} role="img" aria-label={`Glint AI companion, ${state}`}>
    <span className="silver-star-fallback" aria-hidden="true">{children}</span>
    <canvas ref={canvas} aria-hidden="true" className="silver-star-canvas"/>
  </span>;
}
