// Инициализация Supabase клиента (убедись, что твои URL и KEY указаны верно)
const supabase = window.supabase.createClient('ТВОЙ_SUPABASE_URL', 'ТВОЙ_SUPABASE_KEY');

const api = {
    // Получение каталога: самые новые тайтлы сверху + точный подсчет комментариев
    async fetchCatalog() {
        // Запрашиваем все поля, считаем связанные комментарии 
        // и сортируем по internal_id (от самых больших/новых к старым)
        const { data, error } = await supabase
            .from('manga')
            .select(`
                *,
                comments(count)
            `)
            .order('internal_id', { ascending: false }); 

        if (error) {
            console.error("Ошибка при работе fetchCatalog:", error);
            throw error;
        }

        // Пересобираем массив манг, вытаскивая count во внешнюю переменную comments_count
        return data.map(manga => {
            let count = 0;
            if (manga.comments && manga.comments[0]) {
                count = manga.comments[0].count;
            }
            return {
                ...manga,
                comments_count: count
            };
        });
    },

    // Получение списка ID лайкнутых тайтлов текущим пользователем
    async getUserLikesList(userId) {
        const { data, error } = await supabase
            .from('likes')
            .select('manga_id')
            .eq('user_id', userId);
        
        if (error) return [];
        return data.map(item => String(item.manga_id));
    },

    // Поставить или убрать лайк тайтлу
    async toggleLike(userId, mangaId, isLikedNow) {
        if (isLikedNow) {
            await supabase.from('likes').delete().eq('user_id', userId).eq('manga_id', mangaId);
            
            const { data: m } = await supabase.from('manga').select('likes').eq('id', mangaId).single();
            if(m) {
                await supabase.from('manga').update({ likes: Math.max(0, m.likes - 1) }).eq('id', mangaId);
            }
        } else {
            await supabase.from('likes').insert({ user_id: userId, manga_id: mangaId });
            
            const { data: m } = await supabase.from('manga').select('likes').eq('id', mangaId).single();
            if(m) {
                await supabase.from('manga').update({ likes: (m.likes || 0) + 1 }).eq('id', mangaId);
            }
        }
    },

    // Получение главных комментариев тайтла (там, где page_index равен NULL)
    async fetchMainComments(mangaId) {
        const { data, error } = await supabase
            .from('comments')
            .select('*')
            .eq('manga_id', mangaId)
            .is('page_index', null)
            .order('id', { ascending: true }); // Старые комментарии сверху, новые снизу
        
        if (error) throw error;
        return data;
    },

    // Получение постраничных комментариев для конкретного кадра/слайда в читалке
    async fetchPageComments(mangaId, pageIndex) {
        const { data, error } = await supabase
            .from('comments')
            .select('*')
            .eq('manga_id', mangaId)
            .eq('page_index', pageIndex)
            .order('id', { ascending: true });
        
        if (error) throw error;
        return data;
    },

    // Добавление комментария (pageIndex равен числу для читалки или null для главной страницы тайтла)
    async addComment(mangaId, pageIndex, userId, userName, text) {
        const { data, error } = await supabase
            .from('comments')
            .insert({
                manga_id: mangaId,
                page_index: pageIndex,
                user_id: userId,
                user_name: userName,
                text: text
            });
        
        if (error) throw error;
        return data;
    },

    // Удаление своего комментария по ID
    async deleteComment(commentId, userId) {
        const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId)
            .eq('user_id', userId);
        
        if (error) throw error;
    }
};const SUPABASE_URL = 'https://rigyzgsisqlcnucysamu.supabase.co';
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
            .is('page_index', null) // Корректный поиск пустых значений в int8
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    // Добавление комментария (если pageIndex равен null — запишется коммент к тайтлу)
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
