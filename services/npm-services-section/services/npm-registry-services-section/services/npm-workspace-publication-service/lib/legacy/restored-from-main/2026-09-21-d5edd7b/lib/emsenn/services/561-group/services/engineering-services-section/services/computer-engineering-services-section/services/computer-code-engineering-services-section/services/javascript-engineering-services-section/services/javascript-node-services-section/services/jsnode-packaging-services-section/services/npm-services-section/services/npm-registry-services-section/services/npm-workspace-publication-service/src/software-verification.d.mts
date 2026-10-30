export interface VerificationPackage {
  readonly name: string | null;
  readonly version: string | null;
  readonly path: string;
  readonly dir: string;
  readonly lifecycle: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
  readonly dependencyError?: string;
}
export interface VerificationJob { package: string; path: string; dir: string; script: string }
export type CommandResult = { status: "passed" | "failed" | "timed-out" | "failed-to-start"; code?: number | null; signal?: string | null; error?: string; stdout?: string; stderr?: string; durationMs?: number };
export type VerificationResult = VerificationJob & (CommandResult | { status: "blocked"; blockedBy: readonly string[] });
export interface VerificationPlan {
  readonly packages: readonly (VerificationPackage & { name: string })[];
  readonly tiers: readonly (readonly string[])[];
  readonly cyclic: readonly string[];
  readonly dependencies: Readonly<Record<string, readonly string[]>>;
  readonly lifecycleJobs: number;
}
export function planSoftwareVerification(census: readonly VerificationPackage[], options?: { packages?: readonly string[]; includeDependencies?: boolean }): VerificationPlan;
export function executeSoftwareVerification(plan: VerificationPlan, options: { concurrency?: number; run: (job: VerificationJob) => Promise<CommandResult> }): Promise<{ readonly results: readonly VerificationResult[]; readonly packageStates: Readonly<Record<string, "passed" | "failed" | "blocked">>; readonly ok: boolean }>;
