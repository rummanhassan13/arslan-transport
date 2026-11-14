# Backups: setup and restore guide

Every night, an automatic job on GitHub:
1. Saves a **full copy of the database** (all companies, shipments, invoices, payments, logins). The copy is locked with a password only you know.
2. Copies **every new attachment file** (photos, PDFs) into a separate backup storage area. It only ever adds files; it never deletes or overwrites anything there.
3. Keeps the last **35 days** of database copies. Attachment files are kept forever.

Everything stays on free plans:

| Service | Free limit | What the backup uses |
|---|---|---|
| GitHub Actions (private repo) | 2,000 minutes / month | about 3–5 minutes a night |
| Cloudflare R2 storage | 10 GB total across all buckets | one extra copy of your files, plus about 35 small database copies |

> **Check before starting:** in Cloudflare → R2, look at how much space your current bucket uses. The backup roughly doubles it. If you're already above about 4 GB, tell your developer first, so you don't go past the free 10 GB.

The code is in `.github/workflows/nightly-backup.yml` and `.github/workflows/test-restore.yml`. Until you finish the steps below, the nightly job does nothing and shows a green tick.

---

## Part 1 — Cloudflare R2 (about 10 minutes)

Open https://dash.cloudflare.com → **R2 Object Storage** in the left menu.

**1. Note your current bucket's name.** It's in the list on the R2 overview page (the bucket that holds your attachments). Write it down; this is `R2_SOURCE_BUCKET`.

**2. Create the backup bucket**
- Click **Create bucket** → name it `arslan-backups` → leave the other settings as they are → **Create bucket**.
- Do **not** turn on public access for it.
- `R2_BACKUP_BUCKET` = `arslan-backups`

**3. Copy the storage address**
- On the R2 overview page, find **Account details** → **S3 API**. It looks like `https://<long-id>.r2.cloudflarestorage.com`.
- Copy it **without** a bucket name on the end. This is `R2_ENDPOINT`.

**4. Create key #1 — can only READ your attachment bucket**
- R2 overview → **Manage API tokens** (or **API** → **Manage API tokens**) → **Create API token** (an Account API token is fine).
- Name: `backup-read-attachments`
- Permissions: **Object Read only**
- Specify bucket: **Apply to specific buckets only** → choose your attachment bucket (from step 1).
- Click **Create**. Copy the **Access Key ID** and the **Secret Access Key** now. Cloudflare shows the secret only once.
  - `R2_SOURCE_ACCESS_KEY_ID` = Access Key ID
  - `R2_SOURCE_SECRET_ACCESS_KEY` = Secret Access Key

**5. Create key #2 — can only write to the backup bucket**
- Same page → **Create API token**
- Name: `backup-write-backups`
- Permissions: **Object Read & Write**
- Specify bucket: **Apply to specific buckets only** → `arslan-backups`
- **Create**, then copy both values:
  - `R2_BACKUP_ACCESS_KEY_ID`
  - `R2_BACKUP_SECRET_ACCESS_KEY`

**6. Lock the files so nobody can delete them (recommended)**
- Open the `arslan-backups` bucket → **Settings** → **Bucket lock rules** → **Add rule**. Name: `keep-30-days`, leave the prefix empty, retention **30 days** → Save.
- Open your **attachment bucket** → **Settings** → **Bucket lock rules** → **Add rule**. Name: `keep-90-days`, leave the prefix empty, retention **90 days** → Save.
- After this, even someone holding a storage key can't delete a file before it's that old. The app never deletes files from R2, so nothing breaks. Keep the backup lock **under 35 days**, or the nightly cleanup of old database copies will fail.

---

## Part 2 — Supabase database address (about 3 minutes)

1. Open https://supabase.com/dashboard/project/golhuycibplkcdokxshp and click **Connect** at the top.
2. Choose the **Session pooler** tab. (Not "Direct connection": GitHub can't reach that one.)
3. Copy the URI. It looks like:
   `postgresql://postgres.golhuycibplkcdokxshp:[YOUR-PASSWORD]@aws-0-xx-xxxx-x.pooler.supabase.com:5432/postgres`
4. Replace `[YOUR-PASSWORD]` (including the brackets) with your **database password**.
   - Forgot it, or it contains symbols like `@ # / ? % :`? Go to **Project Settings → Database → Reset database password** and choose a long password made only of letters and numbers. This is safe: the website doesn't use this password.
5. The finished address is `SUPABASE_DB_URL`.

---

## Part 3 — Backup password (1 minute)

Choose a long password (at least **16 characters**) to lock the database copies.
- Save it in a password manager, **and** write it on paper kept somewhere safe.
- **If this password is lost, the database backups can never be opened.** Nobody can recover it.
- This is `BACKUP_PASSPHRASE`.

---

## Part 4 — Save the 9 secrets in GitHub (about 5 minutes)

Open https://github.com/rummanhassan13/arslan-transport/settings/secrets/actions → **New repository secret**. Add each of these exactly (name on the left, value on the right):

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the address from Part 2 |
| `BACKUP_PASSPHRASE` | the password from Part 3 |
| `R2_ENDPOINT` | the S3 API address from Part 1, step 3 |
| `R2_SOURCE_BUCKET` | your attachment bucket name (Part 1, step 1) |
| `R2_SOURCE_ACCESS_KEY_ID` | key #1 Access Key ID |
| `R2_SOURCE_SECRET_ACCESS_KEY` | key #1 Secret Access Key |
| `R2_BACKUP_BUCKET` | `arslan-backups` |
| `R2_BACKUP_ACCESS_KEY_ID` | key #2 Access Key ID |
| `R2_BACKUP_SECRET_ACCESS_KEY` | key #2 Secret Access Key |

GitHub hides these values once they're saved. Nobody can read them back, not even you, and they're never shown in the code or the logs.

---

## Part 5 — Run the first backup (2 minutes)

1. Open https://github.com/rummanhassan13/arslan-transport/actions → click **Nightly backup** on the left → **Run workflow** → **Run workflow**.
2. Wait a few minutes. A **green tick** means it worked. A **red cross** means something failed: click it, then send the error to your developer.
3. In Cloudflare, open the `arslan-backups` bucket. You should see a `database/` folder with one file and a `files/` folder with your attachments.

From now on it runs every night at about 01:30 UAE time. If a night fails, GitHub emails you.

---

## Part 6 — Prove the backup works (every 3 months, about 10 minutes)

A backup you've never restored is only a hope. This test loads the newest backup into a **separate, empty test project**, never your live one.

1. In Supabase, click **New project** → name it `arslan-restore-test` → choose any database password → create it. (The free plan allows 2 projects.)
2. In the test project, click **Connect** → **Session pooler** → copy the URI and put in its password (same as Part 2).
3. In GitHub secrets, add `RESTORE_DB_URL` = that address.
4. Open https://github.com/rummanhassan13/arslan-transport/actions → **Test restore** → **Run workflow** → type `RESTORE TEST` in the box → **Run workflow**.
5. When it finishes, open the run and look at the last step, **Count rows**. The numbers (shipments, invoices, drivers…) should match your live app.
6. Afterwards, **delete the test project** (Project Settings → General → Delete project) and delete the `RESTORE_DB_URL` secret. Next time, create a fresh test project; the restore only works into an empty project.

The test refuses to run if `RESTORE_DB_URL` points at the live project.

---

## In a real emergency

Don't try to fix live data in a hurry. Contact your developer and say which day's data you need. The usual steps:
1. Restore the right day's backup into a new project (as in Part 6, choosing the file name in the **backup_file** box).
2. Check the data there.
3. Either copy back only what was lost, or point the app at the restored project.

Attachment files are in the `arslan-backups` bucket under `files/`, in the same folders as the original bucket, so they can be copied back exactly.
