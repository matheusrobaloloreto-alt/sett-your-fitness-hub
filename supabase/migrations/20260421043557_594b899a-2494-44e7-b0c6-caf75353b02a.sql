CREATE OR REPLACE FUNCTION public.unaccent_simple(t text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(t,
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN');
$$;