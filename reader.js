const reader = {
    mangaId: null,
    pages: [],
    currentIndex: 0,
    isGesturesInitialized: false,
    isPCControlsInitialized: false,
    
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
            if (typeof this.loadCommentsForCurrentPage === 'function') {
                this.loadCommentsForCurrentPage();
            }
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
        }
    },

    initTouchGestures() {
        const track = document.getElementById('readerTrack');
        let touchStartX = 0;
        let touchEndX = 0;

        track.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
            }
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            if (e.changedTouches.length === 1) {
                touchEndX = e.changedTouches[0].clientX;
                const diffX = touchStartX - touchEndX;

                if (diffX > 60 && this.currentIndex < this.pages.length - 1) {
                    this.currentIndex++;
                    this.resetZoom();
                    this.updateTrack();
                }
                else if (diffX < -60 && this.currentIndex > 0) {
                    this.currentIndex--;
                    this.resetZoom();
                    this.updateTrack();
                }
            }
        }, { passive: true });
    },

    toggleComments(show) {
        const panel = document.getElementById('commentsPanel');
        if (!panel) return;
        if (show) {
            panel.classList.add('open');
            const commentsTitle = document.getElementById('commentsTitle');
            if (commentsTitle) commentsTitle.textContent = `Комментарии к странице ${this.currentIndex + 1}`;
            if (typeof this.loadCommentsForCurrentPage === 'function') {
                this.loadCommentsForCurrentPage();
            }
        } else {
            panel.classList.remove('open');
        }
    }
};