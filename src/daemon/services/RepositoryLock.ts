import { Context, Effect, Layer, Schema } from "effect";
import { CommandExecutor } from "../../services/CommandExecutor.js";
import type { DaemonConfig } from "../schema.js";

/** Lock ownership established by atomic custom-ref creation. */
export interface IssueLease {
  /** Issue number protected by this lease. */
  readonly issueNumber: number;
  /** Exact custom ref created for the lease. */
  readonly ref: string;
  /** OID required for ownership checks and lease-safe deletion. */
  readonly oid: string;
  /** Acquisition nonce used to reconcile ambiguous pushes. */
  readonly nonce: string;
}

/** Failure returned by the repository lock boundary. */
export class RepositoryLockError extends Schema.TaggedErrorClass<RepositoryLockError>()(
  "RepositoryLockError",
  { operation: Schema.String, message: Schema.String },
) {}

/** Atomic custom-ref operations required by the daemon coordinator. */
export interface RepositoryLockService {
  /** Atomically create an issue lock ref, returning null when already claimed. */
  readonly acquire: (
    issueNumber: number,
  ) => Effect.Effect<IssueLease | null, RepositoryLockError>;
  /** Confirm that the exact acquired OID still owns the lock ref. */
  readonly owns: (
    lease: IssueLease,
  ) => Effect.Effect<boolean, RepositoryLockError>;
  /** Delete the lock ref only with the acquired OID as the expected lease. */
  readonly release: (
    lease: IssueLease,
  ) => Effect.Effect<void, RepositoryLockError>;
}

/** Effect service for {@link RepositoryLockService}. */
export class RepositoryLock extends Context.Service<
  RepositoryLock,
  RepositoryLockService
>()("RepositoryLock") {
  /** Build a custom-ref lock layer backed by the configured repository. */
  static layer(config: DaemonConfig) {
    return Layer.effect(
      RepositoryLock,
      Effect.gen(function* () {
        const executor = yield* CommandExecutor;
        const runGit = (operation: string, args: readonly string[]) =>
          executor
            .run("git", args, { cwd: config.repositoryPath })
            .pipe(
              Effect.mapError(
                (error) =>
                  new RepositoryLockError({ operation, message: error.stderr }),
              ),
            );
        const remoteOid = Effect.fn("RepositoryLock.remoteOid")(function* (
          ref: string,
        ) {
          const output = yield* runGit("read", ["ls-remote", "origin", ref]);
          return output.trim().split(/\s+/)[0] || null;
        });

        return RepositoryLock.of({
          acquire: (issueNumber) =>
            Effect.gen(function* () {
              const ref = `refs/daemon-locks/issues/${issueNumber}`;
              const nonce = crypto.randomUUID();
              const tree = (yield* runGit("tree", [
                "rev-parse",
                "HEAD^{tree}",
              ])).trim();
              const oid = (yield* runGit("commit", [
                "commit-tree",
                tree,
                "-p",
                "HEAD",
                "-m",
                `notes daemon lock ${config.workerId} ${nonce}`,
              ])).trim();
              const pushArgs = [
                "push",
                `--force-with-lease=${ref}:`,
                "origin",
                `${oid}:${ref}`,
              ];
              const pushed = yield* executor.exitCode("git", pushArgs, {
                cwd: config.repositoryPath,
              });
              if (pushed !== 0) {
                const actual = yield* remoteOid(ref);
                if (actual === oid) return { issueNumber, ref, oid, nonce };
                if (actual !== null) return null;
                return yield* new RepositoryLockError({
                  operation: "acquire",
                  message: "Lock push failed without creating a competing ref",
                });
              }
              return { issueNumber, ref, oid, nonce } satisfies IssueLease;
            }),
          owns: (lease) =>
            remoteOid(lease.ref).pipe(Effect.map((oid) => oid === lease.oid)),
          release: (lease) =>
            runGit("release", [
              "push",
              `--force-with-lease=${lease.ref}:${lease.oid}`,
              "origin",
              `:${lease.ref}`,
            ]).pipe(Effect.asVoid),
        });
      }),
    );
  }
}
