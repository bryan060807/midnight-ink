# Claiming an existing local demo workspace

Authentication rollout does not delete, rename, or automatically assign `local-demo`. An authenticated identity first receives its own empty workspace. Knowing an email address, signing in remotely, or being the first account is never authorization to claim demo data.

## Before any claim

1. Stop Midnight Ink so its SQLite and photo state are stable. Make a recoverable copy of the entire configured data directory, including the database, any WAL/SHM sidecars, and `photos/`. If `DATABASE_PATH` is outside that directory, back up that exact database and its sidecars too. Restrict backup access and verify that both database and photo files are present.
2. Record the intended claimant's verified issuer and immutable subject. Confirm that their personal workspace is empty. Existing personal equipment, progress, sessions, photos, designs, goals, assessments, or coaching history must not be silently merged or overwritten.
3. Generate a high-entropy one-time authorization token through an operator-controlled secure process. Configure only its SHA-256 hexadecimal digest as server-side `DEMO_IMPORT_TOKEN_HASH`. Deliver the raw token to the intended claimant through an approved private channel, never chat/logs, a URL, Git, or browser storage. The application cannot invent or retrieve this authorization token.
4. Restart with the configured digest and use the normal verified login flow. Development demo access is not a valid claimant identity.

The token should contain at least 32 random bytes. Treat the digest as sensitive configuration as well; it is an authorization verifier, not a public onboarding hint. Remove the raw token from operator scratch files and clear the setting after use. No example in this repository contains a real token.

## Explicit authenticated claim

Settings exposes the import only when the server has enabled its authorization verifier. The claimant must deliberately enter the separate authorization token and confirm `IMPORT DEMO DATA`. The application posts to `/api/auth/import-demo`; identity comes from their verified server-side session, never a client-supplied `profileId` or email.

The server verifies the authorization in constant time, requires an empty authenticated target workspace, and performs the transfer transactionally. Record IDs and relationships are retained while owner columns move from `local-demo` to the claimant. Photo filenames remain unchanged in the shared private photo directory, so ownership changes do not require risky filesystem renames. Photo/session ownership checks immediately follow the new owner.

A unique receipt for the demo source prevents a later claim by the same or another account. Repeated attempts are rejected rather than duplicating or reassigning records. Do not remove the permanent receipt or replace the authorization token to bypass the one-time restriction. The receipt retains record counts and pre-import/source preferences for operator recovery; it persists after ordinary workspace-record deletion. Source profile/settings rows are retained; profile/settings preferences may be copied to the target as part of the deliberate transfer. Bundled curriculum and the seed marker remain global, and deleted sample equipment is not recreated.

The receipt also identifies the source and target profiles and retains recovery snapshots of their preferences; it contains no authorization token or photo bytes. Treat it as retained personal data. A future full account-erasure process must deliberately handle this retention while preserving a non-reclaim marker so erasure cannot reopen the demo claim.

No remote login grants access to unclaimed demo records. If the verifier is absent, the token is wrong, a prior receipt exists, the source/target is unsuitable, or the operation fails, leave the source unclaimed and investigate from the backup instead of improvising a merge.

## Verification and recovery

After success, verify the expected record counts, representative session/photo/design reads, and the receipt while authenticated as the intended subject. Confirm that another identity cannot read those resource IDs. Keep the backup until the claimant confirms the result; then apply the operator's retention policy.

A failed database transaction rolls back its owner changes. There is no live undo button: after a successful claim, recovery is an offline operator operation. Stop the app, preserve a copy of the current failed/unwanted state, restore the verified pre-claim database and photo backup together, then restart and validate ownership. Restoring a backup also restores its old sessions/receipts, so revoke sessions and rotate the application session secret as appropriate before exposing a recovered installation. Do not restore one account's old state into an active multi-user instance without a separate reviewed recovery plan; it could discard newer user work.

If a safe online claim cannot be demonstrated in the intended installation, keep demo data intact and use an offline operator-assisted review/migration instead. Do not update arbitrary owner IDs directly in a running production database.
