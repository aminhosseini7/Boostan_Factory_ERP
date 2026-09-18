# Windows setup (one-time)

1. Keep your current `.git` folder when replacing the repository files with this package.
2. Do not delete your local `backend/.env` if it already contains the working Supabase connection. If it does not exist, copy `backend/.env.example` to `backend/.env` and fill it.
3. For the existing prototype Supabase database, back it up and run `database/upgrade_from_prototype.sql` in Supabase SQL Editor.
4. In the project root run:

```cmd
npm install
npm test
npm run build
```

5. Create the first manager once:

```cmd
cd backend
npm run seed:manager
cd ..
```

6. Start the backend and frontend in two CMD windows, or run `run-local.bat`.
7. Open the Vite URL (normally `http://localhost:5173`).
8. Follow `tests/END_TO_END.md` before using real factory data.

When everything is verified, commit and push once using `documentation/GITHUB_UPDATE_ONCE.md`.
