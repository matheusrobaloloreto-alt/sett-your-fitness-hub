
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('evaluations', 'evaluations', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('platform-assets', 'platform-assets', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('whatsapp-media', 'whatsapp-media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('exercises-videos', 'exercises-videos', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for platform-assets (public read)
CREATE POLICY "Public read platform assets" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'platform-assets');
CREATE POLICY "Auth upload platform assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'platform-assets');
CREATE POLICY "Auth update platform assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'platform-assets');

-- Storage policies for exercises-videos (public read)
CREATE POLICY "Public read exercises videos" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'exercises-videos');
CREATE POLICY "Auth upload exercises videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'exercises-videos');
CREATE POLICY "Auth update exercises videos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'exercises-videos');
CREATE POLICY "Auth delete exercises videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'exercises-videos');

-- Storage policies for whatsapp-media (public read)
CREATE POLICY "Public read whatsapp media" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'whatsapp-media');
CREATE POLICY "Auth upload whatsapp media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'whatsapp-media');

-- Storage policies for evaluations (private)
CREATE POLICY "Auth read evaluations" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'evaluations');
CREATE POLICY "Auth upload evaluations" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evaluations');
CREATE POLICY "Auth delete evaluations" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'evaluations');
