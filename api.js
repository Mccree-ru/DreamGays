const SUPABASE_URL = 'https://rigyzgsisqlcnucysamu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpZ3l6Z3Npc3FsY251Y3lzYW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzE1MzMsImV4cCI6MjA5NzIwNzUzM30.VuZ2oYCazE74yx0Aof92SaWaF0Z-jgKgUBEjEzE2gT4';

// Твоя оригинальная инициализация
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const api = {
    async fetchCatalog() {
        // Запрашиваем данные, считаем лайки и СОРТИРУЕМ по internal_id (новые будут первыми)
        const { data, error } = await _supabase
            .from('manga')
            .select(`*, likes(count)`)
            .order('internal_id', { ascending: false });
            
        if (error) throw error;

        // Отдельно тянем id комментов, чтобы сосчитать их без сбоев из-за связей
        let commentCounts = {};
        try {
            const { data: cData } = await _supabase.from('comments').select('manga_id');
            if (cData) {
                cData.forEach(c => {
                    if (c.manga_id) {
                        commentCounts[c.manga_id] = (commentCounts[c.manga_id] || 0) + 1;
                    }
                });
            }
        } catch (e) {
            console.error("Ошибка подсчета комментов:", e);
        }

        // Возвращаем данные строго в твоем оригинальном формате, добавляя comments_count
        return data.map(m => ({
            id: String(m.id),
            title: m.title,
            author: m.author || "Не указан",
            cover: m.cover || "",
            tags: Array.isArray(m.tags) ? m.tags : [],
            pages: Array.isArray(m.pages) ? m.pages : JSON.parse(m.pages || '[]'),
            likes: m.likes[0]?.count || 0,
            comments_count: commentCounts[String(m.id)] || 0 // Передаем количество комментов на плитку
        }));
    },

    async getUserLikesList(userId) {
        if (!userId) return [];
        const { data } = await _supabase.from('likes').select('manga_id').eq('user_id', Number(userId));
        return data ? data.map(item => String(item.manga_id)) : [];
    },

    async toggleLike(userId, mangaId, isAlreadyLiked) {
        if (!userId) return;
        if (isAlreadyLiked) {
            await _supabase.from('likes').delete().eq('user_id', Number(userId)).eq('manga_id', String(mangaId));
        } else {
            await _supabase.from('likes').insert([{ user_id: Number(userId), manga_id: String(mangaId) }]);
        }
    },

    // Получение комментариев для СТРАНИЦЫ (где page_index равен числу)
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

    // Получение комментариев для ГЛАВНОГО МЕНЮ ПРЕВЬЮ (где page_index равен NULL)
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

    // Добавление комментария
    async addComment(mangaId, pageIndex, userId, userName, text) {
        const insertData = {
            manga_id: String(mangaId),
            user_id: Number(userId),
            user_name: userName || "Читатель",
            text: String(text)
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
    }
};
