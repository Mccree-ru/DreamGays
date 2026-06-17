const SUPABASE_URL = 'https://rigyzgsisqlcnucysamu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpZ3l6Z3Npc3FsY251Y3lzYW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzE1MzMsImV4cCI6MjA5NzIwNzUzM30.VuZ2oYCazE74yx0Aof92SaWaF0Z-jgKgUBEjEzE2gT4';

const _supabase = Supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const api = {
    // Получить весь каталог манги со счетчиком лайков
    async fetchCatalog() {
        const { data, error } = await _supabase
            .from('manga')
            .select(`*, likes(count)`);
        
        if (error) throw error;
        return data.map(m => ({
            id: m.id,
            title: m.title,
            author: m.author || "Не указан",
            cover: m.cover || "",
            tags: m.tags || [],
            pages: Array.isArray(m.pages) ? m.pages : JSON.parse(m.pages || '[]'),
            likes: m.likes[0]?.count || 0
        })).sort((a, b) => b.likes - a.likes); // Сортировка: популярные сверху
    },

    // Проверить, лайкнул ли данный пользователь эту мангу
    async checkUserLike(userId, mangaId) {
        if (!userId) return false;
        const { data } = await _supabase
            .from('likes')
            .select('id')
            .eq('user_id', userId)
            .eq('manga_id', mangaId);
        return data && data.length > 0;
    },

    // Переключить лайк (поставить или убрать)
    async toggleLike(userId, mangaId, isAlreadyLiked) {
        if (!userId) return;
        if (isAlreadyLiked) {
            await _supabase.from('likes').delete().eq('user_id', userId).eq('manga_id', mangaId);
        } else {
            await _supabase.from('likes').insert({ user_id: userId, manga_id: mangaId });
        }
    },

    // Получить комментарии к конкретному тайтлу
    async fetchComments(mangaId) {
        const { data, error } = await _supabase
            .from('comments')
            .select('*')
            .eq('manga_id', mangaId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    // Добавить новый комментарий
    async addComment(mangaId, userId, userName, text) {
        const { data, error } = await _supabase
            .from('comments')
            .insert({
                manga_id: mangaId,
                user_id: userId,
                user_name: userName || "Аноним",
                text: text
            });
        if (error) throw error;
        return data;
    }
};
