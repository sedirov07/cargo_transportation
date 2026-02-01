from flask import Flask, render_template, request, jsonify, send_from_directory
import requests
import os
import threading
import time
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Уменьшаем уровень логирования для werkzeug (HTTP запросы Flask)
logging.getLogger('werkzeug').setLevel(logging.WARNING)

app = Flask(__name__)

# Настройки для отправки в Telegram
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')
SITE_NAME = os.getenv('SITE_NAME', '')

# Флаг для предотвращения повторного запуска самопинга
_keep_alive_started = False
_keep_alive_lock = threading.Lock()


def keep_alive_ping():
    """Периодически отправляет запросы к приложению для поддержания активности"""
    ping_interval = 840  # 14 минут (безопасный интервал для 15-минутного таймаута)
    
    # Ждём 60 секунд перед первым пингом, чтобы приложение успело запуститься
    time.sleep(60)
    
    while True:
        try:
            if not SITE_NAME:
                logger.warning("⚠️ SITE_NAME не установлен, самопинг невозможен")
                time.sleep(ping_interval)
                continue
                
            # Отправляем GET запрос к своему же приложению
            ping_url = f"{SITE_NAME.rstrip('/')}/ping"
            response = requests.get(ping_url, timeout=30)
            
            if response.status_code == 200:
                # logger.info(f"✅ Самопинг успешен: {ping_url}")
                pass
            else:
                logger.warning(f"⚠️ Самопинг с ошибкой: {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Ошибка самопинга: {str(e)}")
        except Exception as e:
            logger.error(f"❌ Неизвестная ошибка самопинга: {str(e)}")
        
        # Ждем указанный интервал перед следующим пингом
        time.sleep(ping_interval)


def start_keep_alive():
    """Запускает поток с самопингом (с защитой от повторного запуска)"""
    global _keep_alive_started
    
    with _keep_alive_lock:
        if _keep_alive_started:
            return
        
        # Не запускаем самопинг в режиме разработки
        if os.environ.get('FLASK_ENV') == 'development' or os.environ.get('DEBUG') == 'True':
            logger.info("🔧 Режим разработки: самопинг отключён")
            return
            
        try:
            ping_thread = threading.Thread(target=keep_alive_ping, daemon=True)
            ping_thread.start()
            _keep_alive_started = True
            logger.info("🚀 Самопинг запущен для поддержания активности на Render")
        except Exception as e:
            logger.error(f"❌ Не удалось запустить самопинг: {str(e)}")


# Запускаем самопинг при импорте модуля (работает с Gunicorn!)
start_keep_alive()
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/tg-lead', methods=['POST'])
def send_to_telegram():
    try:
        # Получаем данные из формы
        name = request.form.get('name', '').strip()
        phone = request.form.get('phone', '').strip()
        message = request.form.get('message', '').strip()
        
        # Проверяем обязательные поля
        if not name or not phone:
            return jsonify({'ok': False, 'error': 'Заполните обязательные поля'})
        
        # Форматируем телефон (убираем пробелы и дефисы)
        phone_clean = phone.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')

        # Формируем сообщение для Telegram
        utc_now = datetime.utcnow()
        current_time_utc5 = utc_now + timedelta(hours=5)
        current_time = current_time_utc5.strftime('%d.%m.%Y %H:%M')

        text = f"🚚 *Новая заявка на грузоперевозку*\n\n"
        text += f"👤 *Имя:* {name}\n"
        text += f"📞 *Телефон:* {phone_clean}\n"
        text += f"📦 *Описание груза:* {message}\n"
        text += f"⏰ *Время заявки:* {current_time}\n"
        text += f"\n📍 *Источник:* Сайт {SITE_NAME}"
        
        # Отправляем в Telegram
        url = f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage'
        data = {
            'chat_id': TELEGRAM_CHAT_ID,
            'text': text,
            'parse_mode': 'Markdown',
            'disable_web_page_preview': True
        }
        
        response = requests.post(url, data=data, timeout=10)
        
        if response.status_code == 200:
            # Логируем успешную отправку
            logger.info(f"[{current_time}] Заявка отправлена: {name}, {phone_clean}")
            return jsonify({'ok': True, 'message': 'Заявка отправлена!'})
        else:
            error_msg = f"Ошибка Telegram API: {response.status_code}"
            logger.error(f"[{current_time}] {error_msg}")
            return jsonify({'ok': False, 'error': error_msg})
            
    except requests.exceptions.Timeout:
        return jsonify({'ok': False, 'error': 'Таймаут соединения с Telegram'})
    except requests.exceptions.ConnectionError:
        return jsonify({'ok': False, 'error': 'Ошибка подключения к Telegram'})
    except Exception as e:
        error_msg = f"Неизвестная ошибка: {str(e)}"
        logger.error(f"[{datetime.now()}] {error_msg}")
        return jsonify({'ok': False, 'error': 'Внутренняя ошибка сервера'})

# Опционально: для обслуживания статических файлов
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

# Health check для Render
@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

# Добавьте endpoint для пинга
@app.route('/ping')
def ping():
    return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})

@app.route('/robots.txt')
def robots():
    return """User-agent: *
Allow: /
Disallow: /tg-lead
Sitemap: https://gazel-perevozki.ru/sitemap.xml"""

@app.route('/sitemap.xml')
def sitemap():
    return """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://gazel-perevozki.ru/</loc>
        <lastmod>2025-12-21</lastmod>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>"""

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    
    # Проверяем, есть ли переменные окружения для Telegram
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("⚠️ ВНИМАНИЕ: TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не установлены!")
        logger.warning("⚠️ Отправка заявок в Telegram будет недоступна.")
    
    # Определяем режим запуска
    debug_mode = os.environ.get('FLASK_ENV') == 'development' or os.environ.get('DEBUG') == 'True'
    
    # Настройки для продакшена
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug_mode,
        threaded=True  # Разрешаем многопоточность
    )
