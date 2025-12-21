from flask import Flask, render_template, request, jsonify, send_from_directory
import requests
import os
from datetime import datetime
from dotenv import load_dotenv


app = Flask(__name__)

load_dotenv()
# Настройки для отправки в Telegram
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')

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
        current_time = datetime.now().strftime('%d.%m.%Y %H:%M')
        
        text = f"🚚 *Новая заявка на грузоперевозку*\n\n"
        text += f"👤 *Имя:* {name}\n"
        text += f"📞 *Телефон:* {phone_clean}\n"
        text += f"📦 *Описание груза:* {message}\n"
        text += f"⏰ *Время заявки:* {current_time}\n"
        text += f"\n📍 *Источник:* Сайт gazel-perevozki.ru"
        
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
            print(f"[{current_time}] Заявка отправлена: {name}, {phone_clean}")
            return jsonify({'ok': True, 'message': 'Заявка отправлена!'})
        else:
            error_msg = f"Ошибка Telegram API: {response.status_code}"
            print(f"[{current_time}] {error_msg}")
            return jsonify({'ok': False, 'error': error_msg})
            
    except requests.exceptions.Timeout:
        return jsonify({'ok': False, 'error': 'Таймаут соединения с Telegram'})
    except requests.exceptions.ConnectionError:
        return jsonify({'ok': False, 'error': 'Ошибка подключения к Telegram'})
    except Exception as e:
        error_msg = f"Неизвестная ошибка: {str(e)}"
        print(f"[{datetime.now()}] {error_msg}")
        return jsonify({'ok': False, 'error': 'Внутренняя ошибка сервера'})

# Опционально: для обслуживания статических файлов
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

# Health check для Render
@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

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
    # Настройки для разработки
    # app.run(
    #     host='0.0.0.0',
    #     port=8000,
    #     debug=True,
    #     threaded=True
    # )
    
    # Для продакшена:
    app.run(host='0.0.0.0', port=port, debug=False)