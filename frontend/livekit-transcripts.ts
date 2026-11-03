export type LiveKitLine={id:string;who:string;text:string;final:boolean;revision:number};
/** A segment can arrive through several interim streams; stream IDs are not turn IDs. */
export function updateLiveKitTranscript(lines:LiveKitLine[],line:LiveKitLine):LiveKitLine[]{
  if(!line.text.trim())return lines;
  const index=lines.findIndex(item=>item.id===line.id),previous=lines[index];
  if(previous&&(previous.final&&!line.final||previous.revision>line.revision))return lines;
  if(index<0)return [...lines,line].slice(-60);
  const updated=[...lines];updated[index]=line;return updated;
}
