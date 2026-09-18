# Security notes

- No public user registration route.
- Passwords are bcrypt-hashed.
- JWTs expire and are required for protected APIs.
- Role checks are performed server-side.
- Helmet, CORS restrictions and rate limiting are enabled.
- Secrets belong only in `.env`, which is ignored by Git.
- Before production use, rotate any secret/password previously shared in chat or screenshots.
- Keep Supabase backups and test migrations before applying them to important data.
