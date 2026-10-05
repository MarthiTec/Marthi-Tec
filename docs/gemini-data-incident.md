# Tenant data incident — investigation

Local main updated from 5e93b47 to e34b799. No production migrations executed by this investigation.

Confirmed in incoming SQL:
- 0046 consolidates products solely by store/name, deletes sibling IDs and rewrites invoice/movement/sale references.
- 0047 deletes stores matching STR-PRT-% and their operational records.
- 0048 deletes every account/store outside a name/ID allowlist, including their linked data.
- 0049 deletes branches and replaces users.
- 0050 fabricates a Cell Ponto catalog with fixed stock, cost, price and commercial settings; deletes/recreates users.
- 0051 attempts store/account reassignment and uses nonexistent store_licenses.plan_name; it also omits required client_accounts.contact_name and conflicts on license ID instead of the unique store.

Containment: quarantine tenant-specific data mutations in pending migrations, retain variation/schema additions without product consolidation, add 0052 restoring strict ownership enforcement. Original SQL is preserved in Git history. These changes prevent future damage; they cannot resurrect deleted production rows.

Production inventory is unconfirmed: both configured connection files resolve to internal Discloud hosts inaccessible from this machine (ENOTFOUND). Need authorized Studio/DB access and a pre-incident backup. Compare account/store IDs and per-store counts for stock, attributes/values, users/memberships, brands, payments and licenses before any restore. Preserve an incident snapshot first. Recover actual rows from backup, not guessed products/prices/credentials. Do not rerun the original 0047–0051.

Additional confirmed runtime issues: first-access UI accepted guessed Cell Ponto access tokens and advanced after unsuccessful password writes; account lookup returned a fabricated demo account on missing rows. Removed both fallbacks. Generic product/attribute/security tests pass (24) and populated-tenant migration preservation test passes (1). Full build passed; all 102 regression tests passed on isolated databases. Production restoration remains pending actual database access/backup.
