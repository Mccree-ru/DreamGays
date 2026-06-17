const SUPABASE_URL = 'https://rigyzgsisqlcnucysamu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpZ3l6Z3Npc3FsY251Y3lzYW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzE1MzMsImV4cCI6MjA5NzIwNzUzM30.VuZ2oYCazE74yx0Aof92SaWaF0Z-jgKgUBEjEzE2gT4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const api = {
    // Получение каталога с поддержкой серверных вычислений лайков и комментариев
    async fetchCatalog({ genre = null, author = '', sortByPopular = false } = {}) {
        let query = _supabase
            .from('manga')
            .select(`*, likes_count:manga_likes_count(), comments_count:manga_comments_count()`);

        // Фильтрация по жанрам (для bara/furry внутри массива tags)
        if (genre) {
            query = query.contains('tags', [genre]);
        }

        // Фильтрация по автору
        if (author) {
            query = query.ilike('author', `%${author}%`);
        }

        // Сортировка на стороне СУБД
        if (sortByPopular) {
            query = query.order('manga_likes_count', { ascending: false });
        } else {
            query = query.order('internal_id', { ascending: false });
        }

        const { data, error } = await query;
        if (error) {
            console.error("Ошибка Supabase при загрузке каталога:", error);
            throw error;
        }

        return data.map(m => ({
            id: String(m.id),
            title: m.title,
            author: m.author || "Не указан",
            cover: m.cover || "",
            tags: Array.isArray(m.tags) ? m.tags : [],
            pages: Array.isArray(m.pages) ? m.pages : JSON.parse(m.pages || '[]'),
            likes: m.likes_count || 0,
            comments_count: m.comments_count || 0
        }));
    },

    async getUserLikesList(userId) {
        if (!userId) return [];
        const { data, error } = await _supabase
            .from('likes')
            .select('manga_id')
            .eq('user_id', Number(userId));
        if (error) throw error;
        return data ? data.map(item => String(item.manga_id)) : [];
    },

    async toggleLike(userId, mangaId, isAlreadyLiked) {
        if (!userId) return;
        if (isAlreadyLiked) {
            const { error } = await _supabase
                .from('likes')
                .delete()
                .eq('user_id', Number(userId))
                .eq('manga_id', String(mangaId));
            if (error) throw error;
        } else {
            const { error } = await _supabase
                .from('likes')
                .insert([{ user_id: Number(userId), manga_id: String(mangaId) }]);
            if (error) throw error;
        }
        return true;
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

    async fetchMainComments(mangaId) {
        const { data, error } = await _supabase
            .from('comments')
            .select('*')
            .eq('manga_id', String(mangaId))
            .is('page_index', null)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    async addComment(mangaId, pageIndex, userId, userName, text) {
        const insertData = {
            manga_id: String(mangaId),
            user_id: Number(userId),
            user_name: userName || "Читатель",
            text: String(text),
            created_at: new Date().toISOString()
        };
        
        if (pageIndex !== null) {
            insertData.page_index = parseInt(pageIndex);
        }

        const { error } = await _supabase.from('comments').insert([insertData]);
        if (error) throw error;
        return true;
    },

    async deleteComment(commentId, userId) {
        const { error } = await _supabase
            .from('comments')
            .delete()
            .eq('id', commentId)
            .eq('user_id', Number(userId));
        if (error) throw error;
        return true;
    }
};
