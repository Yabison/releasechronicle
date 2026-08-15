export type EnvStepState = "done" | "current" | "upcoming";

/** For each env in `workflow` (in order), its state relative to `current`:
 *  before current = done, equal = current, after = upcoming. When `current`
 *  is not in `workflow`, every step is "upcoming". */
export function envStepStates(
  workflow: string[],
  current: string,
): { env: string; state: EnvStepState }[] {
  const idx = workflow.indexOf(current);
  return workflow.map((env, i) => ({
    env,
    state: idx === -1 ? "upcoming" : i < idx ? "done" : i === idx ? "current" : "upcoming",
  }));
}
