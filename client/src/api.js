import { localRequest, rememberResponse } from "./offline/integrated.js";
import { readOffline } from "./offline/storage.js";
export async function api(path, { method = "GET", body, signal } = {}) {
  const options = { method, body, signal };
  const local = await localRequest(path, options);
  if (local.handled) return local.data;
  let response;
  const timeout = method === "GET" ? AbortSignal.timeout(12000) : undefined;
  const requestSignal = signal && timeout && AbortSignal.any ? AbortSignal.any([signal,timeout]) : signal || timeout;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal: requestSignal,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Planora-Client": "web",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const fallback = await localRequest(path, options, true);
    if (fallback.handled) return fallback.data;
    throw new Error("Cannot reach the API. Check that the backend is running.");
  }
  if (response.status >= 500) {
    const fallback = await localRequest(path, options, true);
    if (fallback.handled) return fallback.data;
  }
  if (response.status === 204) { await rememberResponse(path, options, null).catch(() => {}); return null; }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      data?.error?.message || "The request could not be completed.",
    );
    Object.assign(error, {
      status: response.status,
      code: data?.error?.code,
      details: data?.error?.details,
    });
    throw error;
  }
  await rememberResponse(path, options, data).catch(error => {
    window.dispatchEvent(new CustomEvent("planora-sync", { detail: { message: error.message, error: true } }));
  });
  return data;
}

export async function downloadExport(body, signal) {
  const state = await readOffline().catch(() => null);
  async function localDownload() {
    const { offlineExport } = await import("./offline/exports.js");
    const result = await offlineExport(body);
    const url = URL.createObjectURL(result.blob), link = document.createElement("a");
    link.href = url; link.download = result.filename; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url),30000);
    return { filename: result.filename, count: result.count, warnings: result.warnings };
  }
  if (state && (!navigator.onLine || state.queue.length)) return localDownload();
  let response;
  try {
    response = await fetch("/api/exports/download", {
      method: "POST",
      credentials: "same-origin",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Planora-Client": "web",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    if (state) return localDownload();
    throw new Error("Cannot reach the API. Check that the backend is running.");
  }
  if (state && response.status >= 500) return localDownload();
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.error?.message || "The download could not be created.",
    );
  }
  const blob = await response.blob();
  const filename =
    response.headers
      .get("Content-Disposition")
      ?.match(/filename="([^"]+)"/)?.[1] || `Planora.${body.format}`;
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  return {
    filename,
    count: Number(response.headers.get("X-Planora-Task-Count")),
    warnings: Number(response.headers.get("X-Planora-Warning-Count")),
  };
}
