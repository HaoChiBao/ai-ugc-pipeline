-- DANGER: Deletes ALL tables, data, and non-system objects in schema `public`.
-- Run only in a dev/staging project. After running, re-apply migrations:
--   cd client && npm run db:migrate
-- or: npm run db:push

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
