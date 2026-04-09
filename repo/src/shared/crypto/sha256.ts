export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  let buf: ArrayBuffer;
  if (typeof data === 'string') buf = new TextEncoder().encode(data).buffer as ArrayBuffer;
  else if (data instanceof Uint8Array) buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  else buf = data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}
