import type { Request, Response } from "express";

export interface ParsedRange {
  start: number;
  end: number;
}

/**
 * Parse a single-range `Range: bytes=start-end` header against `totalSize`.
 * Returns `null` if the header is missing/empty (full-content response expected),
 * or `"invalid"` if the header is malformed or unsatisfiable (caller should
 * respond with 416).
 */
export function parseRangeHeader(
  header: string | undefined,
  totalSize: number,
): ParsedRange | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return "invalid";
  const startRaw = m[1];
  const endRaw = m[2];

  let start: number;
  let end: number;
  if (startRaw === "" && endRaw !== "") {
    // suffix range: last N bytes
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else if (startRaw !== "") {
    start = Number(startRaw);
    end = endRaw === "" ? totalSize - 1 : Number(endRaw);
  } else {
    return "invalid";
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (start < 0 || end < start || start >= totalSize) return "invalid";
  if (end >= totalSize) end = totalSize - 1;
  return { start, end };
}

export interface RangedResponseOptions {
  totalSize: number;
  mimeType: string | null;
  fileName?: string | null;
  forceDownload?: boolean;
  /** Yield byte chunks for the requested range. */
  stream: (offset: number, length: number) => AsyncIterable<Buffer>;
}

/**
 * Send a streamed response with HTTP Range support. Honors `Range` header,
 * advertises `Accept-Ranges`, and applies backpressure on `res.write`.
 */
export async function streamRangedResponse(
  req: Request,
  res: Response,
  opts: RangedResponseOptions,
): Promise<void> {
  const { totalSize, mimeType, fileName, forceDownload, stream } = opts;

  const range = parseRangeHeader(req.headers.range, totalSize);
  if (range === "invalid") {
    res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
    return;
  }

  const { start, end } = range ?? { start: 0, end: totalSize - 1 };
  const length = end - start + 1;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", String(length));
  if (mimeType) res.setHeader("Content-Type", mimeType);
  if (forceDownload && fileName) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
  }

  if (range) {
    res.status(206).setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
  } else {
    res.status(200);
  }

  let aborted = false;
  const onClose = () => {
    aborted = true;
  };
  req.on("close", onClose);

  try {
    for await (const chunk of stream(start, length)) {
      if (aborted) return;
      const ok = res.write(chunk);
      if (!ok) {
        await new Promise<void>((resolve) => res.once("drain", () => resolve()));
      }
    }
    if (!aborted) res.end();
  } finally {
    req.off("close", onClose);
  }
}
