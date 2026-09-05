import { readFile } from "node:fs/promises";

export interface WorkbenchAsset {
  readonly body: Buffer;
  readonly contentType: string;
}

export interface WorkbenchAssets {
  readonly css: WorkbenchAsset;
  readonly html: WorkbenchAsset;
  readonly javascript: WorkbenchAsset;
  readonly authorityClient?: WorkbenchAsset;
  readonly authorityWorkbench?: WorkbenchAsset;
}

function asset(body: Buffer, contentType: string): WorkbenchAsset {
  return Object.freeze({ body, contentType });
}

/**
 * Load the fixed workbench files copied beside the built API. The filenames are
 * deliberately fixed: request paths never become filesystem paths.
 */
export async function loadWorkbenchAssets(): Promise<WorkbenchAssets> {
  const [html, css, javascript, authorityClient, authorityWorkbench] =
    await Promise.all([
      readFile(new URL("../../admin/public/index.html", import.meta.url)),
      readFile(new URL("../../admin/public/workbench.css", import.meta.url)),
      readFile(new URL("../../admin/public/workbench.js", import.meta.url)),
      readFile(
        new URL("../../admin/public/authority-client.js", import.meta.url),
      ),
      readFile(
        new URL("../../admin/public/authority-workbench.js", import.meta.url),
      ),
    ]);

  return Object.freeze({
    html: asset(html, "text/html; charset=utf-8"),
    css: asset(css, "text/css; charset=utf-8"),
    javascript: asset(javascript, "text/javascript; charset=utf-8"),
    authorityClient: asset(authorityClient, "text/javascript; charset=utf-8"),
    authorityWorkbench: asset(
      authorityWorkbench,
      "text/javascript; charset=utf-8",
    ),
  });
}

function requestPath(requestTarget: string): string | undefined {
  if (!requestTarget.startsWith("/") || requestTarget.startsWith("//")) {
    return undefined;
  }
  const queryStart = requestTarget.indexOf("?");
  const path =
    queryStart === -1 ? requestTarget : requestTarget.slice(0, queryStart);
  return path.includes("#") ? undefined : path;
}

/** Resolve only the public routes; encoded or filesystem-like variants fail. */
export function getWorkbenchAsset(
  requestTarget: string,
  assets: WorkbenchAssets,
): WorkbenchAsset | undefined {
  switch (requestPath(requestTarget)) {
    case "/":
      return assets.html;
    case "/workbench.css":
      return assets.css;
    case "/workbench.js":
      return assets.javascript;
    case "/authority-client.js":
      return assets.authorityClient;
    case "/authority-workbench.js":
      return assets.authorityWorkbench;
    default:
      return undefined;
  }
}
