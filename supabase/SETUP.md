# Accounts setup: email magic link + Google sign-in (Supabase)

Without these steps the app runs in **guest mode**: no accounts, no email collected, everything
stays in the visitor's browser. With them, the sign-in dialog offers **Continue with Google** and
**Email me a sign-in link**.

You need: a Supabase account (free tier is fine) and a Google account for Google Cloud Console.
Allow about 15 minutes.

## 1. Create the Supabase project

1. Create a project at https://supabase.com/dashboard.
2. **SQL Editor** → paste the whole of [`schema.sql`](./schema.sql) → **Run**. This creates the
   private `profiles`, `feedback` and `demonstrations` tables with row-level security and the
   `delete_my_account()` function. It is safe to re-run.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
4. In the repo root, create `.env.local` (git-ignored) with:

   ```bash
   VITE_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
   VITE_SUPABASE_ANON_KEY="YOUR-ANON-KEY"
   ```

   The anon key is designed to be public in the browser; row-level security protects the data.
   **Never** put the `service_role` key in any `VITE_` variable.
5. Restart `npm run dev`.

## 2. Email magic links

1. **Authentication → Providers → Email**: keep **Email** enabled. Passwords are not used by the app.
2. **Authentication → URL Configuration**:
   - **Site URL**: your deployed URL (for local development, `http://localhost:3000`).
   - **Redirect URLs**: add `http://localhost:3000` and your production URL.
3. The built-in Supabase mailer is rate-limited (a few emails per hour). For real use, add your own
   SMTP under **Project Settings → Authentication → SMTP Settings**.

## 3. Google sign-in

1. In Google Cloud Console → **APIs & Services → OAuth consent screen**: user type **External**;
   app name "AxisLab"; scopes: only the defaults (`openid`, `email`, `profile`).
2. **Credentials → Create credentials → OAuth client ID** → **Web application**:
   - **Authorized JavaScript origins**: `http://localhost:3000` and your production URL.
   - **Authorized redirect URI**: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
     (shown on the Supabase Google provider page).
3. Copy the **Client ID** and **Client secret** into Supabase → **Authentication → Providers →
   Google** → enable → save.

## What is stored (privacy model)

| Data | Where | Who can read it |
| :--- | :--- | :--- |
| Email address | Supabase Auth only (`auth.users`) | The user; project admins |
| Display name, bio, avatar color, simulator defaults | `public.profiles` | Only that user (RLS) |
| Saved demonstrations | `public.demonstrations` | Only that user (RLS) |
| Feedback (optional email) | `public.feedback` | The submitting user (RLS); project admins |
| Guest profile and work | The visitor's browser (`localStorage`) | Only that browser |

- No app table copies the email address. Older versions did; `schema.sql` drops those copies when
  re-run on an existing project.
- **Delete account** in the profile dialog calls `delete_my_account()`, which deletes the auth user.
  The profile and demonstrations cascade-delete, and the user's feedback is anonymized.
- Google sign-in requests only the default `openid email profile` scopes. A name from Google is
  used as the initial display name; the profile photo is not stored.
