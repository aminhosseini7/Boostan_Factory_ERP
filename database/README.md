# Database

For a new Supabase project, run `schema.sql` once in SQL Editor.

For the early prototype database already created during development, back up the database and run `upgrade_from_prototype.sql`. It adds the fields/tables/views needed by the integrated ERP without intentionally dropping existing data.

After the schema is ready, configure `backend/.env` and run `npm run seed:manager` from the backend directory.
