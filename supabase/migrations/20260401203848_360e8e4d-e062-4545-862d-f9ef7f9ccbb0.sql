-- Insert muscle targets for all exercises in the student's workouts
-- Peito exercises
INSERT INTO public.exercise_muscle_targets (exercise_id, muscle_group_id, role, volume_percentage, is_primary) VALUES
-- Supino Inclinado Halteres → Peitoral (primary), Deltoide Anterior (secondary), Tríceps (secondary)
('5c3558f8-01c1-43a4-bf9b-0d6993c80b80', '835ef882-94b4-4911-9202-d6ebc143192d', 'primary', 100, true),
('5c3558f8-01c1-43a4-bf9b-0d6993c80b80', '22b24c2d-1841-4dc9-bc60-34469abd2e18', 'secondary', 30, false),
('5c3558f8-01c1-43a4-bf9b-0d6993c80b80', '6b925fc8-cf05-40aa-a5f8-18418d7439c4', 'secondary', 30, false),
-- Supino Reto Barra → Peitoral (primary), Deltoide Anterior (secondary), Tríceps (secondary)
('af9f3a0e-3260-4842-a0ac-da874cdda030', '835ef882-94b4-4911-9202-d6ebc143192d', 'primary', 100, true),
('af9f3a0e-3260-4842-a0ac-da874cdda030', '22b24c2d-1841-4dc9-bc60-34469abd2e18', 'secondary', 30, false),
('af9f3a0e-3260-4842-a0ac-da874cdda030', '6b925fc8-cf05-40aa-a5f8-18418d7439c4', 'secondary', 30, false),
-- Cross Over Polia Alta → Peitoral (primary)
('b551a0d4-326f-4b4c-b909-8af4929130b2', '835ef882-94b4-4911-9202-d6ebc143192d', 'primary', 100, true),
-- Crucifixo Inclinado Halteres → Peitoral (primary), Deltoide Anterior (secondary)
('c2df4c00-a3c7-4ed2-9310-a58b1971fa6f', '835ef882-94b4-4911-9202-d6ebc143192d', 'primary', 100, true),
('c2df4c00-a3c7-4ed2-9310-a58b1971fa6f', '22b24c2d-1841-4dc9-bc60-34469abd2e18', 'secondary', 20, false),
-- Tríceps Polia Corda → Tríceps (primary)
('3cc40978-bc88-4d1c-88b4-670d761db741', '6b925fc8-cf05-40aa-a5f8-18418d7439c4', 'primary', 100, true),
-- Tríceps Polia Barra → Tríceps (primary)
('d06f7cc9-380d-4fb1-9b60-5bd92a25dc22', '6b925fc8-cf05-40aa-a5f8-18418d7439c4', 'primary', 100, true),

-- Costas exercises
-- Puxada Pronada Polia → Dorsal (primary), Bíceps (secondary)
('f0d967d8-ff18-4881-8c28-aca104bf5ac6', '6e97ad9f-0428-4513-a00f-08e6421c8597', 'primary', 100, true),
('f0d967d8-ff18-4881-8c28-aca104bf5ac6', '78d9b019-e1b3-4119-b4fe-fca633945cb6', 'secondary', 40, false),
-- Remada Curvada Pronada Barra → Dorsal (primary), Bíceps (secondary), Trapézio (secondary)
('264a644f-ca52-4837-9112-472a4be128e8', '6e97ad9f-0428-4513-a00f-08e6421c8597', 'primary', 100, true),
('264a644f-ca52-4837-9112-472a4be128e8', '78d9b019-e1b3-4119-b4fe-fca633945cb6', 'secondary', 30, false),
('264a644f-ca52-4837-9112-472a4be128e8', 'a269b423-1a11-4e8a-92d1-ed1293aeab47', 'secondary', 20, false),
-- Remada Baixa Neutra → Dorsal (primary), Bíceps (secondary)
('0db0d50d-5d72-4ade-97f2-3ec1c64218d8', '6e97ad9f-0428-4513-a00f-08e6421c8597', 'primary', 100, true),
('0db0d50d-5d72-4ade-97f2-3ec1c64218d8', '78d9b019-e1b3-4119-b4fe-fca633945cb6', 'secondary', 30, false),
-- Pulldown Unilateral → Dorsal (primary), Bíceps (secondary)
('2b544004-7438-4adf-8d5f-de505cb8d404', '6e97ad9f-0428-4513-a00f-08e6421c8597', 'primary', 100, true),
('2b544004-7438-4adf-8d5f-de505cb8d404', '78d9b019-e1b3-4119-b4fe-fca633945cb6', 'secondary', 30, false),
-- Rosca Direta Barra W → Bíceps (primary)
('10491624-ea5f-41e7-b3ce-15013e899b8d', '78d9b019-e1b3-4119-b4fe-fca633945cb6', 'primary', 100, true),
-- Rosca Martelo Halteres → Bíceps (primary), Braquiorradial (secondary)
('f42f4b07-35f7-4deb-872e-3f1987a3dc89', '78d9b019-e1b3-4119-b4fe-fca633945cb6', 'primary', 100, true),
('f42f4b07-35f7-4deb-872e-3f1987a3dc89', '005324af-3051-4331-b6b3-7e3eb0581d6c', 'secondary', 50, false),

-- Quadríceps exercises
-- Agachamento Livre → Quadríceps (primary), Glúteo (secondary)
('e1000001-0000-0000-0000-000000000010', '3db82e92-5908-410e-91a2-9a62cc2bea46', 'primary', 100, true),
('e1000001-0000-0000-0000-000000000010', '5cbe97cd-5ae8-4fbe-9f30-5b37203a19d5', 'secondary', 50, false),
-- Leg Press 45 → Quadríceps (primary), Glúteo (secondary)
('afcab7c3-ba4f-4178-946f-eea2e6969e93', '3db82e92-5908-410e-91a2-9a62cc2bea46', 'primary', 100, true),
('afcab7c3-ba4f-4178-946f-eea2e6969e93', '5cbe97cd-5ae8-4fbe-9f30-5b37203a19d5', 'secondary', 40, false),
-- Cadeira Extensora → Quadríceps (primary)
('619df5e8-b0fc-4229-ad64-b185e41903ee', '3db82e92-5908-410e-91a2-9a62cc2bea46', 'primary', 100, true),
-- Afundo Halteres → Quadríceps (primary), Glúteo (secondary)
('75be10d2-4087-4b4d-9a88-c04f9bdb1a30', '3db82e92-5908-410e-91a2-9a62cc2bea46', 'primary', 100, true),
('75be10d2-4087-4b4d-9a88-c04f9bdb1a30', '5cbe97cd-5ae8-4fbe-9f30-5b37203a19d5', 'secondary', 40, false),
-- Panturrilha em Pé Máquina → Panturrilha (primary)
('1d8626a7-58e1-40d3-8ca8-396b57c233eb', '5f32c4c4-b043-4dd5-a65b-a22ecdb64573', 'primary', 100, true),

-- Ombros exercises
-- Desenvolvimento Halteres Sentado → Deltoide Anterior (primary), Deltoide Lateral (secondary), Tríceps (secondary)
('f65e178d-2fb9-467d-8ec7-153df01be7bb', '22b24c2d-1841-4dc9-bc60-34469abd2e18', 'primary', 100, true),
('f65e178d-2fb9-467d-8ec7-153df01be7bb', '3f48c850-84a5-46f3-ae18-ad9450a5d929', 'secondary', 40, false),
('f65e178d-2fb9-467d-8ec7-153df01be7bb', '6b925fc8-cf05-40aa-a5f8-18418d7439c4', 'secondary', 20, false),
-- Elevação Lateral Halteres → Deltoide Lateral (primary)
('15968ffd-1b58-4859-b181-a8b9485a853c', '3f48c850-84a5-46f3-ae18-ad9450a5d929', 'primary', 100, true),
-- Crucifixo Invertido Curvado → Deltoide Posterior (primary)
('cad889ac-c8da-4654-b27a-41555e10f212', '64d81d34-cb15-44d0-b460-5cd209c664e3', 'primary', 100, true),
-- Elevação Frontal Halteres Neutra → Deltoide Anterior (primary)
('713da3c2-14c9-4d74-8f7e-8a35d7ca21dd', '22b24c2d-1841-4dc9-bc60-34469abd2e18', 'primary', 100, true),
-- Supino Fechado Barra → Tríceps (primary), Peitoral (secondary)
('1173e1a7-fa43-4cd2-a1fd-811419b9e7d2', '6b925fc8-cf05-40aa-a5f8-18418d7439c4', 'primary', 100, true),
('1173e1a7-fa43-4cd2-a1fd-811419b9e7d2', '835ef882-94b4-4911-9202-d6ebc143192d', 'secondary', 30, false),

-- Posterior exercises
-- Stiff Barra → Posterior de Coxa (primary), Glúteo (secondary), Lombar (secondary)
('e07a88c2-da55-42e7-935a-1b53261381c6', '77d093d5-0a62-4b1f-b47f-b981e8af19fa', 'primary', 100, true),
('e07a88c2-da55-42e7-935a-1b53261381c6', '5cbe97cd-5ae8-4fbe-9f30-5b37203a19d5', 'secondary', 40, false),
('e07a88c2-da55-42e7-935a-1b53261381c6', '7e57b708-c05c-4532-9d80-45d1c6f7e078', 'secondary', 30, false),
-- Mesa Flexora → Posterior de Coxa (primary)
('9a07c179-37e8-4d8f-9ae9-0f399b1624b2', '77d093d5-0a62-4b1f-b47f-b981e8af19fa', 'primary', 100, true),
-- Cadeira Flexora → Posterior de Coxa (primary)
('961f2121-1053-4f1f-9376-86f21cb9e68b', '77d093d5-0a62-4b1f-b47f-b981e8af19fa', 'primary', 100, true),
-- Agachamento Búlgaro → Quadríceps (primary), Glúteo (secondary), Posterior (secondary)
('c452607e-7dff-463d-adb2-a712059a8d26', '3db82e92-5908-410e-91a2-9a62cc2bea46', 'primary', 100, true),
('c452607e-7dff-463d-adb2-a712059a8d26', '5cbe97cd-5ae8-4fbe-9f30-5b37203a19d5', 'secondary', 40, false),
('c452607e-7dff-463d-adb2-a712059a8d26', '77d093d5-0a62-4b1f-b47f-b981e8af19fa', 'secondary', 30, false),
-- Panturrilha Sentado Máquina → Panturrilha (primary)
('7bc7e3ba-a138-4a2b-b069-e6eb642ebe90', '5f32c4c4-b043-4dd5-a65b-a22ecdb64573', 'primary', 100, true)
ON CONFLICT DO NOTHING;