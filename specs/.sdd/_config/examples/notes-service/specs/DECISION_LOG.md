# Decision Log

| # | Decision | Options Considered | Choice | Rationale | Reflected in |
|---|----------|-------------------|--------|-----------|--------------|
| DEC001 | Authentication | API key, JWT, none | none | Runs behind an authenticating gateway; single anonymous actor — user confirmed | SPEC §3 |
| DEC002 | Editing published notes | allow, forbid, new version | forbid (409 NOTE_NOT_EDITABLE) | Published text must stay citable — user confirmed | SPEC §5.2, V2, `errors.json`, NOTE-053 |
| DEC003 | Deleting published notes | forbid, archive state, hard delete | hard delete in any state | User wants a simple GDPR-friendly removal path | SPEC §5.2, §6, NOTE-070 |
| DEC004 | Empty patch `{}` | 422, no-op, mutation | successful mutation (version + 1) | Profile OCC-1 counts every successful mutation | SPEC §5.2, NOTE-059 |
| DEC005 | Default `body` | required, null, empty string | `""` | Shape stability (SER-7) without making body required — user confirmed | SPEC §4, NOTE-011 |
