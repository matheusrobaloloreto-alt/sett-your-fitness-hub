UPDATE public.platform_settings
SET primary_color = '#1D2D5C',
    background_color = '#FAFAF7',
    card_color = '#F2F0EA',
    text_color = '#0A0A0A',
    platform_title = 'Set Training App'
WHERE primary_color IN ('#1d4ed8', '#0042aa', '#1D4ED8', '#0042AA')
   OR background_color IN ('#121212', '#1a1a1a', '#ffffff', '#FFFFFF')
   OR platform_title ILIKE 'BN%';