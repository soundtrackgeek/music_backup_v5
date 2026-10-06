import packageMetadata from "../../package.json";

export type RenderFailure = {
  occurredAt: string;
  version: string;
  workspace: string;
  message: string;
  stack: string;
  componentStack: string;
};

const failures: RenderFailure[] = [];
const maxFailures = 20;

/** Bounded session evidence, ready for a future combined diagnostics export. */
export function recordRenderFailure(
  workspace: string,
  error: Error,
  componentStack: string,
): RenderFailure {
  const failure = {
    occurredAt: new Date().toISOString(),
    version: packageMetadata.version,
    workspace,
    message: error.message.slice(0, 4096),
    stack: (error.stack ?? "").slice(0, 16384),
    componentStack: componentStack.slice(0, 16384),
  };
  failures.push(failure);
  if (failures.length > maxFailures)
    failures.splice(0, failures.length - maxFailures);
  return failure;
}

export function getRenderFailures(): RenderFailure[] {
  return failures.map((failure) => ({ ...failure }));
}

export function formatRenderFailure(failure: RenderFailure): string {
  return [
    `Music Library ${failure.version} — ${failure.workspace}`,
    failure.occurredAt,
    failure.stack || failure.message,
    failure.componentStack,
  ]
    .filter(Boolean)
    .join("\n\n");
}
