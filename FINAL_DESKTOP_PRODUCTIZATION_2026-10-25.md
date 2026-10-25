# State 1.0.0 final Desktop productization QA

Official DSH Desktop 0.2.1-rc.3. Codex independently ran `npm test`: 108 pass, 1 skip, 0 fail; `npm run check` and `npm run verify:package` passed. The skipped case needs the official Schemastery runtime; the Creator separately reported 109/109 with that dependency. Final tarball `amadeus-state-1.0.0.tgz` SHA-256: `341ec37a611cd59afead38a3cf0467024abe59f9a1057e140970aa92df461947` (59 files).

Official Plugin Manager installed this tarball in a new isolated Home/Profile. Real Settings opened the State page and Host reported `ready`. GUI created a SQLite backup and then performed a confirmed restore; Host remained `ready`, SQLite `quick_check=ok`, and a pre-restore safety backup existed. GUI changed sensitivity 1.0→1.25; the Host applied it and retained it after a hard Desktop restart. Disabling State removed its Host route (404), re-enabling restored it (200), uninstall removed it (404), and reinstalling the same final tarball retained the configuration.

For management QA, Codex created a synthetic DSH Session without a model turn, seeded one synthetic State event into the isolated database while the plugin was disabled, then re-enabled the final package. The real GUI showed the resulting private scope, edited the synthetic interest baseline to 74, and displayed its audit event. No production or user memory database was used.

Remaining limits: this fresh profile had no model provider login, so a real model tool call and dynamic context turn were not claimed. Old-version rollback and joint Life/Memory behavior require separate acceptance. Public release/license and production migration remain owner decisions.
