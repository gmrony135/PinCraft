# Archived pre-Firebase implementation

These SQL migrations and the `559591c` verification report describe the former PostgreSQL/custom-Google-session/Vercel-scheduler release only. They are preserved for history, **not used by the active application** and not Firebase verification.

The SQL migration runner and `pg` dependency were removed. Do not run these files to configure Firebase. Current setup, ownership, deployment/billing gates and tests are documented in [../full-auto-mode.md](../full-auto-mode.md); fresh results are [../automation-verification.json](../automation-verification.json).

No automatic legacy identity/token import is implemented. A future import of any real legacy content would need a backup, explicitly verified UID ownership and fresh provider consent; it must not silently reactivate old schedules or manually supplied publishing credentials.
