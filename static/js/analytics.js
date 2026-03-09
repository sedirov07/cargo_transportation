document.addEventListener('DOMContentLoaded', function() {
    // Отслеживание кликов по телефону
    document.querySelectorAll('a[href^="tel:"]').forEach(function(link) {
        link.addEventListener('click', function() {
            if (typeof ym !== 'undefined') {
                ym(106091724, 'reachGoal', 'phone_click');
            }
        });
    });
    
    // Отслеживание кликов по Telegram
    document.querySelectorAll('a[href*="t.me"]').forEach(function(link) {
        link.addEventListener('click', function() {
            if (typeof ym !== 'undefined') {
                ym(106091724, 'reachGoal', 'telegram_click');
            }
        });
    });
});
