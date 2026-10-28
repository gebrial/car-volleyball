// A web release from the training repo: release.json, and the model split
// into parts small enough for Cloudflare Pages.

export interface Release {
  milestone: string;
  cumulative_timesteps: number;
  policy_onnx_sha256: string;
  policy_onnx_parts: string[];
  physics: { gravity: number; boost_consumption: number };
  observation: { builder: string; size: number };
  actions: { repeat_ticks: number; fields: string[]; table: number[][]; sampling_min_prob: number };
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Joins the model's parts, refusing a model that isn't the one release.json names. */
export async function loadModel(release: Release, readPart: (name: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  const parts = await Promise.all(release.policy_onnx_parts.map(readPart));
  const model = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    model.set(part, offset);
    offset += part.length;
  }
  const sha = await sha256Hex(model);
  if (sha !== release.policy_onnx_sha256) {
    throw new Error(`${release.milestone}'s model parts hash to ${sha}, not ${release.policy_onnx_sha256}.`);
  }
  return model;
}
