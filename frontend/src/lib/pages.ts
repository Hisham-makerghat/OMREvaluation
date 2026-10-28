// Turns the files a teacher picks into one small grey JPEG per scanned page, in the browser.
// The server only ever looks at a 666 x 820 copy of each page, so 700 px wide loses nothing
// and cuts a typical upload from about 800 KB to about 140 KB per sheet.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf';

(pdfjs as any).GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

export const TARGET_WIDTH = 700;
export const JPEG_QUALITY = 0.7;

export interface PageImage { blob: Blob; sourceName: string; pageNo: number; }

const canvasToJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('could not encode image'))), 'image/jpeg', JPEG_QUALITY));

function greyCanvas(width: number, height: number) {
  const scale = Math.min(1, TARGET_WIDTH / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  return { canvas, scale };
}

async function* pdfPages(file: File): AsyncGenerator<PageImage> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await (pdfjs as any).getDocument({ data }).promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const { canvas, scale } = greyCanvas(base.width, base.height);
      const viewport = page.getViewport({ scale });
      const ctx = canvas.getContext('2d')!;
      ctx.filter = 'grayscale(1)';
      await page.render({ canvasContext: ctx, viewport }).promise;
      yield { blob: await canvasToJpeg(canvas), sourceName: file.name, pageNo: i };
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
}

async function imagePage(file: File): Promise<PageImage> {
  const bitmap = await createImageBitmap(file);
  const { canvas, scale } = greyCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'grayscale(1)';
  ctx.drawImage(bitmap, 0, 0, bitmap.width * scale, bitmap.height * scale);
  bitmap.close();
  return { blob: await canvasToJpeg(canvas), sourceName: file.name, pageNo: 1 };
}

export const isSupported = (f: File) => /\.(pdf|jpe?g|png)$/i.test(f.name);

/** Yields every page of every supported file, in order. */
export async function* pagesOf(files: File[]): AsyncGenerator<PageImage> {
  for (const f of files) {
    if (/\.pdf$/i.test(f.name)) yield* pdfPages(f);
    else if (isSupported(f)) yield await imagePage(f);
  }
}

/** Page count without rendering, so the progress bar has a total. */
export async function countPages(files: File[]): Promise<number> {
  let n = 0;
  for (const f of files) {
    if (/\.pdf$/i.test(f.name)) {
      const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      n += doc.numPages;
      await doc.destroy();
    } else if (isSupported(f)) n += 1;
  }
  return n;
}
