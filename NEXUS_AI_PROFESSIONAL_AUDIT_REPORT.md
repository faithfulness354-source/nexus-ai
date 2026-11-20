# Nexus AI — Engineering & Audit Report

> Generated: **2026-11-20 04:50 UTC**  
> Primary repository: `faithfulness354-source/nexus-ai` @ `/agent/repos/nexus-ai`  
> Environment: Cursor Cloud Agent (Linux) — Windows Documents path not available on this host

---

## 1. Executive Summary & Scope

This audit inventories Nexus AI engineering history visible from the Cloud Agent workspace: Git commits across all tracked branches, SQL/migration artifacts, and related project directories discovered on the machine.

### Scan Coverage

| Item | Result |
|---|---|
| Total unique commits (all branches) | **82** (80 in original Cloud Agent scan + 2 appended below) |
| Date range | **2026-10-11 23:12** → **2026-11-20 05:05** UTC (original scan ended 04:34; appendix extends) |
| Primary project directory | `/agent/repos/nexus-ai` |
| SQL / migration files found | **15** |
| Alternate folders `cursor_Nexus_AI_project`, `nexus_rollplay` | **Not found on this VM** |
| Windows Documents path | **Not mounted** (report also saved under Linux `~/Documents`) |

### Summary by Category

| Category | Count | Share |
|---|---:|---:|
| Feature | 39 | 49% |
| Integration & API / External Fault | 19 | 24% |
| Bug Fix | 10 | 12% |
| Database & Schema | 7 | 9% |
| UI / UX | 5 | 6% |
| **Total commits** | **80** | **100%** |

### Directories Scanned

- `/agent/repos/nexus-ai (primary Git checkout — faithfulness354-source/nexus-ai)`
- `/home/ubuntu/.cursor/projects/agent-repos-nexus-ai (Cursor project metadata)`

### Not Located on This Host

- cursor_Nexus_AI_project — not present on this Cloud Agent VM
- nexus_rollplay — not present on this Cloud Agent VM
- C:\Users\%USERNAME%\Documents — Windows filesystem not mounted (Linux Cloud Agent)

---

## 2. Master Timeline (Sorted by Date & Time)

Every tracked Git commit below is ordered **earliest → latest**. Timestamps are Git author dates (`YYYY-MM-DD HH:MM`).

### 1. Initial commit of Nexus AI

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-11 23:12` |
| **Commit** | `2957206` (`29572066a45b532d7ea7829a556ed618d1821886`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Initial commit of Nexus AI. Extends product capabilities for creators and chatters. |

### 2. Require Terms of Service acceptance before signed-in use

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 00:23` |
| **Commit** | `07375d3` (`07375d34eab5ad4b80e7cfab77fd5d301c0f1e0b`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `UI / UX` |
| **Summary** | Require Terms of Service acceptance before signed-in use. Improves presentation and interaction clarity on web/mobile surfaces. |

### 3. Keep the production build from connecting to Prisma or tracing local images

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 00:44` |
| **Commit** | `627570f` (`627570fb6b42d37e47754990950468d89ef59549`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Keep the production build from connecting to Prisma or tracing local images. Responds to platform, build, or third-party API/runtime constraints. |

### 4. Stop the Vercel build from tracing the scene route while collecting pages

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 01:11` |
| **Commit** | `6f9db10` (`6f9db10667185de6a0c0d7d19adf694fdda411a9`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Stop the Vercel build from tracing the scene route while collecting pages. Responds to platform, build, or third-party API/runtime constraints. |

### 5. Move the terms gate onto the Node.js proxy so the build stops parsing it as edge middleware

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 01:43` |
| **Commit** | `8d030af` (`8d030afe027b9ade3cc8c4710ac3792085be8891`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Move the terms gate onto the Node.js proxy so the build stops parsing it as edge middleware. Responds to platform, build, or third-party API/runtime constraints. |

### 6. Keep Prisma from opening during page collection and stop scene files from tracing the whole project

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 03:03` |
| **Commit** | `1956810` (`1956810637095c1664cf2d288ca1c36268b310c7`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Keep Prisma from opening during page collection and stop scene files from tracing the whole project. Responds to platform, build, or third-party API/runtime constraints. |

### 7. Stop file writes from tracing the whole project while Vercel collects pages

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 03:57` |
| **Commit** | `f6a9a72` (`f6a9a72ebb573d137bb2dd2d386ce8272dac7cfd`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Stop file writes from tracing the whole project while Vercel collects pages. Responds to platform, build, or third-party API/runtime constraints. |

### 8. Keep the sqlite fallback inside the build and send production security headers

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 04:20` |
| **Commit** | `c96a34f` (`c96a34fef9bc0eae453829ed5853aca5c43451a8`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Keep the sqlite fallback inside the build and send production security headers. Responds to platform, build, or third-party API/runtime constraints. |

### 9. Point production PayPal checkout at the live API and leave checkout unavailable when credentials are missing

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 04:36` |
| **Commit** | `5621b13` (`5621b13cc3e4e57b0d888eafaa56a8e260eeb889`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Bug Fix` |
| **Summary** | Point production PayPal checkout at the live API and leave checkout unavailable when credentials are missing. Restores correct runtime behavior and prevents user-facing failures. |

### 10. Harden production auth, health, and empty-catalog startup so Vercel can serve the app

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 05:24` |
| **Commit** | `88f712e` (`88f712ec227a5948097222c0b5ab32abdd2fdc48`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Harden production auth, health, and empty-catalog startup so Vercel can serve the app. Responds to platform, build, or third-party API/runtime constraints. |

### 11. Point the app database at Supabase Postgres

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 06:07` |
| **Commit** | `49c5668` (`49c56681eeeca057ddf28e9d51f7ba32bed8939a`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Database & Schema` |
| **Summary** | Point the app database at Supabase Postgres. Keeps Postgres/Supabase schema aligned with app reads and writes. |

### 12. Default custom model routing to the Groq OpenAI-compatible API

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 06:48` |
| **Commit** | `785f513` (`785f513a363d82afc33fa05eb69f332047252d2d`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Default custom model routing to the Groq OpenAI-compatible API. Extends product capabilities for creators and chatters. |

### 13. ﻿Move the NSFW switch into profile settings and hide adult cards until it is on

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 08:08` |
| **Commit** | `66cbf7e` (`66cbf7ead1fc0a061dfa2d4f7502b238f5b8c228`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | ﻿Move the NSFW switch into profile settings and hide adult cards until it is on. Extends product capabilities for creators and chatters. |

### 14. Gate adult cards on the profile setting and an active plan

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-12 08:22` |
| **Commit** | `74a0c67` (`74a0c671c18069352a168dbcc08aaaa129b0f313`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Gate adult cards on the profile setting and an active plan. Extends product capabilities for creators and chatters. |

### 15. Send checkout to the live PayPal API and store terms acceptance

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-13 14:36` |
| **Commit** | `a6959ba` (`a6959bad3430e89dae9a3e8a67acf36229505e98`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Send checkout to the live PayPal API and store terms acceptance. Extends product capabilities for creators and chatters. |

### 16. Create live PayPal orders and return checkout errors

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-13 15:29` |
| **Commit** | `6244c0a` (`6244c0a1df8c73ef6e6f736a845cf9158b43f097`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Bug Fix` |
| **Summary** | Create live PayPal orders and return checkout errors. Restores correct runtime behavior and prevents user-facing failures. |

### 17. Trigger build with live PayPal credentials

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-13 15:49` |
| **Commit** | `26302bb` (`26302bbe5efbe90e27cf6d7b638a532d7d33c48e`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Trigger build with live PayPal credentials. Responds to platform, build, or third-party API/runtime constraints. |

### 18. Include lib/paypal.ts live endpoint and credential trimming fixes

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-13 15:58` |
| **Commit** | `a7a25c2` (`a7a25c255091249b2760b3de0ac5ef85954b917c`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Bug Fix` |
| **Summary** | Include lib/paypal.ts live endpoint and credential trimming fixes. Restores correct runtime behavior and prevents user-facing failures. |

### 19. Fix PayPal live authentication pipeline and force dynamic execution

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-13 16:09` |
| **Commit** | `0107606` (`0107606a5742f8508e09b5ec32bd6bdf730c88e0`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Bug Fix` |
| **Summary** | Fix PayPal live authentication pipeline and force dynamic execution. Restores correct runtime behavior and prevents user-facing failures. |

### 20. Point the creator whitelist at the new account email

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-13 17:39` |
| **Commit** | `4d8ea4e` (`4d8ea4e0240447b39226815e733924de4bde40d1`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Point the creator whitelist at the new account email. Extends product capabilities for creators and chatters. |

### 21. Stop cloud updates from rebuilding the character gallery

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-13 17:49` |
| **Commit** | `0f3e9ad` (`0f3e9adde5050516eea4ffa3f8ff4354679fae7c`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Stop cloud updates from rebuilding the character gallery. Responds to platform, build, or third-party API/runtime constraints. |

### 22. Use the live PayPal credentials stored under the current Vercel names

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-13 18:13` |
| **Commit** | `e059668` (`e0596682908cd034bb39fc8385634e7e98931719`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Use the live PayPal credentials stored under the current Vercel names. Responds to platform, build, or third-party API/runtime constraints. |

### 23. Keep PayPal credential pairs intact and log sign-in failures

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-13 19:08` |
| **Commit** | `da2979b` (`da2979bee0ae628d47dc34b074554ea757ce7b36`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Keep PayPal credential pairs intact and log sign-in failures. Extends product capabilities for creators and chatters. |

### 24. Restore the owned card library beside Top 8 Picks

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 09:25` |
| **Commit** | `d4c58fd` (`d4c58fdf9fa0b570c65aee329874b7608c0d4e0d`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Restore the owned card library beside Top 8 Picks. Extends product capabilities for creators and chatters. |

### 25. Show every card a signed-in creator owns

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 09:48` |
| **Commit** | `6814120` (`6814120ca7a7740f41cf3030ee7e0fe868a6bb7c`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Show every card a signed-in creator owns. Extends product capabilities for creators and chatters. |

### 26. Give the phone its own profile layout and list every owned card

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 10:43` |
| **Commit** | `0b04748` (`0b047485b5d74d01aab2a45c268851e4e54fc0a0`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Give the phone its own profile layout and list every owned card. Extends product capabilities for creators and chatters. |

### 27. Point the phone at the live site and keep admin access intact

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 11:18` |
| **Commit** | `6d361bb` (`6d361bbad5badf9e2d64ee24654dabf46aeb3ac9`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Point the phone at the live site and keep admin access intact. Extends product capabilities for creators and chatters. |

### 28. Ship the remaining profile, upload, and splash work

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 12:45` |
| **Commit** | `9ce8518` (`9ce851848d774b2f14efeb0c60841420f7c78232`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Ship the remaining profile, upload, and splash work. Extends product capabilities for creators and chatters. |

### 29. Add a profile song file picker on the preview and the editor

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 13:19` |
| **Commit** | `ed1847b` (`ed1847b6900388b0ae6441b548d5055dea67f2ee`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `UI / UX` |
| **Summary** | Add a profile song file picker on the preview and the editor. Improves presentation and interaction clarity on web/mobile surfaces. |

### 30. Save a chosen profile song onto the profile

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 13:42` |
| **Commit** | `a8f258f` (`a8f258f89df222bc455ef18232910558fd534d93`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Save a chosen profile song onto the profile. Extends product capabilities for creators and chatters. |

### 31. Hide adult cards on a profile when the NSFW setting is off

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 13:45` |
| **Commit** | `04cabcb` (`04cabcb6ad62e4bfad63f3506bac1d7d416e3d2f`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Hide adult cards on a profile when the NSFW setting is off. Extends product capabilities for creators and chatters. |

### 32. Keep the chosen profile song attached after the file is picked

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 14:34` |
| **Commit** | `0abcaee` (`0abcaeef23db74433f0837fd9c7525c63bc19c4a`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Keep the chosen profile song attached after the file is picked. Extends product capabilities for creators and chatters. |

### 33. Save profile songs on the account table the live database actually uses

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 14:36` |
| **Commit** | `8ffb50f` (`8ffb50ff2b5c98db9ee6df44146024ed3c09b5c8`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Database & Schema` |
| **Summary** | Save profile songs on the account table the live database actually uses. Keeps Postgres/Supabase schema aligned with app reads and writes. |

### 34. Store profile songs in a public audio bucket instead of the image upload path

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 14:42` |
| **Commit** | `f6de87b` (`f6de87baad888fbd8369b241a9427d80a9e52e5b`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Store profile songs in a public audio bucket instead of the image upload path. Extends product capabilities for creators and chatters. |

### 35. Add a play button beside the profile song

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 14:48` |
| **Commit** | `9e1eb07` (`9e1eb07ec8c81fa3e96655bcee4d0ea2a05e959f`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Add a play button beside the profile song. Extends product capabilities for creators and chatters. |

### 36. Add character card pages plus comments on cards and profiles

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 15:06` |
| **Commit** | `61c8a61` (`61c8a6106b180a34654599184f8eb0bfdddac42a`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Add character card pages plus comments on cards and profiles. Extends product capabilities for creators and chatters. |

### 37. Send card audio as the file itself so the phone can save mp3 and flac

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 18:14` |
| **Commit** | `9b181ab` (`9b181abee965361938bdba79262e7f1abb3d6614`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Send card audio as the file itself so the phone can save mp3 and flac. Extends product capabilities for creators and chatters. |

### 38. Fix React hook lint errors and load config scripts as ES modules

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 22:21` |
| **Commit** | `a953fb2` (`a953fb24af5ae9693c391936d7c29c5c69caad7c`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Bug Fix` |
| **Summary** | Fix React hook lint errors and load config scripts as ES modules. Restores correct runtime behavior and prevents user-facing failures. |

### 39. Require a clean TypeScript check before the production build succeeds

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-14 23:58` |
| **Commit** | `4401284` (`440128450820f54ca7400f0cd43dbc3a1a6cc66b`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Require a clean TypeScript check before the production build succeeds. Responds to platform, build, or third-party API/runtime constraints. |

### 40. Sync mobile app WebView and Supabase endpoints to Vercel cloud production

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-16 10:25` |
| **Commit** | `b38cbc9` (`b38cbc940fbce116c0b9f8b9dd184a32b56bfcf0`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Fix: Sync mobile app WebView and Supabase endpoints to Vercel cloud production. Responds to platform, build, or third-party API/runtime constraints. |

### 41. Keep roleplay canon across turns with session stats and searchable long-term memories

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-16 17:35` |
| **Commit** | `bc058b7` (`bc058b71e30895cbddb4a9288c00404deca78623`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Keep roleplay canon across turns with session stats and searchable long-term memories. Extends product capabilities for creators and chatters. |

### 42. Skip adding Message.deleted when the column is already present

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-16 17:49` |
| **Commit** | `df05c16` (`df05c162a055bce843345f14916f61e9345c3265`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Database & Schema` |
| **Summary** | Skip adding Message.deleted when the column is already present. Keeps Postgres/Supabase schema aligned with app reads and writes. |

### 43. Keep chat dispatch alive when the public schema has no Message table

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-16 18:05` |
| **Commit** | `7de29fc` (`7de29fcf01d0503e259576eaca228cd6ba4fd314`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Database & Schema` |
| **Summary** | Keep chat dispatch alive when the public schema has no Message table. Keeps Postgres/Supabase schema aligned with app reads and writes. |

### 44. Stop chat dispatch from altering the schema and keep world updates off the reply stream

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-16 18:20` |
| **Commit** | `1f98fca` (`1f98fca7aa9d5a6cff0a920f1053b15291e054c6`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Database & Schema` |
| **Summary** | Stop chat dispatch from altering the schema and keep world updates off the reply stream. Keeps Postgres/Supabase schema aligned with app reads and writes. |

### 45. Send the full character card and chat history so replies keep their length

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-16 18:35` |
| **Commit** | `f07bc02` (`f07bc021a1f159df12d8a8b4f136d88941d89265`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Send the full character card and chat history so replies keep their length. Extends product capabilities for creators and chatters. |

### 46. Inject live world stats and memories into each chat prompt

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-16 18:45` |
| **Commit** | `a228317` (`a22831761f1e0d15cd6413b09111fe44f9e03dcc`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Inject live world stats and memories into each chat prompt. Extends product capabilities for creators and chatters. |

### 47. Route chat completions through NovelAI's text generation API

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-16 19:06` |
| **Commit** | `ecebb8d` (`ecebb8decc1ce994560e1a5c17f8e46ed7cfec7d`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Route chat completions through NovelAI's text generation API. Extends product capabilities for creators and chatters. |

### 48. Add lorebook world-info editor, JSON/PNG import, and activation assembly

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-19 19:30` |
| **Commit** | `ef0cea3` (`ef0cea37e9012ef34b0a506a2466870a0cbd2564`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Add lorebook world-info editor, JSON/PNG import, and activation assembly. Extends product capabilities for creators and chatters. |

### 49. Keep system prompts out of chat and sync card openings to Supabase

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-19 19:35` |
| **Commit** | `f9bca5f` (`f9bca5f73aae9190372cb1cee17982d992b0fa87`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Keep system prompts out of chat and sync card openings to Supabase. Extends product capabilities for creators and chatters. |

### 50. Serve chat models from the paid provider and keep soundtrack controls in chat

| Field | Value |
|---|---|
| **Timestamp** | `2026-10-19 20:47` |
| **Commit** | `c73ab46` (`c73ab464e045103dcb25c6db4b0cb71783fce2b6`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Serve chat models from the paid provider and keep soundtrack controls in chat. Extends product capabilities for creators and chatters. |

### 51. Add a local privacy assistant for Ollama and on-device image APIs

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-09 08:40` |
| **Commit** | `73013d6` (`73013d60b61d23dfc521e74a1fd2d6e8c8aced48`) |
| **Author** | faithfulness354-source |
| **Category Tag** | `Feature` |
| **Summary** | Add a local privacy assistant for Ollama and on-device image APIs. Extends product capabilities for creators and chatters. |

### 52. Scaffold KidVerse AI: COPPA Expo wrapper with three Realms

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-12 20:54` |
| **Commit** | `0f984fe` (`0f984fed9f898ccfcacaac51589e3fe6c5ac2b45`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Scaffold KidVerse AI: COPPA Expo wrapper with three Realms. Extends product capabilities for creators and chatters. |

### 53. Fix chat model routing so Llama 3 Erato is the default, not Gemini

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 16:41` |
| **Commit** | `7ba95a8` (`7ba95a846f59e86499485f3b41d9743e378833e4`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Bug Fix` |
| **Summary** | Fix chat model routing so Llama 3 Erato is the default, not Gemini. Restores correct runtime behavior and prevents user-facing failures. |

### 54. Add VLM persona perception with token-optimized chat injection

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 16:48` |
| **Commit** | `20d0ab4` (`20d0ab4da724f5a334e9f556daff280045d4136b`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Add VLM persona perception with token-optimized chat injection. Extends product capabilities for creators and chatters. |

### 55. Fix Vercel build by exporting recountTurnTokens from context-manager

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 17:12` |
| **Commit** | `c957f9d` (`c957f9d87adca191c950b6a7ec8002855e67bda5`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Fix Vercel build by exporting recountTurnTokens from context-manager. Responds to platform, build, or third-party API/runtime constraints. |

### 56. Fix Vercel build by exporting recountTurnTokens from context-manager

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 17:12` |
| **Commit** | `f415d13` (`f415d135fbd9f8f1ae9846c4356a14053bbb05de`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Fix Vercel build by exporting recountTurnTokens from context-manager. Responds to platform, build, or third-party API/runtime constraints. |

### 57. Merge PR #3: VLM persona perception with token-optimized chat injection

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 19:46` |
| **Commit** | `a2c6031` (`a2c60313a9838cc742738f7199f91cb4cbdbe235`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Merge PR #3: VLM persona perception with token-optimized chat injection. Extends product capabilities for creators and chatters. |

### 58. Fix empty gallery by adding missing VLM columns at runtime

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 20:10` |
| **Commit** | `ec53a9f` (`ec53a9f393de7d4931dc462f94e1f95456920818`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Database & Schema` |
| **Summary** | Fix empty gallery by adding missing VLM columns at runtime. Keeps Postgres/Supabase schema aligned with app reads and writes. |

### 59. Heal VLM columns on nexus schema, not public

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 20:13` |
| **Commit** | `3fcc377` (`3fcc377a9c4d58e97b9ca0f7369b31580213e9a3`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Database & Schema` |
| **Summary** | Heal VLM columns on nexus schema, not public. Keeps Postgres/Supabase schema aligned with app reads and writes. |

### 60. Enforce tier context windows, atomic credits, and 402/429 gates

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 20:30` |
| **Commit** | `aaea0f8` (`aaea0f8b574f951681fc9139a2dfc21a5102eb26`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Enforce tier context windows, atomic credits, and 402/429 gates. Extends product capabilities for creators and chatters. |

### 61. Replace ComfyUI scenes with fal.ai flux-2 and prompt enrichment

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 20:36` |
| **Commit** | `60f7330` (`60f7330ab4d2782145428f48e5c4c844701a42f6`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Replace ComfyUI scenes with fal.ai flux-2 and prompt enrichment. Responds to platform, build, or third-party API/runtime constraints. |

### 62. Add escalating reroll costs and generation cooldowns

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 20:40` |
| **Commit** | `762f260` (`762f2608da407e68a01ece85123c476bf19819f0`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Add escalating reroll costs and generation cooldowns. Extends product capabilities for creators and chatters. |

### 63. Add Trust & Safety gates, prompt moderation, and fal user hashes

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 20:46` |
| **Commit** | `00d0af7` (`00d0af7f23c872cd56be859258ffd8be6e15356e`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Add Trust & Safety gates, prompt moderation, and fal user hashes. Responds to platform, build, or third-party API/runtime constraints. |

### 64. Replace PayPal with SubscribeStar.adult multi-tier billing

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 21:22` |
| **Commit** | `6e2ad9a` (`6e2ad9a0f2a3df73dabe43e3fea91891738737b9`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Replace PayPal with SubscribeStar.adult multi-tier billing. Responds to platform, build, or third-party API/runtime constraints. |

### 65. Merge subscription credit enforcement into main

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 21:24` |
| **Commit** | `2dc356c` (`2dc356c2b1cbc4e10ddb2b4bfc3da715ce599e0e`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Merge subscription credit enforcement into main. Extends product capabilities for creators and chatters. |

### 66. Merge Trust & Safety compliance into main and require direct-to-main

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 21:26` |
| **Commit** | `45b9dc4` (`45b9dc43e73729b27b6ad37c8c53758718805365`) |
| **Author** | Cursor Agent |
| **Category Tag** | `UI / UX` |
| **Summary** | Merge Trust & Safety compliance into main and require direct-to-main. Improves presentation and interaction clarity on web/mobile surfaces. |

### 67. Add alwaysApply Cursor rule to ship all work directly to main

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 21:26` |
| **Commit** | `59f03f4` (`59f03f4f341b664bfdb0ec38ac604701ebdd6020`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Add alwaysApply Cursor rule to ship all work directly to main. Extends product capabilities for creators and chatters. |

### 68. Track .cursor/rules in git while ignoring other Cursor local state

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 21:26` |
| **Commit** | `8773f1a` (`8773f1a3a32ccb2ec3faf0148a7831b19aab16cf`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Track .cursor/rules in git while ignoring other Cursor local state. Extends product capabilities for creators and chatters. |

### 69. Calibrate SFW/NSFW card rating and reject SFW-field violations

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 21:34` |
| **Commit** | `fefe305` (`fefe3051c7bb12d417a58547b057ee0435440616`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Calibrate SFW/NSFW card rating and reject SFW-field violations. Extends product capabilities for creators and chatters. |

### 70. Calibrate VLM underage detection to multi-signal only

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 22:13` |
| **Commit** | `fedece2` (`fedece25a0e7696a433fe866b5e2e31bc2f3ba7d`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Calibrate VLM underage detection to multi-signal only. Extends product capabilities for creators and chatters. |

### 71. Add 50-card SFW batch generator across six genres

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 23:09` |
| **Commit** | `04fe2a7` (`04fe2a7f3cb392844f528180e07b4687bd487462`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Add 50-card SFW batch generator across six genres. Extends product capabilities for creators and chatters. |

### 72. Fix Discover empty list and profile page server crashes

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 23:18` |
| **Commit** | `34f90e6` (`34f90e6f86dcf29eed06f555a4089cfa1946028e`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Bug Fix` |
| **Summary** | Fix Discover empty list and profile page server crashes. Restores correct runtime behavior and prevents user-facing failures. |

### 73. Mirror resilient public profile page into android-app

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 23:18` |
| **Commit** | `08f7af7` (`08f7af754aa83863ad9db89a1d8db296270c80ec`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Feature` |
| **Summary** | Mirror resilient public profile page into android-app. Extends product capabilities for creators and chatters. |

### 74. Add Nexus watchdog healthcheck with SMS cooldown alerts

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 23:21` |
| **Commit** | `1768799` (`1768799e42b2317bb39d9977b76ace6d0d3a7ca1`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Add Nexus watchdog healthcheck with SMS cooldown alerts. Responds to platform, build, or third-party API/runtime constraints. |

### 75. Fix profile page TypeScript so Vercel build succeeds

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 23:36` |
| **Commit** | `1443f4f` (`1443f4f903eb4ac26143d85044ed2a8a5fc2e443`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Integration & API / External Fault` |
| **Summary** | Fix profile page TypeScript so Vercel build succeeds. Responds to platform, build, or third-party API/runtime constraints. |

### 76. Fix /u/[username] 404/500 by resolving creator slugs safely

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-19 23:53` |
| **Commit** | `bb34061` (`bb340618215a2bce210e5c808f85063e6f00f89b`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Bug Fix` |
| **Summary** | Fix /u/[username] 404/500 by resolving creator slugs safely. Restores correct runtime behavior and prevents user-facing failures. |

### 77. Frame character card thumbnails without chopping faces or labels

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-20 01:01` |
| **Commit** | `109a7ba` (`109a7baf8f1e0d3f978e725dbcbe5e1e32a44c1f`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Bug Fix` |
| **Summary** | Frame character card thumbnails without chopping faces or labels. Restores correct runtime behavior and prevents user-facing failures. |

### 78. Use square card frames so 1024² portraits are not side-cropped

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-20 01:42` |
| **Commit** | `249f5ce` (`249f5ce44db592c74ac242bf4ced6c88d1043374`) |
| **Author** | Cursor Agent |
| **Category Tag** | `UI / UX` |
| **Summary** | Use square card frames so 1024² portraits are not side-cropped. Improves presentation and interaction clarity on web/mobile surfaces. |

### 79. Auto-fit card images with client resize and contain-frame rendering

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-20 04:10` |
| **Commit** | `c39ab5e` (`c39ab5e4e9d13fc00a37a01a14e84565adce9efa`) |
| **Author** | Cursor Agent |
| **Category Tag** | `UI / UX` |
| **Summary** | Auto-fit card images with client resize and contain-frame rendering. Improves presentation and interaction clarity on web/mobile surfaces. |

### 80. Add card bottom action bar and harden Discover character loading

| Field | Value |
|---|---|
| **Timestamp** | `2026-11-20 04:34` |
| **Commit** | `d32954a` (`d32954a58a47f38e1ebc7eb5fd20a72f005b65a3`) |
| **Author** | Cursor Agent |
| **Category Tag** | `Bug Fix` |
| **Summary** | Add card bottom action bar and harden Discover character loading. Restores correct runtime behavior and prevents user-facing failures. |

### Migration & Schema File Timeline (Filesystem mtime, UTC)

| Timestamp | Path | Size (bytes) | Category Tag |
|---|---|---:|---|
| `2026-11-19 21:22` | `android-app/supabase/migrations/20261119205000_daily_credit_rpcs.sql` | 2355 | `Database & Schema` |
| `2026-11-19 21:21` | `android-app/supabase/migrations/20261119210000_subscribestar.sql` | 964 | `Database & Schema` |
| `2026-11-19 21:24` | `android-app/supabase/migrations/20261119220000_generation_limits.sql` | 737 | `Database & Schema` |
| `2026-11-19 21:24` | `android-app/supabase/migrations/20261119230000_trust_safety.sql` | 914 | `Database & Schema` |
| `2026-11-18 20:24` | `nextjs_space/supabase/migrations/20261016180000_world_engine.sql` | 1189 | `Database & Schema` |
| `2026-11-18 20:24` | `nextjs_space/supabase/migrations/20261019150000_lorebooks.sql` | 1842 | `Database & Schema` |
| `2026-11-19 19:46` | `nextjs_space/supabase/migrations/20261119170000_chat_model_defaults.sql` | 1197 | `Database & Schema` |
| `2026-11-19 20:13` | `nextjs_space/supabase/migrations/20261119180000_persona_visual_fields.sql` | 1479 | `Database & Schema` |
| `2026-11-19 21:22` | `nextjs_space/supabase/migrations/20261119205000_daily_credit_rpcs.sql` | 2355 | `Database & Schema` |
| `2026-11-19 21:20` | `nextjs_space/supabase/migrations/20261119210000_subscribestar.sql` | 964 | `Database & Schema` |
| `2026-11-19 21:24` | `nextjs_space/supabase/migrations/20261119220000_generation_limits.sql` | 737 | `Database & Schema` |
| `2026-11-19 21:24` | `nextjs_space/supabase/migrations/20261119230000_trust_safety.sql` | 914 | `Database & Schema` |
| `2026-11-18 20:24` | `nextjs_space/supabase/migrations/card_and_profile_comments.sql` | 1768 | `Database & Schema` |
| `2026-11-18 20:24` | `nextjs_space/supabase/migrations/profiles_tos.sql` | 2030 | `Database & Schema` |
| `2026-11-19 19:46` | `nextjs_space/supabase/schema.sql` | 8429 | `Database & Schema` |

---

## 3. Categorized & Titled Breakdown

### Titled Features & Capabilities

| Timestamp | Title | Commit | Why it matters |
|---|---|---|---|
| `2026-10-11 23:12` | **Initial commit of Nexus AI** | `2957206` | Initial commit of Nexus AI. Extends product capabilities for creators and chatters. |
| `2026-10-12 06:48` | **Default custom model routing to the Groq OpenAI-compatible API** | `785f513` | Default custom model routing to the Groq OpenAI-compatible API. Extends product capabilities for creators and chatters. |
| `2026-10-12 08:08` | **﻿Move the NSFW switch into profile settings and hide adult cards until it is on** | `66cbf7e` | ﻿Move the NSFW switch into profile settings and hide adult cards until it is on. Extends product capabilities for creators and chatters. |
| `2026-10-12 08:22` | **Gate adult cards on the profile setting and an active plan** | `74a0c67` | Gate adult cards on the profile setting and an active plan. Extends product capabilities for creators and chatters. |
| `2026-10-13 14:36` | **Send checkout to the live PayPal API and store terms acceptance** | `a6959ba` | Send checkout to the live PayPal API and store terms acceptance. Extends product capabilities for creators and chatters. |
| `2026-10-13 17:39` | **Point the creator whitelist at the new account email** | `4d8ea4e` | Point the creator whitelist at the new account email. Extends product capabilities for creators and chatters. |
| `2026-10-13 19:08` | **Keep PayPal credential pairs intact and log sign-in failures** | `da2979b` | Keep PayPal credential pairs intact and log sign-in failures. Extends product capabilities for creators and chatters. |
| `2026-10-14 09:25` | **Restore the owned card library beside Top 8 Picks** | `d4c58fd` | Restore the owned card library beside Top 8 Picks. Extends product capabilities for creators and chatters. |
| `2026-10-14 09:48` | **Show every card a signed-in creator owns** | `6814120` | Show every card a signed-in creator owns. Extends product capabilities for creators and chatters. |
| `2026-10-14 10:43` | **Give the phone its own profile layout and list every owned card** | `0b04748` | Give the phone its own profile layout and list every owned card. Extends product capabilities for creators and chatters. |
| `2026-10-14 11:18` | **Point the phone at the live site and keep admin access intact** | `6d361bb` | Point the phone at the live site and keep admin access intact. Extends product capabilities for creators and chatters. |
| `2026-10-14 12:45` | **Ship the remaining profile, upload, and splash work** | `9ce8518` | Ship the remaining profile, upload, and splash work. Extends product capabilities for creators and chatters. |
| `2026-10-14 13:42` | **Save a chosen profile song onto the profile** | `a8f258f` | Save a chosen profile song onto the profile. Extends product capabilities for creators and chatters. |
| `2026-10-14 13:45` | **Hide adult cards on a profile when the NSFW setting is off** | `04cabcb` | Hide adult cards on a profile when the NSFW setting is off. Extends product capabilities for creators and chatters. |
| `2026-10-14 14:34` | **Keep the chosen profile song attached after the file is picked** | `0abcaee` | Keep the chosen profile song attached after the file is picked. Extends product capabilities for creators and chatters. |
| `2026-10-14 14:42` | **Store profile songs in a public audio bucket instead of the image upload path** | `f6de87b` | Store profile songs in a public audio bucket instead of the image upload path. Extends product capabilities for creators and chatters. |
| `2026-10-14 14:48` | **Add a play button beside the profile song** | `9e1eb07` | Add a play button beside the profile song. Extends product capabilities for creators and chatters. |
| `2026-10-14 15:06` | **Add character card pages plus comments on cards and profiles** | `61c8a61` | Add character card pages plus comments on cards and profiles. Extends product capabilities for creators and chatters. |
| `2026-10-14 18:14` | **Send card audio as the file itself so the phone can save mp3 and flac** | `9b181ab` | Send card audio as the file itself so the phone can save mp3 and flac. Extends product capabilities for creators and chatters. |
| `2026-10-16 17:35` | **Keep roleplay canon across turns with session stats and searchable long-term memories** | `bc058b7` | Keep roleplay canon across turns with session stats and searchable long-term memories. Extends product capabilities for creators and chatters. |
| `2026-10-16 18:35` | **Send the full character card and chat history so replies keep their length** | `f07bc02` | Send the full character card and chat history so replies keep their length. Extends product capabilities for creators and chatters. |
| `2026-10-16 18:45` | **Inject live world stats and memories into each chat prompt** | `a228317` | Inject live world stats and memories into each chat prompt. Extends product capabilities for creators and chatters. |
| `2026-10-16 19:06` | **Route chat completions through NovelAI's text generation API** | `ecebb8d` | Route chat completions through NovelAI's text generation API. Extends product capabilities for creators and chatters. |
| `2026-10-19 19:30` | **Add lorebook world-info editor, JSON/PNG import, and activation assembly** | `ef0cea3` | Add lorebook world-info editor, JSON/PNG import, and activation assembly. Extends product capabilities for creators and chatters. |
| `2026-10-19 19:35` | **Keep system prompts out of chat and sync card openings to Supabase** | `f9bca5f` | Keep system prompts out of chat and sync card openings to Supabase. Extends product capabilities for creators and chatters. |
| `2026-10-19 20:47` | **Serve chat models from the paid provider and keep soundtrack controls in chat** | `c73ab46` | Serve chat models from the paid provider and keep soundtrack controls in chat. Extends product capabilities for creators and chatters. |
| `2026-11-09 08:40` | **Add a local privacy assistant for Ollama and on-device image APIs** | `73013d6` | Add a local privacy assistant for Ollama and on-device image APIs. Extends product capabilities for creators and chatters. |
| `2026-11-12 20:54` | **Scaffold KidVerse AI: COPPA Expo wrapper with three Realms** | `0f984fe` | Scaffold KidVerse AI: COPPA Expo wrapper with three Realms. Extends product capabilities for creators and chatters. |
| `2026-11-19 16:48` | **Add VLM persona perception with token-optimized chat injection** | `20d0ab4` | Add VLM persona perception with token-optimized chat injection. Extends product capabilities for creators and chatters. |
| `2026-11-19 19:46` | **Merge PR #3: VLM persona perception with token-optimized chat injection** | `a2c6031` | Merge PR #3: VLM persona perception with token-optimized chat injection. Extends product capabilities for creators and chatters. |
| `2026-11-19 20:30` | **Enforce tier context windows, atomic credits, and 402/429 gates** | `aaea0f8` | Enforce tier context windows, atomic credits, and 402/429 gates. Extends product capabilities for creators and chatters. |
| `2026-11-19 20:40` | **Add escalating reroll costs and generation cooldowns** | `762f260` | Add escalating reroll costs and generation cooldowns. Extends product capabilities for creators and chatters. |
| `2026-11-19 21:24` | **Merge subscription credit enforcement into main** | `2dc356c` | Merge subscription credit enforcement into main. Extends product capabilities for creators and chatters. |
| `2026-11-19 21:26` | **Add alwaysApply Cursor rule to ship all work directly to main** | `59f03f4` | Add alwaysApply Cursor rule to ship all work directly to main. Extends product capabilities for creators and chatters. |
| `2026-11-19 21:26` | **Track .cursor/rules in git while ignoring other Cursor local state** | `8773f1a` | Track .cursor/rules in git while ignoring other Cursor local state. Extends product capabilities for creators and chatters. |
| `2026-11-19 21:34` | **Calibrate SFW/NSFW card rating and reject SFW-field violations** | `fefe305` | Calibrate SFW/NSFW card rating and reject SFW-field violations. Extends product capabilities for creators and chatters. |
| `2026-11-19 22:13` | **Calibrate VLM underage detection to multi-signal only** | `fedece2` | Calibrate VLM underage detection to multi-signal only. Extends product capabilities for creators and chatters. |
| `2026-11-19 23:09` | **Add 50-card SFW batch generator across six genres** | `04fe2a7` | Add 50-card SFW batch generator across six genres. Extends product capabilities for creators and chatters. |
| `2026-11-19 23:18` | **Mirror resilient public profile page into android-app** | `08f7af7` | Mirror resilient public profile page into android-app. Extends product capabilities for creators and chatters. |

### Titled Bug Fixes & Stability Patches

| Timestamp | Title | Commit | Why it matters |
|---|---|---|---|
| `2026-10-12 04:36` | **Point production PayPal checkout at the live API and leave checkout unavailable when credentials are missing** | `5621b13` | Point production PayPal checkout at the live API and leave checkout unavailable when credentials are missing. Restores correct runtime behavior and prevents user-facing failures. |
| `2026-10-13 15:29` | **Create live PayPal orders and return checkout errors** | `6244c0a` | Create live PayPal orders and return checkout errors. Restores correct runtime behavior and prevents user-facing failures. |
| `2026-10-13 15:58` | **Include lib/paypal.ts live endpoint and credential trimming fixes** | `a7a25c2` | Include lib/paypal.ts live endpoint and credential trimming fixes. Restores correct runtime behavior and prevents user-facing failures. |
| `2026-10-13 16:09` | **Fix PayPal live authentication pipeline and force dynamic execution** | `0107606` | Fix PayPal live authentication pipeline and force dynamic execution. Restores correct runtime behavior and prevents user-facing failures. |
| `2026-10-14 22:21` | **Fix React hook lint errors and load config scripts as ES modules** | `a953fb2` | Fix React hook lint errors and load config scripts as ES modules. Restores correct runtime behavior and prevents user-facing failures. |
| `2026-11-19 16:41` | **Fix chat model routing so Llama 3 Erato is the default, not Gemini** | `7ba95a8` | Fix chat model routing so Llama 3 Erato is the default, not Gemini. Restores correct runtime behavior and prevents user-facing failures. |
| `2026-11-19 23:18` | **Fix Discover empty list and profile page server crashes** | `34f90e6` | Fix Discover empty list and profile page server crashes. Restores correct runtime behavior and prevents user-facing failures. |
| `2026-11-19 23:53` | **Fix /u/[username] 404/500 by resolving creator slugs safely** | `bb34061` | Fix /u/[username] 404/500 by resolving creator slugs safely. Restores correct runtime behavior and prevents user-facing failures. |
| `2026-11-20 01:01` | **Frame character card thumbnails without chopping faces or labels** | `109a7ba` | Frame character card thumbnails without chopping faces or labels. Restores correct runtime behavior and prevents user-facing failures. |
| `2026-11-20 04:34` | **Add card bottom action bar and harden Discover character loading** | `d32954a` | Add card bottom action bar and harden Discover character loading. Restores correct runtime behavior and prevents user-facing failures. |

### Titled Database, Migrations & Backend Updates

#### From Git history

| Timestamp | Title | Commit | Why it matters |
|---|---|---|---|
| `2026-10-12 06:07` | **Point the app database at Supabase Postgres** | `49c5668` | Point the app database at Supabase Postgres. Keeps Postgres/Supabase schema aligned with app reads and writes. |
| `2026-10-14 14:36` | **Save profile songs on the account table the live database actually uses** | `8ffb50f` | Save profile songs on the account table the live database actually uses. Keeps Postgres/Supabase schema aligned with app reads and writes. |
| `2026-10-16 17:49` | **Skip adding Message.deleted when the column is already present** | `df05c16` | Skip adding Message.deleted when the column is already present. Keeps Postgres/Supabase schema aligned with app reads and writes. |
| `2026-10-16 18:05` | **Keep chat dispatch alive when the public schema has no Message table** | `7de29fc` | Keep chat dispatch alive when the public schema has no Message table. Keeps Postgres/Supabase schema aligned with app reads and writes. |
| `2026-10-16 18:20` | **Stop chat dispatch from altering the schema and keep world updates off the reply stream** | `1f98fca` | Stop chat dispatch from altering the schema and keep world updates off the reply stream. Keeps Postgres/Supabase schema aligned with app reads and writes. |
| `2026-11-19 20:10` | **Fix empty gallery by adding missing VLM columns at runtime** | `ec53a9f` | Fix empty gallery by adding missing VLM columns at runtime. Keeps Postgres/Supabase schema aligned with app reads and writes. |
| `2026-11-19 20:13` | **Heal VLM columns on nexus schema, not public** | `3fcc377` | Heal VLM columns on nexus schema, not public. Keeps Postgres/Supabase schema aligned with app reads and writes. |

#### From SQL / migration files on disk

| Timestamp (mtime UTC) | File | Notes |
|---|---|---|
| `2026-11-19 21:22` | `android-app/supabase/migrations/20261119205000_daily_credit_rpcs.sql` | Daily credit RPC helpers |
| `2026-11-19 21:21` | `android-app/supabase/migrations/20261119210000_subscribestar.sql` | SubscribeStar billing linkage |
| `2026-11-19 21:24` | `android-app/supabase/migrations/20261119220000_generation_limits.sql` | Generation quota limits |
| `2026-11-19 21:24` | `android-app/supabase/migrations/20261119230000_trust_safety.sql` | Trust & safety tables/flags |
| `2026-11-18 20:24` | `nextjs_space/supabase/migrations/20261016180000_world_engine.sql` | World / scene engine tables |
| `2026-11-18 20:24` | `nextjs_space/supabase/migrations/20261019150000_lorebooks.sql` | Lorebook storage |
| `2026-11-19 19:46` | `nextjs_space/supabase/migrations/20261119170000_chat_model_defaults.sql` | Default chat model settings |
| `2026-11-19 20:13` | `nextjs_space/supabase/migrations/20261119180000_persona_visual_fields.sql` | Persona VLM / visual fields |
| `2026-11-19 21:22` | `nextjs_space/supabase/migrations/20261119205000_daily_credit_rpcs.sql` | Daily credit RPC helpers |
| `2026-11-19 21:20` | `nextjs_space/supabase/migrations/20261119210000_subscribestar.sql` | SubscribeStar billing linkage |
| `2026-11-19 21:24` | `nextjs_space/supabase/migrations/20261119220000_generation_limits.sql` | Generation quota limits |
| `2026-11-19 21:24` | `nextjs_space/supabase/migrations/20261119230000_trust_safety.sql` | Trust & safety tables/flags |
| `2026-11-18 20:24` | `nextjs_space/supabase/migrations/card_and_profile_comments.sql` | Card & profile comments |
| `2026-11-18 20:24` | `nextjs_space/supabase/migrations/profiles_tos.sql` | Terms of Service acceptance on profiles |
| `2026-11-19 19:46` | `nextjs_space/supabase/schema.sql` | Baseline Supabase schema dump |

### Titled UI, Media & Asset Updates

| Timestamp | Title | Commit | Why it matters |
|---|---|---|---|
| `2026-10-12 00:23` | **Require Terms of Service acceptance before signed-in use** | `07375d3` | Require Terms of Service acceptance before signed-in use. Improves presentation and interaction clarity on web/mobile surfaces. |
| `2026-10-14 13:19` | **Add a profile song file picker on the preview and the editor** | `ed1847b` | Add a profile song file picker on the preview and the editor. Improves presentation and interaction clarity on web/mobile surfaces. |
| `2026-11-19 21:26` | **Merge Trust & Safety compliance into main and require direct-to-main** | `45b9dc4` | Merge Trust & Safety compliance into main and require direct-to-main. Improves presentation and interaction clarity on web/mobile surfaces. |
| `2026-11-20 01:42` | **Use square card frames so 1024² portraits are not side-cropped** | `249f5ce` | Use square card frames so 1024² portraits are not side-cropped. Improves presentation and interaction clarity on web/mobile surfaces. |
| `2026-11-20 04:10` | **Auto-fit card images with client resize and contain-frame rendering** | `c39ab5e` | Auto-fit card images with client resize and contain-frame rendering. Improves presentation and interaction clarity on web/mobile surfaces. |

### External API, Platform & Software Faults (Non-Neglect Record)

| Timestamp | Title | Commit | Why it matters |
|---|---|---|---|
| `2026-10-12 00:44` | **Keep the production build from connecting to Prisma or tracing local images** | `627570f` | Keep the production build from connecting to Prisma or tracing local images. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-12 01:11` | **Stop the Vercel build from tracing the scene route while collecting pages** | `6f9db10` | Stop the Vercel build from tracing the scene route while collecting pages. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-12 01:43` | **Move the terms gate onto the Node.js proxy so the build stops parsing it as edge middleware** | `8d030af` | Move the terms gate onto the Node.js proxy so the build stops parsing it as edge middleware. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-12 03:03` | **Keep Prisma from opening during page collection and stop scene files from tracing the whole project** | `1956810` | Keep Prisma from opening during page collection and stop scene files from tracing the whole project. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-12 03:57` | **Stop file writes from tracing the whole project while Vercel collects pages** | `f6a9a72` | Stop file writes from tracing the whole project while Vercel collects pages. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-12 04:20` | **Keep the sqlite fallback inside the build and send production security headers** | `c96a34f` | Keep the sqlite fallback inside the build and send production security headers. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-12 05:24` | **Harden production auth, health, and empty-catalog startup so Vercel can serve the app** | `88f712e` | Harden production auth, health, and empty-catalog startup so Vercel can serve the app. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-13 15:49` | **Trigger build with live PayPal credentials** | `26302bb` | Trigger build with live PayPal credentials. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-13 17:49` | **Stop cloud updates from rebuilding the character gallery** | `0f3e9ad` | Stop cloud updates from rebuilding the character gallery. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-13 18:13` | **Use the live PayPal credentials stored under the current Vercel names** | `e059668` | Use the live PayPal credentials stored under the current Vercel names. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-14 23:58` | **Require a clean TypeScript check before the production build succeeds** | `4401284` | Require a clean TypeScript check before the production build succeeds. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-10-16 10:25` | **Sync mobile app WebView and Supabase endpoints to Vercel cloud production** | `b38cbc9` | Fix: Sync mobile app WebView and Supabase endpoints to Vercel cloud production. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-11-19 17:12` | **Fix Vercel build by exporting recountTurnTokens from context-manager** | `c957f9d` | Fix Vercel build by exporting recountTurnTokens from context-manager. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-11-19 17:12` | **Fix Vercel build by exporting recountTurnTokens from context-manager** | `f415d13` | Fix Vercel build by exporting recountTurnTokens from context-manager. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-11-19 20:36` | **Replace ComfyUI scenes with fal.ai flux-2 and prompt enrichment** | `60f7330` | Replace ComfyUI scenes with fal.ai flux-2 and prompt enrichment. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-11-19 20:46` | **Add Trust & Safety gates, prompt moderation, and fal user hashes** | `00d0af7` | Add Trust & Safety gates, prompt moderation, and fal user hashes. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-11-19 21:22` | **Replace PayPal with SubscribeStar.adult multi-tier billing** | `6e2ad9a` | Replace PayPal with SubscribeStar.adult multi-tier billing. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-11-19 23:21` | **Add Nexus watchdog healthcheck with SMS cooldown alerts** | `1768799` | Add Nexus watchdog healthcheck with SMS cooldown alerts. Responds to platform, build, or third-party API/runtime constraints. |
| `2026-11-19 23:36` | **Fix profile page TypeScript so Vercel build succeeds** | `1443f4f` | Fix profile page TypeScript so Vercel build succeeds. Responds to platform, build, or third-party API/runtime constraints. |

> **Non-neglect note:** Entries in this section document work driven by **third-party APIs**, **Vercel/build tooling**, **Supabase/Postgres runtime**, **billing OAuth**, or **ops/alerting** constraints. They are maintenance responses to external platform behavior—not evidence of abandoned ownership.

---

## 4. Verification & Proof Index

Quick lookup for auditors. Prefer commit hashes for Git-tracked changes; use file paths for SQL artifacts.

| Timestamp | Title | Category | Commit Hash / File Path |
|---|---|---|---|
| `2026-10-11 23:12` | Initial commit of Nexus AI | Feature | `29572066a45b532d7ea7829a556ed618d1821886` |
| `2026-10-12 00:23` | Require Terms of Service acceptance before signed-in use | UI / UX | `07375d34eab5ad4b80e7cfab77fd5d301c0f1e0b` |
| `2026-10-12 00:44` | Keep the production build from connecting to Prisma or tracing local images | Integration & API / External Fault | `627570fb6b42d37e47754990950468d89ef59549` |
| `2026-10-12 01:11` | Stop the Vercel build from tracing the scene route while collecting pages | Integration & API / External Fault | `6f9db10667185de6a0c0d7d19adf694fdda411a9` |
| `2026-10-12 01:43` | Move the terms gate onto the Node.js proxy so the build stops parsing it as edge middleware | Integration & API / External Fault | `8d030afe027b9ade3cc8c4710ac3792085be8891` |
| `2026-10-12 03:03` | Keep Prisma from opening during page collection and stop scene files from tracing the whole project | Integration & API / External Fault | `1956810637095c1664cf2d288ca1c36268b310c7` |
| `2026-10-12 03:57` | Stop file writes from tracing the whole project while Vercel collects pages | Integration & API / External Fault | `f6a9a72ebb573d137bb2dd2d386ce8272dac7cfd` |
| `2026-10-12 04:20` | Keep the sqlite fallback inside the build and send production security headers | Integration & API / External Fault | `c96a34fef9bc0eae453829ed5853aca5c43451a8` |
| `2026-10-12 04:36` | Point production PayPal checkout at the live API and leave checkout unavailable when credentials are missing | Bug Fix | `5621b13cc3e4e57b0d888eafaa56a8e260eeb889` |
| `2026-10-12 05:24` | Harden production auth, health, and empty-catalog startup so Vercel can serve the app | Integration & API / External Fault | `88f712ec227a5948097222c0b5ab32abdd2fdc48` |
| `2026-10-12 06:07` | Point the app database at Supabase Postgres | Database & Schema | `49c56681eeeca057ddf28e9d51f7ba32bed8939a` |
| `2026-10-12 06:48` | Default custom model routing to the Groq OpenAI-compatible API | Feature | `785f513a363d82afc33fa05eb69f332047252d2d` |
| `2026-10-12 08:08` | ﻿Move the NSFW switch into profile settings and hide adult cards until it is on | Feature | `66cbf7ead1fc0a061dfa2d4f7502b238f5b8c228` |
| `2026-10-12 08:22` | Gate adult cards on the profile setting and an active plan | Feature | `74a0c671c18069352a168dbcc08aaaa129b0f313` |
| `2026-10-13 14:36` | Send checkout to the live PayPal API and store terms acceptance | Feature | `a6959bad3430e89dae9a3e8a67acf36229505e98` |
| `2026-10-13 15:29` | Create live PayPal orders and return checkout errors | Bug Fix | `6244c0a1df8c73ef6e6f736a845cf9158b43f097` |
| `2026-10-13 15:49` | Trigger build with live PayPal credentials | Integration & API / External Fault | `26302bbe5efbe90e27cf6d7b638a532d7d33c48e` |
| `2026-10-13 15:58` | Include lib/paypal.ts live endpoint and credential trimming fixes | Bug Fix | `a7a25c255091249b2760b3de0ac5ef85954b917c` |
| `2026-10-13 16:09` | Fix PayPal live authentication pipeline and force dynamic execution | Bug Fix | `0107606a5742f8508e09b5ec32bd6bdf730c88e0` |
| `2026-10-13 17:39` | Point the creator whitelist at the new account email | Feature | `4d8ea4e0240447b39226815e733924de4bde40d1` |
| `2026-10-13 17:49` | Stop cloud updates from rebuilding the character gallery | Integration & API / External Fault | `0f3e9adde5050516eea4ffa3f8ff4354679fae7c` |
| `2026-10-13 18:13` | Use the live PayPal credentials stored under the current Vercel names | Integration & API / External Fault | `e0596682908cd034bb39fc8385634e7e98931719` |
| `2026-10-13 19:08` | Keep PayPal credential pairs intact and log sign-in failures | Feature | `da2979bee0ae628d47dc34b074554ea757ce7b36` |
| `2026-10-14 09:25` | Restore the owned card library beside Top 8 Picks | Feature | `d4c58fdf9fa0b570c65aee329874b7608c0d4e0d` |
| `2026-10-14 09:48` | Show every card a signed-in creator owns | Feature | `6814120ca7a7740f41cf3030ee7e0fe868a6bb7c` |
| `2026-10-14 10:43` | Give the phone its own profile layout and list every owned card | Feature | `0b047485b5d74d01aab2a45c268851e4e54fc0a0` |
| `2026-10-14 11:18` | Point the phone at the live site and keep admin access intact | Feature | `6d361bbad5badf9e2d64ee24654dabf46aeb3ac9` |
| `2026-10-14 12:45` | Ship the remaining profile, upload, and splash work | Feature | `9ce851848d774b2f14efeb0c60841420f7c78232` |
| `2026-10-14 13:19` | Add a profile song file picker on the preview and the editor | UI / UX | `ed1847b6900388b0ae6441b548d5055dea67f2ee` |
| `2026-10-14 13:42` | Save a chosen profile song onto the profile | Feature | `a8f258f89df222bc455ef18232910558fd534d93` |
| `2026-10-14 13:45` | Hide adult cards on a profile when the NSFW setting is off | Feature | `04cabcb6ad62e4bfad63f3506bac1d7d416e3d2f` |
| `2026-10-14 14:34` | Keep the chosen profile song attached after the file is picked | Feature | `0abcaeef23db74433f0837fd9c7525c63bc19c4a` |
| `2026-10-14 14:36` | Save profile songs on the account table the live database actually uses | Database & Schema | `8ffb50ff2b5c98db9ee6df44146024ed3c09b5c8` |
| `2026-10-14 14:42` | Store profile songs in a public audio bucket instead of the image upload path | Feature | `f6de87baad888fbd8369b241a9427d80a9e52e5b` |
| `2026-10-14 14:48` | Add a play button beside the profile song | Feature | `9e1eb07ec8c81fa3e96655bcee4d0ea2a05e959f` |
| `2026-10-14 15:06` | Add character card pages plus comments on cards and profiles | Feature | `61c8a6106b180a34654599184f8eb0bfdddac42a` |
| `2026-10-14 18:14` | Send card audio as the file itself so the phone can save mp3 and flac | Feature | `9b181abee965361938bdba79262e7f1abb3d6614` |
| `2026-10-14 22:21` | Fix React hook lint errors and load config scripts as ES modules | Bug Fix | `a953fb24af5ae9693c391936d7c29c5c69caad7c` |
| `2026-10-14 23:58` | Require a clean TypeScript check before the production build succeeds | Integration & API / External Fault | `440128450820f54ca7400f0cd43dbc3a1a6cc66b` |
| `2026-10-16 10:25` | Sync mobile app WebView and Supabase endpoints to Vercel cloud production | Integration & API / External Fault | `b38cbc940fbce116c0b9f8b9dd184a32b56bfcf0` |
| `2026-10-16 17:35` | Keep roleplay canon across turns with session stats and searchable long-term memories | Feature | `bc058b71e30895cbddb4a9288c00404deca78623` |
| `2026-10-16 17:49` | Skip adding Message.deleted when the column is already present | Database & Schema | `df05c162a055bce843345f14916f61e9345c3265` |
| `2026-10-16 18:05` | Keep chat dispatch alive when the public schema has no Message table | Database & Schema | `7de29fcf01d0503e259576eaca228cd6ba4fd314` |
| `2026-10-16 18:20` | Stop chat dispatch from altering the schema and keep world updates off the reply stream | Database & Schema | `1f98fca7aa9d5a6cff0a920f1053b15291e054c6` |
| `2026-10-16 18:35` | Send the full character card and chat history so replies keep their length | Feature | `f07bc021a1f159df12d8a8b4f136d88941d89265` |
| `2026-10-16 18:45` | Inject live world stats and memories into each chat prompt | Feature | `a22831761f1e0d15cd6413b09111fe44f9e03dcc` |
| `2026-10-16 19:06` | Route chat completions through NovelAI's text generation API | Feature | `ecebb8decc1ce994560e1a5c17f8e46ed7cfec7d` |
| `2026-10-19 19:30` | Add lorebook world-info editor, JSON/PNG import, and activation assembly | Feature | `ef0cea37e9012ef34b0a506a2466870a0cbd2564` |
| `2026-10-19 19:35` | Keep system prompts out of chat and sync card openings to Supabase | Feature | `f9bca5f73aae9190372cb1cee17982d992b0fa87` |
| `2026-10-19 20:47` | Serve chat models from the paid provider and keep soundtrack controls in chat | Feature | `c73ab464e045103dcb25c6db4b0cb71783fce2b6` |
| `2026-11-09 08:40` | Add a local privacy assistant for Ollama and on-device image APIs | Feature | `73013d60b61d23dfc521e74a1fd2d6e8c8aced48` |
| `2026-11-12 20:54` | Scaffold KidVerse AI: COPPA Expo wrapper with three Realms | Feature | `0f984fed9f898ccfcacaac51589e3fe6c5ac2b45` |
| `2026-11-19 16:41` | Fix chat model routing so Llama 3 Erato is the default, not Gemini | Bug Fix | `7ba95a846f59e86499485f3b41d9743e378833e4` |
| `2026-11-19 16:48` | Add VLM persona perception with token-optimized chat injection | Feature | `20d0ab4da724f5a334e9f556daff280045d4136b` |
| `2026-11-19 17:12` | Fix Vercel build by exporting recountTurnTokens from context-manager | Integration & API / External Fault | `c957f9d87adca191c950b6a7ec8002855e67bda5` |
| `2026-11-19 17:12` | Fix Vercel build by exporting recountTurnTokens from context-manager | Integration & API / External Fault | `f415d135fbd9f8f1ae9846c4356a14053bbb05de` |
| `2026-11-19 19:46` | Merge PR #3: VLM persona perception with token-optimized chat injection | Feature | `a2c60313a9838cc742738f7199f91cb4cbdbe235` |
| `2026-11-19 20:10` | Fix empty gallery by adding missing VLM columns at runtime | Database & Schema | `ec53a9f393de7d4931dc462f94e1f95456920818` |
| `2026-11-19 20:13` | Heal VLM columns on nexus schema, not public | Database & Schema | `3fcc377a9c4d58e97b9ca0f7369b31580213e9a3` |
| `2026-11-19 20:30` | Enforce tier context windows, atomic credits, and 402/429 gates | Feature | `aaea0f8b574f951681fc9139a2dfc21a5102eb26` |
| `2026-11-19 20:36` | Replace ComfyUI scenes with fal.ai flux-2 and prompt enrichment | Integration & API / External Fault | `60f7330ab4d2782145428f48e5c4c844701a42f6` |
| `2026-11-19 20:40` | Add escalating reroll costs and generation cooldowns | Feature | `762f2608da407e68a01ece85123c476bf19819f0` |
| `2026-11-19 20:46` | Add Trust & Safety gates, prompt moderation, and fal user hashes | Integration & API / External Fault | `00d0af7f23c872cd56be859258ffd8be6e15356e` |
| `2026-11-19 21:22` | Replace PayPal with SubscribeStar.adult multi-tier billing | Integration & API / External Fault | `6e2ad9a0f2a3df73dabe43e3fea91891738737b9` |
| `2026-11-19 21:24` | Merge subscription credit enforcement into main | Feature | `2dc356c2b1cbc4e10ddb2b4bfc3da715ce599e0e` |
| `2026-11-19 21:26` | Merge Trust & Safety compliance into main and require direct-to-main | UI / UX | `45b9dc43e73729b27b6ad37c8c53758718805365` |
| `2026-11-19 21:26` | Add alwaysApply Cursor rule to ship all work directly to main | Feature | `59f03f4f341b664bfdb0ec38ac604701ebdd6020` |
| `2026-11-19 21:26` | Track .cursor/rules in git while ignoring other Cursor local state | Feature | `8773f1a3a32ccb2ec3faf0148a7831b19aab16cf` |
| `2026-11-19 21:34` | Calibrate SFW/NSFW card rating and reject SFW-field violations | Feature | `fefe3051c7bb12d417a58547b057ee0435440616` |
| `2026-11-19 22:13` | Calibrate VLM underage detection to multi-signal only | Feature | `fedece25a0e7696a433fe866b5e2e31bc2f3ba7d` |
| `2026-11-19 23:09` | Add 50-card SFW batch generator across six genres | Feature | `04fe2a7f3cb392844f528180e07b4687bd487462` |
| `2026-11-19 23:18` | Fix Discover empty list and profile page server crashes | Bug Fix | `34f90e6f86dcf29eed06f555a4089cfa1946028e` |
| `2026-11-19 23:18` | Mirror resilient public profile page into android-app | Feature | `08f7af754aa83863ad9db89a1d8db296270c80ec` |
| `2026-11-19 23:21` | Add Nexus watchdog healthcheck with SMS cooldown alerts | Integration & API / External Fault | `1768799e42b2317bb39d9977b76ace6d0d3a7ca1` |
| `2026-11-19 23:36` | Fix profile page TypeScript so Vercel build succeeds | Integration & API / External Fault | `1443f4f903eb4ac26143d85044ed2a8a5fc2e443` |
| `2026-11-19 23:53` | Fix /u/[username] 404/500 by resolving creator slugs safely | Bug Fix | `bb340618215a2bce210e5c808f85063e6f00f89b` |
| `2026-11-20 01:01` | Frame character card thumbnails without chopping faces or labels | Bug Fix | `109a7baf8f1e0d3f978e725dbcbe5e1e32a44c1f` |
| `2026-11-20 01:42` | Use square card frames so 1024² portraits are not side-cropped | UI / UX | `249f5ce44db592c74ac242bf4ced6c88d1043374` |
| `2026-11-20 04:10` | Auto-fit card images with client resize and contain-frame rendering | UI / UX | `c39ab5e4e9d13fc00a37a01a14e84565adce9efa` |
| `2026-11-20 04:34` | Add card bottom action bar and harden Discover character loading | Bug Fix | `d32954a58a47f38e1ebc7eb5fd20a72f005b65a3` |
| `2026-11-19 21:22` | SQL: `20261119205000_daily_credit_rpcs.sql` | Database & Schema | `android-app/supabase/migrations/20261119205000_daily_credit_rpcs.sql` |
| `2026-11-19 21:21` | SQL: `20261119210000_subscribestar.sql` | Database & Schema | `android-app/supabase/migrations/20261119210000_subscribestar.sql` |
| `2026-11-19 21:24` | SQL: `20261119220000_generation_limits.sql` | Database & Schema | `android-app/supabase/migrations/20261119220000_generation_limits.sql` |
| `2026-11-19 21:24` | SQL: `20261119230000_trust_safety.sql` | Database & Schema | `android-app/supabase/migrations/20261119230000_trust_safety.sql` |
| `2026-11-18 20:24` | SQL: `20261016180000_world_engine.sql` | Database & Schema | `nextjs_space/supabase/migrations/20261016180000_world_engine.sql` |
| `2026-11-18 20:24` | SQL: `20261019150000_lorebooks.sql` | Database & Schema | `nextjs_space/supabase/migrations/20261019150000_lorebooks.sql` |
| `2026-11-19 19:46` | SQL: `20261119170000_chat_model_defaults.sql` | Database & Schema | `nextjs_space/supabase/migrations/20261119170000_chat_model_defaults.sql` |
| `2026-11-19 20:13` | SQL: `20261119180000_persona_visual_fields.sql` | Database & Schema | `nextjs_space/supabase/migrations/20261119180000_persona_visual_fields.sql` |
| `2026-11-19 21:22` | SQL: `20261119205000_daily_credit_rpcs.sql` | Database & Schema | `nextjs_space/supabase/migrations/20261119205000_daily_credit_rpcs.sql` |
| `2026-11-19 21:20` | SQL: `20261119210000_subscribestar.sql` | Database & Schema | `nextjs_space/supabase/migrations/20261119210000_subscribestar.sql` |
| `2026-11-19 21:24` | SQL: `20261119220000_generation_limits.sql` | Database & Schema | `nextjs_space/supabase/migrations/20261119220000_generation_limits.sql` |
| `2026-11-19 21:24` | SQL: `20261119230000_trust_safety.sql` | Database & Schema | `nextjs_space/supabase/migrations/20261119230000_trust_safety.sql` |
| `2026-11-18 20:24` | SQL: `card_and_profile_comments.sql` | Database & Schema | `nextjs_space/supabase/migrations/card_and_profile_comments.sql` |
| `2026-11-18 20:24` | SQL: `profiles_tos.sql` | Database & Schema | `nextjs_space/supabase/migrations/profiles_tos.sql` |
| `2026-11-19 19:46` | SQL: `schema.sql` | Database & Schema | `nextjs_space/supabase/schema.sql` |

---

## Appendix A — Repository Topology

| Path | Role |
|---|---|
| `nextjs_space/` | Primary Next.js web app (Vercel) |
| `android-app/` | Android / Capacitor mirror of web surfaces |
| `mobile-build/` | Mobile build assets |
| `nextjs_space/supabase/` | Schema + SQL migrations |
| `nextjs_space/prisma/schema.prisma` | Prisma ORM model |
| `docs/NEXUS_WATCHDOG.md` | Watchdog / healthcheck ops notes |

## Appendix B — Environment Caveats

- This report was produced on a **Cursor Cloud Agent Linux VM**, not a local Windows workstation.
- Requested Windows destination `C:\Users\%USERNAME%\Documents\...` is **not available** here; the Linux equivalent used is `/home/ubuntu/Documents/NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md`.
- Folders named `cursor_Nexus_AI_project` and `nexus_rollplay` were **not present** anywhere searchable on this host (`/`, `/agent`, `/home`, `/opt`).
- Git timestamps reflect recorded author dates in the repository; SQL timestamps reflect filesystem mtimes on this snapshot (which may cluster around environment image build time).

---

---

## Appendix C — Follow-up scan (2026-11-20 05:10 UTC / 2026-11-19 21:10 America/Los_Angeles)

Supplement produced after the original Cloud Agent audit (`040ddc9` era) to capture commits and host clues that landed afterward, plus any Windows-side folder signals visible to this run.

### C.1 Additional Git commits (not in the original 80-commit timeline)

| Timestamp (UTC) | Commit | Author | Category | Summary |
|---|---|---|---|---|
| `2026-11-20 04:50` | `040ddc9` (`040ddc9df219f85fbc5e5a8a438c7728af8cb955`) | Cursor Agent | Feature | Add professional Nexus AI engineering audit report. |
| `2026-11-20 05:05` | `6d06311` (`6d06311d3fef3402ceebae1e9d89da08cd4a8f9a`) | Cursor Agent | Integration & API / External Fault | Harden watchdog for missing secrets and keep it out of Next builds. |

**Revised unique commit total (all branches on this checkout):** **82**.

### C.2 SQL / migration files

Re-scanned `nextjs_space/supabase` and `android-app/supabase`. **Still 15 SQL files** — no new `.sql` artifacts since the original audit. Filesystem mtimes unchanged from the tables in §3 / §5.

### C.3 Windows filesystem / alternate project folders

| Probe | Result |
|---|---|
| This Cloud Agent Linux VM mounts of `C:\`, `/mnt/c`, OneDrive/Dropbox sync | **Not present** |
| GitHub repos for `nexus_rollplay` / `cursor_Nexus_AI_project` under `faithfulness354-source` | **Not found** (only `nexus-ai`) |
| Folders named `cursor_Nexus_AI_project`, `nexus_rollplay` on this VM | **Not found** |
| Connected Cursor self-hosted workers (Windows host `victus`) | **2 idle workers** |

**Windows paths inferred from connected self-hosted worker metadata (not a recursive disk walk):**

| Path | Source |
|---|---|
| `C:\Users\faith\Downloads\kidverse-ai-standalone\kidverse-ai` | Worker displayName |
| `C:\Users\faith\Downloads\kidverse-ai-standalone\palforge-ai` | Worker displayName |
| `C:\Users\faith\Documents\NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md` | Intended Documents destination (Windows username `faith`) |

Those Downloads paths are **KidVerse / PalForge** worker checkouts, not additional Nexus AI commit histories. No extra Nexus SQL files or Nexus commits were discoverable from worker metadata alone.

### C.4 Report copy locations on this host

| Location | Path |
|---|---|
| Repo workspace | `/agent/repos/nexus-ai/NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md` |
| Linux Documents | `/home/ubuntu/Documents/NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md` |
| Agent artifacts | `/opt/cursor/artifacts/NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md` |
| GitHub (main) | `https://github.com/faithfulness354-source/nexus-ai/blob/main/NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md` |
| Raw download | `https://raw.githubusercontent.com/faithfulness354-source/nexus-ai/main/NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md` |

### C.5 Windows Documents install helper

A PowerShell helper is in-repo at `scripts/save-audit-report-to-documents.ps1`. On the Windows machine it writes:

`C:\Users\faith\Documents\NEXUS_AI_PROFESSIONAL_AUDIT_REPORT.md`

---

*End of report.*
