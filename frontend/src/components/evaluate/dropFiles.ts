// The files in a drag-and-drop on the Scans card, including whole folders: the browser hands a
// dropped folder over as an "entry" that has to be walked to find the files inside.

const readPart = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));

const fileOf = (entry: FileSystemFileEntry) =>
  new Promise<File>((resolve, reject) => entry.file(resolve, reject));

async function collect(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    try {
      out.push(await fileOf(entry as FileSystemFileEntry));
    } catch {
      // a file the browser would not hand over: leave it out and keep the rest
    }
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // A folder's contents come a part at a time (at most 100 entries); an empty part means the end.
  let part = await readPart(reader);
  while (part.length > 0) {
    for (const child of part) await collect(child, out);
    part = await readPart(reader);
  }
}

/** Call it straight from the drop event. Everything is read before the first await, because the
 *  browser empties the drop's data as soon as the event is over. */
export async function filesFromDrop(data: DataTransfer): Promise<File[]> {
  const plain = Array.from(data.files);
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(data.items || [])) {
    const entry = item.kind === 'file' && typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
  }
  if (!entries.some(e => e.isDirectory)) return plain;
  const out: File[] = [];
  for (const entry of entries) await collect(entry, out);
  return out;
}
