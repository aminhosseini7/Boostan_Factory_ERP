# One-time GitHub update

When this integrated package replaces the current local repository:

1. Keep your existing `.git` folder.
2. Back up the current project folder.
3. Replace the project files with the contents of this package (do not copy any real `.env` to GitHub).
4. Restore/create `backend/.env` and `frontend/.env` locally from the example files.
5. Run the database upgrade script in Supabase.
6. Run local install/build/tests.
7. Then commit once:

```bash
git add .
git commit -m "Integrate complete Boostan Factory ERP release candidate"
git push
```

The `.gitignore` keeps real environment files out of the repository.
