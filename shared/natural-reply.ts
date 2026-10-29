const phrase = "in the image you shared:";
export function naturalReply(text: string) {
  return text.replace(/^(?:\s*in the image you shared:\s*)+/i, "").trimStart();
}
/** Remove only the obsolete repeated lead, even when split across stream chunks. */
export class NaturalReplyStream {
  private lead = "";
  private started = false;
  push(text: string) {
    if (this.started) return text;
    this.lead += text;
    while (this.lead.trimStart().toLowerCase().startsWith(phrase))
      this.lead = this.lead.trimStart().slice(phrase.length).trimStart();
    if (phrase.startsWith(this.lead.trimStart().toLowerCase())) return "";
    this.started = true;
    const output = this.lead.trimStart();
    this.lead = "";
    return output;
  }
  finish() {
    const output = naturalReply(this.lead);
    this.lead = "";
    return output;
  }
}
