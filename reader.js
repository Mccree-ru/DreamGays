const reader = {
    renderPages(containerId, pagesArray) {
        const container = document.getElementById(containerId);
        container.innerHTML = ""; // Очистка

        pagesArray.forEach((pageUrl, index) => {
            const img = document.createElement('img');
            img.src = pageUrl;
            img.className = 'reader-page';
            img.loading = index < 3 ? 'eager' : 'lazy'; // Первые 3 загружаем сразу, остальные лениво
            img.alt = `Страница ${index + 1}`;
            
            // Фикс для предотвращения прыжков скролла при рендере картинок высокого разрешения
            img.style.minHeight = '300px'; 
            img.onload = () => img.style.minHeight = 'auto';

            container.appendChild(img);
        });

        // Сброс скролла на самый верх при открытии новой главы
        container.scrollTop = 0;
        
        // Сюда можно внедрить любой плагин / код для Pinch-to-Zoom (приближения пальцами)
        this.initPinchZoom(container);
    },

    initPinchZoom(container) {
        // Облегченный базовый зум для мобилок, чтобы верстка не ломалась
        let lastTouchEnd = 0;
        container.addEventListener('touchend', (event) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault(); // Защита от системного двойного тапа браузера
            }
            lastTouchEnd = now;
        }, false);
    }
};
