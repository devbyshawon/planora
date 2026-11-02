export async function api(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Planora-Client": "web",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Cannot reach the API. Check that the backend is running.");
  }
  if (response.status === 204) return null;
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
  return data;
}

export async function downloadExport(body, signal) {
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
    throw new Error("Cannot reach the API. Check that the backend is running.");
  }
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
