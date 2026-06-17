// Инициализация Supabase клиента с твоими ключами
const SUPABASE_URL = 'https://rigyzgsisqlcnucysamu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpZ3l6Z3Npc3FsY251Y3lzYW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzE1MzMsImV4cCI6MjA5NzIwNzUzM30.VuZ2oYCazE74yx0Aof92SaWaF0Z-jgKgUBEjEzE2gT4';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const api = {
    // Получение каталога: самые новые тайтлы сверху + безопасный подсчет комментариев
    async fetchCatalog() {
        try {
            // 1. Запрашиваем все тайтлы манги. Сортируем по internal_id (новые будут первыми)
            const { data: mangaData, error: mangaError } = await supabase
                .from('manga')
                .select('*')
                .order('internal_id', { ascending: false }); 

            if (mangaError) {
                console.error("Ошибка при получении манги из Supabase:", mangaError);
                return []; 
            }

            if (!mangaData) return [];

            // 2. Безопасный запрос количества комментариев
            let commentCounts = {};
            try {
                const { data: commentsData, error: commentsError } = await supabase
                    .from('comments')
                    .select('manga_id');

                if (!commentsError && commentsData) {
                    // Группируем и считаем комментарии на стороне клиента
                    commentsData.forEach(c => {
                        if (c && c.manga_id) {
                            commentCounts[c.manga_id] = (commentCounts[c.manga_id] || 0) + 1;
                        }
                    });
                }
            } catch (e) {
                console.error("Ошибка безопасного подсчета комментариев:", e);
                // Если комментарии вызвали ошибку, приложение продолжит работу, проставив нули
            }

            // 3. Склеиваем данные тайтлов с количеством их комментариев
            return mangaData.map(manga => {
                const currentId = manga.id || manga.internal_id;
                return {
                    ...manga,
                    comments_count: commentCounts[currentId] || 0
                };
            });

        } catch (globalError) {
            console.error("Критическая ошибка fetchCatalog:", globalError);
            return [];
        }
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
            // Удаляем лайк из таблицы likes
            await supabase.from('likes').delete().eq('user_id', userId).eq('manga_id', mangaId);
            
            // Уменьшаем счетчик в таблице manga
            const { data: m } = await supabase.from('manga').select('likes').eq('id', mangaId).single();
            if(m) {
                await supabase.from('manga').update({ likes: Math.max(0, m.likes - 1) }).eq('id', mangaId);
            }
        } else {
            // Добавляем лайк в таблицу likes
            await supabase.from('likes').insert({ user_id: userId, manga_id: mangaId });
            
            // Увеличиваем счетчик в таблице manga
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
            .order('id', { ascending: true }); // Старые сверху, новые снизу
        
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

    // Добавление комментария
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
};
