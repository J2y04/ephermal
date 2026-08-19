ALTER TABLE public.store_intelligence DROP CONSTRAINT IF EXISTS store_intelligence_user_id_key;
DELETE FROM public.store_intelligence WHERE user_id = 'test_diagnostic_user';
