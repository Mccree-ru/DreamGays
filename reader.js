const reader = {
    mangaId: null,
    pages: [],
    currentIndex: 0,
    isGesturesInitialized: false,
    isPCControlsInitialized: false,
    
    // Для зума
    scale: 1,
    minScale: 1,
    maxScale: 3,
    currentX: 0,
    currentY: 0,
    
    // Для отслеживания двойного тапа
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
    isZooming: false,
    
    // Очередь для хранения фоновых объектов картинок (защита от Garbage Collector)
    preloadQueue: [], 
    // Набор URL, которые уже были поставлены на загрузку (защита от дублирования запросов)
    preloadedUrls: new Set(),
    // Флаг активного фонового процесса последовательной догрузки
    isBackgroundLoading: false,

    renderPages(mangaId, pagesArray) {
        this.mangaId = mangaId;
        this.pages = pagesArray;
        this.currentIndex = 0;
        this.resetZoom();

        const track = document.getElementById('readerTrack');
        if (!track) return;
        track.innerHTML = "";

        // Рендерим слайды для каждой страницы
        this.pages.forEach((pageUrl, index) => {
            const slide = document.createElement('div');
            slide.className = 'reader-slide';
            
            slide.innerHTML = `
                <div class="zoom-container" id="zoomContainer-${index}">
                    <div class="reader-skeleton" id="skeleton-${index}">
                        <div class="reader-skeleton-inner skeleton-blink"></div>
                    </div>
                    <img class="reader-img" src="${pageUrl}" draggable="false" 
                         onload="const sk = document.getElementById('skeleton-${index}'); if(sk) sk.classList.add('skeleton-hidden');">
                </div>
            `;
            track.appendChild(slide);
        });

        this.updateTrack();
        
        // Сбрасываем кэш прелоадера под новый тайтл/главу
        this.preloadQueue = [];
        this.preloadedUrls = new Set();
        this.isBackgroundLoading = false;

        // Отмечаем первую страницу как уже загружаемую (её качает сам браузер через тег img)
        if (this.pages[0]) {
            this.preloadedUrls.add(this.pages[0]);
        }

        // Запускаем умный расчет приоритетов прелоада
        this.managePreload();

        // Инициализация мобильных жестов (однократно)
        if (!this.isGesturesInitialized) {
            this.initTouchGestures();
            this.isGesturesInitialized = true;
        }

        // Инициализация управления на ПК (однократно)
        if (!this.isPCControlsInitialized) {
            this.initKeyboardControls();
            this.initClickZones();
            this.isPCControlsInitialized = true;
        }
    },

    // Умное управление приоритетами загрузки фреймов
    managePreload() {
        if (!this.pages || this.pages.length === 0) return;

        // ПРИОРИТЕТ 1: Горячая зона — 3 страницы строго перед глазами пользователя
        const nextPagesCount = 3; 
        const priorityIndices = [];

        for (let i = 1; i <= nextPagesCount; i++) {
            const nextIndex = this.currentIndex + i;
            if (nextIndex < this.pages.length) {
                priorityIndices.push(nextIndex);
            }
        }

        // Параллельно запускаем скачивание приоритетных страниц
        priorityIndices.forEach(index => {
            this.preloadSingleUrl(this.pages[index], true);
        });

        // ПРИОРИТЕТ 2: Фоновый догруз всего остального тайтла (строго по очереди)
        this.preloadRemainingSequentially();
    },

    // Асинхронное скачивание одного изображения
    preloadSingleUrl(url, isPriority = false) {
        if (this.preloadedUrls.has(url)) return Promise.resolve();

        return new Promise((resolve) => {
            this.preloadedUrls.add(url);
            const img = new Image();
            
            img.onload = () => {
                if (isPriority) {
                    console.log(`[Preloader] Приоритетная страница загружена: ${url.substring(url.lastIndexOf('/'))}`);
                }
                resolve();
            };
            img.onerror = () => {
                // Если произошла сетевая ошибка — даем шанс скачать картинку заново при листании
                this.preloadedUrls.delete(url); 
                resolve();
            };
            
            img.src = url;
            this.preloadQueue.push(img);
        });
    },

    // Последовательный догруз оставшейся части главы без забивания канала связи
    async preloadRemainingSequentially() {
        if (this.isBackgroundLoading) return;
        this.isBackgroundLoading = true;

        for (let i = 0; i < this.pages.length; i++) {
            const url = this.pages[i];
            
            // Если до страницы еще не дошла очередь — скачиваем её и дожидаемся (await)
            if (!this.preloadedUrls.has(url)) {
                await this.preloadSingleUrl(url, false);
            }
        }

        this.isBackgroundLoading = false;
    },

    initKeyboardControls() {
        window.addEventListener('keydown', (event) => {
            const readerScreen = document.getElementById('readerScreen');
            if (!readerScreen || !readerScreen.classList.contains('active')) return;

            // Если фокус в инпуте комментариев — стрелочки не должны переключать страницы
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                return;
            }

            if (event.key === 'ArrowRight') {
                if (this.currentIndex < this.pages.length - 1) {
                    this.currentIndex++;
                    this.resetZoom();
                    this.updateTrack();
                }
            } else if (event.key === 'ArrowLeft') {
                if (this.currentIndex > 0) {
                    this.currentIndex--;
                    this.resetZoom();
                    this.updateTrack();
                }
            }
        });
    },

    initClickZones() {
        const track = document.getElementById('readerTrack');
        if (!track) return;

        track.addEventListener('click', (event) => {
            // Игнорируем клики, если они пришлись на кнопки или панель комментариев
            if (event.target.closest('button') || event.target.closest('.page-comments-panel')) return;
            
            // Игнорируем клик, если это был двойной тап (зум)
            if (this.isZooming) {
                this.isZooming = false;
                return;
            }

            const screenWidth = window.innerWidth;
            const clickX = event.clientX;

            const leftZoneBound = screenWidth * 0.3;
            const rightZoneBound = screenWidth * 0.7;

            if (clickX > rightZoneBound) {
                if (this.currentIndex < this.pages.length - 1) {
                    this.currentIndex++;
                    this.resetZoom();
                    this.updateTrack();
                }
            } else if (clickX < leftZoneBound) {
                if (this.currentIndex > 0) {
                    this.currentIndex--;
                    this.resetZoom();
                    this.updateTrack();
                }
            }
        });
    },

    updateTrack() {
        const track = document.getElementById('readerTrack');
        if (!track) return;
        track.style.transform = `translate3d(-${this.currentIndex * 100}vw, 0px, 0px)`;
        
        const counter = document.getElementById('pageCounter');
        if (counter) {
            counter.textContent = `${this.currentIndex + 1} / ${this.pages.length}`;
        }
        
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }

        const commentsPanel = document.getElementById('commentsPanel');
        if (commentsPanel && commentsPanel.classList.contains('open')) {
            const commentsTitle = document.getElementById('commentsTitle');
            if (commentsTitle) commentsTitle.textContent = `Комментарии к странице ${this.currentIndex + 1}`;
            this.loadCommentsForCurrentPage();
        }

        // ПЕРЕРАСЧЕТ: Каждый раз при смене кадра обновляем приоритеты загрузки
        this.managePreload();
    },

    resetZoom() {
        this.scale = 1;
        this.currentX = 0;
        this.currentY = 0;
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (container) {
            container.style.transform = `translate3d(0px, 0px, 0px) scale(1)`;
            container.style.transformOrigin = 'center center';
        }
    },

    initTouchGestures() {
        const track = document.getElementById('readerTrack');
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let isSwiping = false;
        
        // Переменные для пинч-зума
        let initialPinchDistance = 0;
        let initialScale = 1;
        let initialX = 0;
        let initialY = 0;
        let pinchCenterX = 0;
        let pinchCenterY = 0;
        let isPinching = false;

        track.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                isSwiping = true;
                
                // Проверка на двойной тап
                const now = Date.now();
                const timeSinceLastTap = now - this.lastTapTime;
                
                if (timeSinceLastTap < 300) {
                    // Это двойной тап!
                    this.isZooming = true;
                    this.handleDoubleTap(touch.clientX, touch.clientY);
                }
                
                this.lastTapTime = now;
                this.lastTapX = touch.clientX;
                this.lastTapY = touch.clientY;
                
            } else if (e.touches.length === 2) {
                // Начало пинча
                isPinching = true;
                isSwiping = false;
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                initialPinchDistance = this.getDistance(touch1, touch2);
                pinchCenterX = (touch1.clientX + touch2.clientX) / 2;
                pinchCenterY = (touch1.clientY + touch2.clientY) / 2;
                
                const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
                if (container) {
                    const rect = container.getBoundingClientRect();
                    const xPercent = ((pinchCenterX - rect.left) / rect.width) * 100;
                    const yPercent = ((pinchCenterY - rect.top) / rect.height) * 100;
                    container.style.transformOrigin = `${xPercent}% ${yPercent}%`;
                }
                
                initialScale = this.scale;
                initialX = this.currentX;
                initialY = this.currentY;
            }
        }, { passive: true });

        track.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && isSwiping) {
                // Свайп для перелистывания только если зум = 1
                if (this.scale === 1) {
                    const touch = e.touches[0];
                    const diffX = touchStartX - touch.clientX;
                    
                    // Если смещение больше порога - считаем свайпом
                    if (Math.abs(diffX) > 20) {
                        isSwiping = false;
                    }
                }
            } else if (e.touches.length === 2 && isPinching) {
                // Пинч-зум
                e.preventDefault();
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = this.getDistance(touch1, touch2);
                const scaleFactor = currentDistance / initialPinchDistance;
                
                let newScale = initialScale * scaleFactor;
                newScale = Math.min(Math.max(newScale, this.minScale), this.maxScale);
                
                // Обновляем трансформацию
                const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
                if (container) {
                    container.style.transform = `translate3d(0px, 0px, 0px) scale(${newScale})`;
                }
                this.scale = newScale;
            }
        }, { passive: false });

        track.addEventListener('touchend', (e) => {
            // Если это был свайп и зум = 1
            if (isSwiping && this.scale === 1) {
                const diffX = touchStartX - touchEndX;
                
                if (diffX > 50 && this.currentIndex < this.pages.length - 1) {
                    this.currentIndex++;
                    this.resetZoom();
                    this.updateTrack();
                }
                else if (diffX < -50 && this.currentIndex > 0) {
                    this.currentIndex--;
                    this.resetZoom();
                    this.updateTrack();
                }
            }
            
            isSwiping = false;
            isPinching = false;
            
            // Сбрасываем флаг зума после небольшой задержки
            setTimeout(() => {
                this.isZooming = false;
            }, 100);
        }, { passive: true });
        
        // Сохраняем touchEndX в touchend
        track.addEventListener('touchend', (e) => {
            if (e.changedTouches.length === 1) {
                touchEndX = e.changedTouches[0].clientX;
            }
        }, { passive: true });
    },
    
    // Вспомогательная функция для расчета расстояния между двумя точками
    getDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    },
    
    // Обработка двойного тапа для зума к месту касания
    handleDoubleTap(x, y) {
        const container = document.getElementById(`zoomContainer-${this.currentIndex}`);
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        
        // Вычисляем процентное положение тапа относительно контейнера
        const xPercent = ((x - rect.left) / rect.width) * 100;
        const yPercent = ((y - rect.top) / rect.height) * 100;
        
        // Устанавливаем точку трансформации в место тапа
        container.style.transformOrigin = `${xPercent}% ${yPercent}%`;
        
        if (this.scale === 1) {
            // Увеличиваем
            this.scale = 2.5;
            container.style.transform = `translate3d(0px, 0px, 0px) scale(${this.scale})`;
        } else {
            // Сбрасываем зум
            this.resetZoom();
        }
    },

    toggleComments(show) {
        const panel = document.getElementById('commentsPanel');
        if (!panel) return;
        if (show) {
            panel.classList.add('open');
            const commentsTitle = document.getElementById('commentsTitle');
            if (commentsTitle) commentsTitle.textContent = `Комментарии к странице ${this.currentIndex + 1}`;
            this.loadCommentsForCurrentPage();
        } else {
            panel.classList.remove('open');
        }
    },
    
    // Загрузка комментариев для текущей страницы
    async loadCommentsForCurrentPage() {
        const container = document.getElementById('pageCommentsScroll');
        if (!container) return;
        
        container.innerHTML = "<p style='color:#777; font-size:13px; text-align:center;'>Загрузка комментариев...</p>";
        
        try {
            const comments = await api.fetchPageComments(this.mangaId, this.currentIndex);
            
            if (!comments || comments.length === 0) {
                container.innerHTML = "<p style='color:#777; font-size:13px; text-align:center;'>Нет комментариев к этой странице</p>";
                return;
            }
            
            container.innerHTML = "";
            comments.forEach(c => {
                const item = document.createElement('div');
                item.className = 'comment-item';
                const isMyComment = Number(c.user_id) === Number(app.userId);
                const delBtnHtml = isMyComment ? `<button class="comment-del-btn" onclick="reader.deletePageComment('${c.id}')">🗑 Удалить</button>` : '';
                
                // Форматирование времени
                let timeString = "";
                if (c.created_at) {
                    const d = new Date(c.created_at);
                    const pad = (n) => String(n).padStart(2, '0');
                    timeString = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }
                
                item.innerHTML = `
                    <div class="comment-top-line">
                        <span class="comment-user">${c.user_name}</span>
                        <span class="comment-time">${timeString}</span>
                    </div>
                    <p class="comment-text">${c.text}</p>
                    ${delBtnHtml}
                `;
                container.appendChild(item);
            });
        } catch (e) {
            container.innerHTML = "<span style='color:#ff3b30;'>Не удалось загрузить комментарии.</span>";
        }
    },
    
    // Отправка комментария к странице
    async sendPageComment() {
        const input = document.getElementById('pageCommentInputField');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        
        try {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            
            await api.addComment(
                this.mangaId,
                this.currentIndex,
                app.userId,
                app.userName,
                text
            );
            
            input.value = "";
            await this.loadCommentsForCurrentPage();
        } catch(e) {
            alert("Не удалось отправить комментарий.");
            console.error(e);
        }
    },
    
    // Удаление комментария к странице
    async deletePageComment(commentId) {
        if (confirm("Удалить ваш комментарий?")) {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            }
            await api.deleteComment(commentId, app.userId);
            await this.loadCommentsForCurrentPage();
        }
    }
};
