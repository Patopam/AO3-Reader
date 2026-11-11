-- ==============================================================================
-- AO3 READER — SUPABASE DATABASE SCHEMA
-- Path: lib/supabase/schema.sql
-- ==============================================================================
-- Architecture: Hybrid Local-First & Cloud Synchronization.
-- Primary local database: Dexie.js (IndexedDB) for zero-latency offline reading.
-- Cloud synchronization: Supabase PostgreSQL + Supabase Storage for multi-device sync.
-- Tables defined: users, fics, reading_progress, user_preferences.
-- Includes: Row Level Security (RLS) user isolation policies, B-Tree and GIN indexes,
--           and Supabase Storage bucket rules for EPUB/PDF binaries.
-- ==============================================================================

-- 1. Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ==============================================================================
-- 2. TABLE: users (Public User Profiles synced with auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.users IS 'Public user profile metadata for registered AO3 Reader accounts';

-- ==============================================================================
-- 3. TABLE: fics (Fanfic Metadata, Tags, Metrics, and Sync Attributes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.fics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    local_id BIGINT, -- Local Dexie.js auto-increment ID
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
    publication_status TEXT DEFAULT 'Unknown', -- 'Completed' | 'Work in Progress' | 'Unknown'
    published_at TEXT,
    updated_at_fic TEXT,
    language TEXT,
    format TEXT DEFAULT 'epub', -- 'epub' | 'pdf'
    source TEXT DEFAULT 'local', -- 'local' | 'gdrive' | 'url'
    is_favorite BOOLEAN DEFAULT false,
    is_read BOOLEAN DEFAULT false,
    last_read_at BIGINT,
    reading_progress INTEGER DEFAULT 0, -- 0 - 100 percent
    current_chapter_idx INTEGER DEFAULT 0,
    current_pdf_page INTEGER DEFAULT 1,
    current_scroll_position BIGINT DEFAULT 0,
    current_scroll_ratio NUMERIC(5, 4) DEFAULT 0,
    notes TEXT,
    chapters_json JSONB DEFAULT '[]'::jsonb, -- Cached chapter structures
    full_text_content TEXT,
    storage_path TEXT, -- Storage bucket reference: 'fics-files/{user_id}/{filename}'
    file_size BIGINT DEFAULT 0,
    imported_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
    CONSTRAINT unique_user_local_fic UNIQUE (user_id, local_id)
);

COMMENT ON TABLE public.fics IS 'Fanfic records with AO3 metadata, reading progress, and cloud storage references';

-- ==============================================================================
-- 4. TABLE: reading_progress (Granular Multi-Device Reading History)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.reading_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fic_id UUID REFERENCES public.fics(id) ON DELETE CASCADE,
    local_id BIGINT,
    progress INTEGER NOT NULL DEFAULT 0, -- 0 to 100 percentage
    chapter_idx INTEGER DEFAULT 0,
    pdf_page INTEGER DEFAULT 1,
    scroll_position BIGINT DEFAULT 0,
    scroll_ratio NUMERIC(5, 4) DEFAULT 0,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
    CONSTRAINT unique_user_fic_progress UNIQUE (user_id, fic_id)
);

COMMENT ON TABLE public.reading_progress IS 'Per-device reading timeline and last read bookmarks';

-- ==============================================================================
-- 5. TABLE: user_preferences (Reader theme, typography, layout dimensions)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'default', -- 'default' | 'sepia' | 'dark'
    font_family TEXT DEFAULT 'serif', -- 'serif' | 'sans' | 'mono'
    font_size INTEGER DEFAULT 18,
    content_width TEXT DEFAULT 'normal', -- 'compact' | 'normal' | 'wide' | 'full'
    line_height NUMERIC(3, 2) DEFAULT 1.75,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.user_preferences IS 'Custom reader display and typography preferences synced across devices';

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES — USER ISOLATION
-- ==============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- RLS: public.users
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can view their own profile"
    ON public.users FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- RLS: public.fics
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- RLS: public.reading_progress
-- ------------------------------------------------------------------------------
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

CREATE POLICY "Users can delete their own reading progress"
    ON public.reading_progress FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- RLS: public.user_preferences
-- ------------------------------------------------------------------------------
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
-- 7. PERFORMANCE & QUERY OPTIMIZATION INDEXES
-- ==============================================================================

-- Foreign key & composite sorting indexes
CREATE INDEX IF NOT EXISTS idx_fics_user_id ON public.fics(user_id);
CREATE INDEX IF NOT EXISTS idx_fics_user_updated ON public.fics(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_fics_user_last_read ON public.fics(user_id, last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_fics_user_local_id ON public.fics(user_id, local_id);
CREATE INDEX IF NOT EXISTS idx_fics_user_favorites ON public.fics(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_fics_user_read ON public.fics(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_fics_user_title ON public.fics(user_id, title);
CREATE INDEX IF NOT EXISTS idx_fics_user_author ON public.fics(user_id, author);
CREATE INDEX IF NOT EXISTS idx_fics_user_rating ON public.fics(user_id, rating);
CREATE INDEX IF NOT EXISTS idx_fics_user_format ON public.fics(user_id, format);
CREATE INDEX IF NOT EXISTS idx_fics_user_status ON public.fics(user_id, publication_status);
CREATE INDEX IF NOT EXISTS idx_fics_user_word_count ON public.fics(user_id, word_count);
CREATE INDEX IF NOT EXISTS idx_fics_user_chapter_count ON public.fics(user_id, chapter_count);

-- Generalized Inverted Index (GIN) for high-performance array filtering
CREATE INDEX IF NOT EXISTS idx_fics_fandoms_gin ON public.fics USING GIN (fandoms);
CREATE INDEX IF NOT EXISTS idx_fics_tags_gin ON public.fics USING GIN (additional_tags);
CREATE INDEX IF NOT EXISTS idx_fics_characters_gin ON public.fics USING GIN (characters);
CREATE INDEX IF NOT EXISTS idx_fics_relationships_gin ON public.fics USING GIN (relationships);
CREATE INDEX IF NOT EXISTS idx_fics_warnings_gin ON public.fics USING GIN (warnings);
CREATE INDEX IF NOT EXISTS idx_fics_category_gin ON public.fics USING GIN (category);

-- Full-Text Search index across Title, Author, and Summary
CREATE INDEX IF NOT EXISTS idx_fics_search_tsv ON public.fics USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(summary, ''))
);

-- Indexes for reading_progress and user_preferences
CREATE INDEX IF NOT EXISTS idx_reading_progress_user ON public.reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_fic ON public.reading_progress(fic_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON public.user_preferences(user_id);

-- ==============================================================================
-- 8. AUTOMATIC USER PROFILE CREATION TRIGGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();

    -- Also bootstrap default reader preferences
    INSERT INTO public.user_preferences (user_id, theme, font_family, font_size, content_width, line_height, updated_at)
    VALUES (NEW.id, 'default', 'serif', 18, 'normal', 1.75, now())
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to execute automatically upon auth.users signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 9. SUPABASE STORAGE BUCKET: fics-files (EPUB and PDF Storage)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fics-files',
    'fics-files',
    false, -- Private bucket: access protected via folder matching user_id
    104857600, -- 100 MB max file size
    ARRAY['application/epub+zip', 'application/pdf', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies: Restrict file upload and download to owner's folder
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
