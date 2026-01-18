
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lnuoktjbkvqdxhvecqyx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxudW9rdGpia3ZxZHhodmVjcXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTM5NDEsImV4cCI6MjA4MzU2OTk0MX0.6b5tZNkaOfYFgA6XS1ZNT5W22NUYIu1AUlmE42zoFQ8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
