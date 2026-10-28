import * as ort from "onnxruntime-web";

export interface Policy {
  readonly nInputs: number;
  /** Action probabilities, one row of the action table's length per observation. */
  probs(obs: Float32Array[]): Promise<Float32Array[]>;
}

export async function createPolicy(model: Uint8Array, nInputs: number): Promise<Policy> {
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  return {
    nInputs,
    async probs(obs) {
      const batch = new Float32Array(obs.length * nInputs);
      obs.forEach((row, i) => {
        if (row.length !== nInputs) throw new Error(`The policy takes ${nInputs} inputs, not ${row.length}.`);
        batch.set(row, i * nInputs);
      });
      const out = await session.run({ obs: new ort.Tensor("float32", batch, [obs.length, nInputs]) });
      const probs = out.probs!.data as Float32Array;
      const nActions = probs.length / obs.length;
      return obs.map((_, i) => probs.subarray(i * nActions, (i + 1) * nActions));
    },
  };
}
