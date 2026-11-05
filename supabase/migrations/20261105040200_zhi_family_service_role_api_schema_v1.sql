-- Expose the private family schema to PostgREST's schema cache only.
-- anon/authenticated retain NO USAGE or table privileges; service_role remains the only data-plane caller.
alter role authenticator set pgrst.db_schemas = 'public, storage, graphql_public, zhi_family';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
