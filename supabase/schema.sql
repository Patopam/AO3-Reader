-- ==============================================================================
-- AO3 READER — SUPABASE DATABASE SCHEMA & MULTI-DEVICE CLOUD SYNC
-- ==============================================================================
-- Architecture: Hybrid Local-First.
-- Local Dexie.js (IndexedDB) provides instant, 0ms latency offline reading.
-- Supabase PostgreSQL and Supabase Storage provide real-time multi-device sync.
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE: fics (Metadata, Tags, Reading State)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.fics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    local_id BIGINT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    summary TEXT,
    fandom TEXT,
    fandoms TEXT[] DEFAULT '{}',
    relationships TEXT[] DEFAULT '{}',
    characters TEXT[] DEFAULT '{}',
    additional_tags TEXT[] DEFAULT '{}',
    warnings TEXT[] DEFAULT '{}',
    category TEXT[] DEFAULT '{}',
    rating TEXT,
    word_count BIGINT,
    chapter_count INTEGER DEFAULT 1,
    publication_status TEXT DEFAULT 'Unknown',
    published_at TEXT,
    language TEXT,
    format TEXT DEFAULT 'epub', -- 'epub' | 'pdf'
    source TEXT DEFAULT 'local', -- 'local' | 'gdrive' | 'url'
    is_favorite BOOLEAN DEFAULT false,
    is_read BOOLEAN DEFAULT false,
    last_read_at BIGINT,
    reading_progress INTEGER DEFAULT 0, -- 0 to 100 percentage
    current_chapter_idx INTEGER DEFAULT 0,
    current_pdf_page INTEGER DEFAULT 1,
    current_scroll_position BIGINT DEFAULT 0,
    current_scroll_ratio NUMERIC(5, 4) DEFAULT 0,
    notes TEXT,
    chapters_json JSONB DEFAULT '[]'::jsonb,
    full_text_content TEXT,
    storage_path TEXT, -- Reference to Supabase Storage file
    file_size BIGINT DEFAULT 0,
    imported_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
    CONSTRAINT unique_user_local_fic UNIQUE (user_id, local_id)
);

-- ==============================================================================
-- 3. TABLE: reading_progress (Granular Multi-Device Reading Timeline)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.reading_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fic_id UUID REFERENCES public.fics(id) ON DELETE CASCADE,
    local_id BIGINT,
    progress INTEGER NOT NULL DEFAULT 0,
    chapter_idx INTEGER DEFAULT 0,
    pdf_page INTEGER DEFAULT 1,
    scroll_position BIGINT DEFAULT 0,
    scroll_ratio NUMERIC(5, 4) DEFAULT 0,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
    CONSTRAINT unique_user_fic_progress UNIQUE (user_id, fic_id)
);

-- ==============================================================================
-- 4. TABLE: user_preferences (Reader theme, font family, display sizes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'default', -- 'default' | 'sepia' | 'dark'
    font_family TEXT DEFAULT 'serif', -- 'serif' | 'sans' | 'mono'
    font_size INTEGER DEFAULT 18,
    content_width TEXT DEFAULT 'normal', -- 'compact' | 'normal' | 'wide' | 'full'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.fics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Policies for public.fics
CREATE POLICY "Users can view their own fics"
    ON public.fics FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fics"
    ON public.fics FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fics"
    ON public.fics FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fics"
    ON public.fics FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Policies for public.reading_progress
CREATE POLICY "Users can view their own reading progress"
    ON public.reading_progress FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reading progress"
    ON public.reading_progress FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reading progress"
    ON public.reading_progress FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policies for public.user_preferences
CREATE POLICY "Users can view their own preferences"
    ON public.user_preferences FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert or update their own preferences"
    ON public.user_preferences FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 6. PERFORMANCE & QUERY OPTIMIZATION INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_fics_user_id ON public.fics(user_id);
CREATE INDEX IF NOT EXISTS idx_fics_user_updated ON public.fics(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fics_user_last_read ON public.fics(user_id, last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_fics_user_local_id ON public.fics(user_id, local_id);
CREATE INDEX IF NOT EXISTS idx_fics_user_favorites ON public.fics(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_fics_user_read ON public.fics(user_id, is_read);

-- GIN indexes for tag & fandom array filtering
CREATE INDEX IF NOT EXISTS idx_fics_fandoms_gin ON public.fics USING GIN (fandoms);
CREATE INDEX IF NOT EXISTS idx_fics_tags_gin ON public.fics USING GIN (additional_tags);
CREATE INDEX IF NOT EXISTS idx_fics_characters_gin ON public.fics USING GIN (characters);
CREATE INDEX IF NOT EXISTS idx_fics_relationships_gin ON public.fics USING GIN (relationships);

-- ==============================================================================
-- 7. SUPABASE STORAGE BUCKET: fics-files
-- ==============================================================================
-- Insert the bucket into storage.buckets if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fics-files',
    'fics-files',
    false, -- Private bucket: access protected via user folder matching
    104857600, -- 100 MB max file size
    ARRAY['application/epub+zip', 'application/pdf', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies: Users can only upload and read files in their own user_id directory
CREATE POLICY "Users can view their own stored files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'fics-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can upload their own files"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'fics-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can update their own files"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'fics-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete their own files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'fics-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
