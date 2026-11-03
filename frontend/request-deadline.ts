/** Bounds even an operation that ignores abort; late results never reach callers. */
export async function withRequestDeadline<T>(operation:(signal:AbortSignal)=>Promise<T>,ms:number,parent?:AbortSignal):Promise<T>{
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let abort!:()=>void;
  const canceled=new Promise<never>((_resolve,reject)=>{
    abort=()=>{const reason=parent?.reason??new DOMException("Request canceled","AbortError");controller.abort(reason);reject(reason);};
    timer=setTimeout(()=>{const reason=new DOMException("Server confirmation timed out","TimeoutError");controller.abort(reason);reject(reason);},ms);
    parent?.addEventListener("abort",abort,{once:true});
    if(parent?.aborted)abort();
  });
  try{return await Promise.race([Promise.resolve().then(()=>{controller.signal.throwIfAborted();return operation(controller.signal);}),canceled]);}
  finally{clearTimeout(timer);parent?.removeEventListener("abort",abort);}
}
