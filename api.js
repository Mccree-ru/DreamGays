const SUPABASE_URL = 'https://rigyzgsisqlcnucysamu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpZ3l6Z3Npc3FsY251Y3lzYW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzE1MzMsImV4cCI6MjA5NzIwNzUzM30.VuZ2oYCazE74yx0Aof92SaWaF0Z-jgKgUBEjEzE2gT4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const api = {
    // Получение списка ВСЕХ авторов для построения выпадающего списка
    async fetchAllAuthors() {
        const { data, error } = await _supabase.from('manga').select('author');
        if (error) throw error;
        const authors = new Set();
        data.forEach(m => {
            if (m.author) {
                m.author.split(',').forEach(a => authors.add(a.trim()));
            }
        });
        return Array.from(authors).sort();
    },

    // Серверная пагинация, фильтрация и сортировка
    async fetchCatalog({ page = 0, limit = 6, genre = null, author = '', sortByPopular = false }) {
        const from = page * limit;
        const to = from + limit - 1;

        // Оптимизировано: сразу считаем лайки и комментарии на сервере базы данных
        let query = _supabase
            .from('manga')
            .select(`*, likes(count), comments(count)`);

        // Фильтрация по жанру (если массив тегов содержит выбранный)
        if (genre) {
            query = query.contains('tags', [genre]);
        }

        // Фильтрация по автору (поиск подстроки)
        if (author) {
            query = query.ilike('author', `%${author}%`);
        }

        // Сортировка: либо по количеству лайков (внешняя связь), либо по internal_id
        if (sortByPopular) {
            query = query.order('likes_count', { ascending: false, foreignTable: 'likes' });
        } else {
            query = query.order('internal_id', { ascending: false });
        }

        // Ограничение диапазона (пагинация)
        query = query.range(from, to);

        const { data, error } = await query;
        if (error) throw error;

        return data.map(m => ({
            id: String(m.id),
            title: m.title,
            author: m.author || "Не указан",
            cover: m.cover || "",
            tags: Array.isArray(m.tags) ? m.tags : [],
            pages: Array.isArray(m.pages) ? m.pages : JSON.parse(m.pages || '[]'),
            likes: m.likes?.[0]?.count || 0,
            comments_count: m.comments?.[0]?.count || 0 // Больше нет N+1 запроса!
        }));
    },

    async getUserLikesList(userId) {
        const { data, error } = await _supabase
            .from('likes')
            .select('manga_id')
            .eq('user_id', Number(userId));
        if (error) throw error;
        return data ? data.map(item => String(item.manga_id)) : [];
    },

    async toggleLike(userId, mangaId, isAlreadyLiked) {
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
