# Midnight Ink PM2 lifecycle recovery, 2026-11-10

R2 application commit `c7d8bc3be5193371441870afa05e12319f799549` is deployed.
The operator-only changes in this follow-up do not alter its running code.

## Verified incident

The initial direct restart reached online, then PM2's record became PID 0 / waiting
restart while R2 PID 16804 still owned port 3031. Subsequent startup attempts logged
the fixed port-in-use error. The first rollback request changed the configured cwd
but encountered the same occupied port. Health 200 from the untracked listener did
not establish managed-process stability.

App 30's pending restart was stopped, the listener's exact approved server path,
Node executable, parent and port ownership were checked, and only PID 16804 was
terminated. The original build was restored with a separate stop/wait/start.
After proving that recovery stable, the same already-approved R2 artifact was
switched with the quiesced sequence. PID 20776 then matched app 30 and its listener,
with no further restart count increase. No unrelated app or daemon was stopped.
The precise internal PM2 event ordering that lost process ownership is not proven;
the port conflict, untracked process and effective recovery are verified.

Two PM2 daemon processes predated this attempt: 3552 and 9516. Read-only Windows
`GetNamedPipeServerProcessId` checks identified 3552 as the RPC pipe server.
Its managed processes had parent 3552. The PID file pointed at 9516, which had no
children. Do not infer the RPC owner from that file or terminate either daemon to
repair one application. These are dated observations, not permanent PID constants.

## Guarded procedure

The operator helper now checks the actual existing named-pipe owner and requires
`expectedRpcDaemonPid` for mutations. It fails if ownership differs from the
reviewed manifest. It does not start a daemon or reconcile the two existing ones.

The existing-socket client validates one uniquely named app 30, the expected cwd,
entrypoint and protected environment. It then:

1. Builds and validates the destination packet before stopping anything.
2. Calls `stopProcessId` only for id 30, cancelling its pending restart.
3. Requires PID 0, stopped/waiting status, unchanged source cwd, old OS process
   gone, and the configured listener free.
4. Waits beyond the configured restart delay and repeats the same checks.
5. Sends one `restartProcessId` for the reviewed destination, then verifies its
   online cwd and that the managed PID owns the listener.

Unknown listener state, an old or new process still running, changed cwd, failed
stop or changed daemon owner fails closed. There is no automatic retry and no
automatic orphan-process termination. Inspect exact process identity before any
manual app-scoped recovery. No daemon kill/delete/save, broad restart, credential,
database/DNS/TLS change or reboot-persistence mutation is part of this procedure.

Use Administrator PowerShell under the staging account. The active package is:
`C:\Users\bryan\aibry\releases\midnight-ink\20261109-combined-r2`.
Its deployed runtime remains `release`; its preserved original build remains
`rollback`. Source/operator controls are under the original project checkout.
Run `Invoke-MidnightInkRelease.ps1 -Action Validate` read-only before any separately
authorized action. Its approval flag remains required for Deploy/Rollback.

## Acceptance evidence and limits

The user reported the live OpenAI success notice after R2 stabilized. A read-only
aggregate of only server-owned coaching source markers found one OpenAI-source
record and zero offline-source records after that switch. No question, answer or
account record contents were returned. No additional paid request was sent by the
operator. Two-account live isolation and UI reopen/tab-return were not independently
reverified; disposable browser coverage is separate evidence.

The application suite had 243 passing tests (two existing Windows skips), eight
passing browser flows and a passing production build/smoke. The operator follow-up
adds tests for stop/quiet/start ordering and refusal to start over an occupied
listener, live old process, racing new process, changed cwd, failed stop, foreign
id or invalid destination. A mocked lifecycle test is not an isolated real-PM2
daemon test; no additional daemon was created for validation.
