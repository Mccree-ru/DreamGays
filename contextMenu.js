const contextMenuManager = {
    activeMangaId: null,
    longPressTimer: null,
    isLongPressActive: false,
    touchStartX: 0,
    touchStartY: 0,

    init() {
        const catalogContainer = document.getElementById('catalogGrid');
        if (!catalogContainer) return;

        // Тач-события для смартфонов
        catalogContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        catalogContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: true });
        catalogContainer.addEventListener('touchend', () => this.clearTimer());
        
        // Клик ПКМ на компьютерах
        catalogContainer.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

        // Закрытие меню при клике в любое другое место экрана
        document.addEventListener('click', () => this.hideMenu());
        document.addEventListener('touchstart', (e) => {
            if (!e.target.closest('#customContextMenu')) this.hideMenu();
        });

        // Кнопка копирования внутри меню
        const copyBtn = document.getElementById('contextCopyLinkBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyMangaLink());
        }
    },

    handleTouchStart(e) {
        const card = e.target.closest('.manga-card');
        if (!card) return;

        // ИСПРАВЛЕНО: Читаем правильный атрибут data-manga-id из вашего HTML
        const mangaId = card.getAttribute('data-manga-id');
        if (!mangaId) return;

        this.clearTimer();

        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;

        // Таймер долгого нажатия на телефонах (600мс)
        this.longPressTimer = setTimeout(() => {
            this.isLongPressActive = true;
            this.activeMangaId = mangaId;
            
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            }

            this.showMenu(this.touchStartX, this.touchStartY);
        }, 600);
    },

    handleTouchMove(e) {
        if (!this.longPressTimer) return;
        
        const touch = e.touches[0];
        const moveX = Math.abs(touch.clientX - this.touchStartX);
        const moveY = Math.abs(touch.clientY - this.touchStartY);

        // Если скроллят страницу — сбрасываем вызов меню
        if (moveX > 10 || moveY > 10) {
            this.clearTimer();
        }
    },

    handleContextMenu(e) {
        const card = e.target.closest('.manga-card');
        if (!card) return;
        
        // ИСПРАВЛЕНО: Читаем правильный атрибут data-manga-id при ПКМ
        const mangaId = card.getAttribute('data-manga-id');
        if (!mangaId) return;

        e.preventDefault(); // Блокируем стандартное меню браузера
        
        this.activeMangaId = mangaId;
        this.showMenu(e.clientX, e.clientY);
    },

    clearTimer() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        setTimeout(() => { this.isLongPressActive = false; }, 50);
    },

	showMenu(x, y) {
        const menu = document.getElementById('customContextMenu');
        if (!menu) return;

        menu.style.display = 'block';
        
        // Если это мобильное устройство, позиционирование через JS отключаем.
        // Всё сделает CSS (прижмет меню к низу экрана во всю ширину).
        if (window.innerWidth <= 768) {
            menu.style.left = '';
            menu.style.top = '';
            return;
        }
        
        // Логика позиционирования для ПК (у курсора)
        const menuWidth = 220;
        const menuHeight = 50;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let finalX = x;
        let finalY = y;

        if (x + menuWidth > screenWidth) finalX = screenWidth - menuWidth - 10;
        if (y + menuHeight > screenHeight) finalY = screenHeight - menuHeight - 10;
        if (finalX < 10) finalX = 10;
        if (finalY < 10) finalY = 10;

        menu.style.left = `${finalX}px`;
        menu.style.top = `${finalY}px`;
    },

    hideMenu() {
        const menu = document.getElementById('customContextMenu');
        if (menu) menu.style.display = 'none';
    },

    async copyMangaLink() {
        if (!this.activeMangaId) return;

        const linkToCopy = `https://t.me/DreamContent_Bot/manga?startapp=${this.activeMangaId}`;

        try {
            await navigator.clipboard.writeText(linkToCopy);
            this.triggerCopySuccess();
        } catch (err) {
            console.error("Ошибка буфера, запускаем резервный метод:", err);
            
            const textArea = document.createElement("textarea");
            textArea.value = linkToCopy;
            textArea.style.position = "fixed";
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.triggerCopySuccess();
            } catch (fallbackErr) {
                console.error("Критическая ошибка копирования:", fallbackErr);
            }
            document.body.removeChild(textArea);
        }

        this.hideMenu();
    },

    triggerCopySuccess() {
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        
        if (window.Telegram?.WebApp?.showAlert) {
            window.Telegram.WebApp.showAlert("Ссылка скопирована! Отправьте её друзьям.");
        } else {
            alert("Ссылка скопирована!");
        }
    }
};

// Инициализация при полной загрузке DOM дерева
document.addEventListener('DOMContentLoaded', () => {
    contextMenuManager.init();
});