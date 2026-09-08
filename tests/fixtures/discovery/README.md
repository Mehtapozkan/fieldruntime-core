# Historical Discovery fixture

`scoped-v1-export.json` was captured through the actual PostgreSQL/runtime/API at
PR #32 head `964bb7224987d9d50ea4a565f4122ddc93e7d820`, before the evidence-scoping
repair. The synthetic input is case A from `scopedDeliveries`: one North dispute
references DEL-4 and DEL-5 with opposing supplied/not-supplied notes about different
deliveries. An explicit intake commit, descriptive answer and confirmation were
recorded before read-only export. All bytes are synthetic.

Recorded runtime: Node **24.19.0**, ICU **78.3**, timezone data **2026b**. The intake
bundle binds `iana-offset.v1:2026b`; use that compatible runtime for this archive.
CI pins Node 24.19.0. Newer timezone data is not silently substituted during replay.

Original canonical export hash:
`sha256:8ac985fd5c5bb8af71d1a45ac45e676e947433b87339cf38688d9925eb80d9c5`.

Keep this fixture unchanged. Its incorrect v1 conflict is retained historical
consent material, not a valid current conclusion. Tests reconstruct it under v1,
restore it only into disposable PostgreSQL, retry its original commands, and
require fresh v2 review without transferring its confirmation. No migration,
live import endpoint, real-data processing or independent verification is implied.
