const SUPABASE_URL = 'https://rigyzgsisqlcnucysamu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpZ3l6Z3Npc3FsY251Y3lzYW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzE1MzMsImV4cCI6MjA5NzIwNzUzM30.VuZ2oYCazE74yx0Aof92SaWaF0Z-jgKgUBEjEzE2gT4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const api = {
    async fetchCatalog() {
        const { data, error } = await _supabase.from('manga').select(`*, likes(count)`);
        if (error) throw error;
        return data.map(m => ({
            id: String(m.id),
            title: m.title,
            author: m.author || "Не указан",
            cover: m.cover || "",
            tags: Array.isArray(m.tags) ? m.tags : [],
            pages: Array.isArray(m.pages) ? m.pages : JSON.parse(m.pages || '[]'),
            likes: m.likes[0]?.count || 0
        }));
    },

    async getUserLikesList(userId) {
        if (!userId) return [];
        const { data, error } = await _supabase.from('likes').select('manga_id').eq('user_id', String(userId));
        if (error) return [];
        return data ? data.map(item => String(item.manga_id)) : [];
    },

    async checkUserLike(userId, mangaId) {
        if (!userId) return false;
        const { data } = await _supabase.from('likes').select('id').eq('user_id', String(userId)).eq('manga_id', String(mangaId));
        return data && data.length > 0;
    },

    async toggleLike(userId, mangaId, isAlreadyLiked) {
        if (!userId) return;
        if (isAlreadyLiked) {
            await _supabase.from('likes').delete().eq('user_id', String(userId)).eq('manga_id', String(mangaId));
        } else {
            await _supabase.from('likes').insert([{ user_id: String(userId), manga_id: String(mangaId) }]);
        }
    },

    async fetchPageComments(mangaId, pageIndex) {
        const { data, error } = await _supabase
            .from('comments')
            .select('*')
            .eq('manga_id', String(mangaId))
            .eq('page_index', parseInt(pageIndex))
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async addPageComment(mangaId, pageIndex, userId, userName, text) {
        const { data, error } = await _supabase
            .from('comments')
            .insert([{
                manga_id: String(mangaId),
                page_index: parseInt(pageIndex),
                user_id: String(userId),
                user_name: userName || "Читатель",
                text: String(text)
            }]);
        if (error) throw error;
        return data;
    },

    async deleteComment(commentId, userId) {
        const { error } = await _supabase
            .from('comments')
            .delete()
            .eq('id', commentId)
            .eq('user_id', String(userId));
        if (error) throw error;
    }
};
