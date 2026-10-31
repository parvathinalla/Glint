/** Bounded SSE JSON reader, shared by the Meta transport and browser client. */
export async function readEvents(
  response: Response,
  accept: (value: unknown) => void,
) {
  if (!response.body) throw Error("The response stream did not open.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      // Sized for neural-voice audio: 24 kHz mono base64 runs ~64 KB/s,
      // so a long reply legitimately spans megabytes.
      if (size > 20000000)
        throw Error("The response stream exceeded its size limit.");
      buffer += decoder.decode(value, { stream: true });
      let boundary: RegExpMatchArray | null;
      while ((boundary = buffer.match(/\r?\n\r?\n/))) {
        const index = boundary.index!;
        const event = buffer.slice(0, index);
        buffer = buffer.slice(index + boundary[0].length);
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data && data !== "[DONE]") accept(JSON.parse(data));
      }
      if (buffer.length > 4000000)
        throw Error("A response event exceeded its size limit.");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
