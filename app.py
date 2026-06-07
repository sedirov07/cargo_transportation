from flask import Flask, render_template, request, jsonify, send_from_directory
import requests
import os
import threading
import time
import logging
import math
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from email.header import Header
from functools import lru_cache
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

# Настройки для отправки заявок на email (SMTP)
SMTP_HOST = os.getenv('SMTP_HOST', '')
SMTP_PORT = int(os.getenv('SMTP_PORT', '465'))
SMTP_USER = os.getenv('SMTP_USER', '')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
# Адрес, с которого приходит письмо (по умолчанию совпадает с логином SMTP)
MAIL_FROM = os.getenv('MAIL_FROM', SMTP_USER)
# Адрес(а) получателя заявок. Несколько — через запятую.
MAIL_TO = os.getenv('MAIL_TO', SMTP_USER)
SITE_NAME = os.getenv('SITE_NAME', '')
YANDEX_MAPS_KEY = os.getenv('YANDEX_MAPS_KEY', '')


def send_lead_email(subject, text_body, html_body):
    """Отправляет письмо с заявкой через SMTP.

    Поддерживает SSL (порт 465) и STARTTLS (порт 587 и др.).
    Возвращает True при успехе, иначе бросает исключение.
    """
    recipients = [addr.strip() for addr in MAIL_TO.split(',') if addr.strip()]

    msg = MIMEMultipart('alternative')
    msg['Subject'] = str(Header(subject, 'utf-8'))
    msg['From'] = formataddr((str(Header('Заявки с сайта', 'utf-8')), MAIL_FROM))
    msg['To'] = ', '.join(recipients)

    msg.attach(MIMEText(text_body, 'plain', 'utf-8'))
    msg.attach(MIMEText(html_body, 'html', 'utf-8'))

    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(MAIL_FROM, recipients, msg.as_string())
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(MAIL_FROM, recipients, msg.as_string())

    return True

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
    return render_template('index.html', yandex_maps_key=YANDEX_MAPS_KEY)

@app.route('/tg-lead', methods=['POST'])
def send_lead():
    try:
        # Получаем данные из формы
        name = request.form.get('name', '').strip()
        phone = request.form.get('phone', '').strip()
        message = request.form.get('message', '').strip()

        # Проверяем обязательные поля (только телефон обязателен)
        if not phone:
            return jsonify({'ok': False, 'error': 'Укажите номер телефона'})

        # Проверяем, что SMTP настроен
        if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
            logger.error("⚠️ SMTP не настроен (SMTP_HOST/SMTP_USER/SMTP_PASSWORD)")
            return jsonify({'ok': False, 'error': 'Отправка заявок временно недоступна'})

        # Форматируем телефон (убираем пробелы и дефисы)
        phone_clean = phone.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')

        # Время заявки (Екатеринбург, UTC+5)
        utc_now = datetime.utcnow()
        current_time_utc5 = utc_now + timedelta(hours=5)
        current_time = current_time_utc5.strftime('%d.%m.%Y %H:%M')

        subject = f"🚚 Новая заявка: {phone_clean}"

        # Текстовая версия письма
        text_body = (
            "Новая заявка на грузоперевозку\n\n"
            f"Телефон: {phone_clean}\n"
            f"Время заявки: {current_time} (Екб)\n"
            f"Источник: Сайт {SITE_NAME}\n"
        )

        # HTML-версия письма
        html_body = f"""\
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937;">
    <h2 style="margin: 0 0 16px;">🚚 Новая заявка на грузоперевозку</h2>
    <table style="border-collapse: collapse; font-size: 15px;">
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #6b7280;">📞 Телефон:</td>
        <td style="padding: 4px 0;"><a href="tel:{phone_clean}" style="color: #2563eb; font-weight: bold; text-decoration: none;">{phone_clean}</a></td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #6b7280;">⏰ Время заявки:</td>
        <td style="padding: 4px 0;">{current_time} (Екб)</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0; color: #6b7280;">📍 Источник:</td>
        <td style="padding: 4px 0;">Сайт {SITE_NAME}</td>
      </tr>
    </table>
  </body>
</html>"""

        send_lead_email(subject, text_body, html_body)

        logger.info(f"[{current_time}] Заявка отправлена на email: {phone_clean}")
        return jsonify({'ok': True, 'message': 'Заявка отправлена!'})

    except smtplib.SMTPAuthenticationError:
        logger.error(f"[{datetime.now()}] Ошибка авторизации SMTP")
        return jsonify({'ok': False, 'error': 'Ошибка отправки. Попробуйте позвонить напрямую.'})
    except (smtplib.SMTPException, OSError) as e:
        logger.error(f"[{datetime.now()}] Ошибка SMTP: {str(e)}")
        return jsonify({'ok': False, 'error': 'Ошибка отправки. Попробуйте позвонить напрямую.'})
    except Exception as e:
        error_msg = f"Неизвестная ошибка: {str(e)}"
        logger.error(f"[{datetime.now()}] {error_msg}")
        return jsonify({'ok': False, 'error': 'Внутренняя ошибка сервера'})

@app.route('/api/calc-log', methods=['POST'])
def calc_log():
    """Логирование запросов калькулятора (откуда → куда, расстояние)"""
    try:
        data = request.get_json(silent=True) or {}
        from_addr = data.get('from', '').strip()
        to_addr = data.get('to', '').strip()
        km = data.get('km', 0)
        cost_min = data.get('costMin', 0)
        cost_max = data.get('costMax', 0)
        load_type = data.get('loadType', 'full')
        mode = data.get('mode', 'intercity')  # city / intercity

        utc_now = datetime.utcnow()
        ekb_time = (utc_now + timedelta(hours=5)).strftime('%d.%m.%Y %H:%M')

        if mode == 'intercity':
            logger.info(
                f"📊 [Калькулятор межгород] [{ekb_time}] "
                f"{from_addr} → {to_addr} | {km} км | "
                f"{load_type} | {cost_min}–{cost_max} ₽"
            )
        else:
            hours = data.get('hours', 0)
            movers = data.get('movers', False)
            logger.info(
                f"📊 [Калькулятор город] [{ekb_time}] "
                f"{hours} ч | грузчики: {'да' if movers else 'нет'} | "
                f"{cost_min}–{cost_max} ₽"
            )

        return jsonify({'ok': True})
    except Exception as e:
        logger.error(f"❌ Ошибка логирования калькулятора: {str(e)}")
        return jsonify({'ok': False})


# === Кэш для экономии запросов к Яндекс API ===
@lru_cache(maxsize=512)
def _suggest_cached(query):
    """Кэшированный запрос подсказок через Geocoder API"""
    resp = requests.get(
        'https://geocode-maps.yandex.ru/1.x/',
        params={
            'apikey': YANDEX_MAPS_KEY,
            'geocode': query,
            'format': 'json',
            'results': 5,
            'lang': 'ru_RU'
        },
        timeout=5
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    members = data.get('response', {}).get('GeoObjectCollection', {}).get('featureMember', [])
    items = []
    for member in members:
        geo = member.get('GeoObject', {})
        meta = geo.get('metaDataProperty', {}).get('GeocoderMetaData', {})
        full_address = meta.get('text', '')
        name = geo.get('name', '')
        description = geo.get('description', '')
        display = full_address or (f"{name}, {description}" if description else name)
        if display:
            items.append({'text': display, 'title': name, 'subtitle': description})
    return tuple(tuple(d.items()) for d in items)  # hashable для lru_cache


@app.route('/api/suggest')
def api_suggest():
    """Подсказки адресов через Яндекс Geocoder API (кэшировано)"""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify({'items': []})

    try:
        result = _suggest_cached(query)
        if result is None:
            return jsonify({'items': []})
        items = [dict(d) for d in result]
        return jsonify({'items': items})
    except Exception as e:
        logger.error(f"❌ Geocoder suggest ошибка: {str(e)}")
        return jsonify({'items': []})


@lru_cache(maxsize=256)
def _geocode(address):
    """Геокодирование адреса через Яндекс Geocoder HTTP API (кэшировано)"""
    resp = requests.get(
        'https://geocode-maps.yandex.ru/1.x/',
        params={
            'apikey': YANDEX_MAPS_KEY,
            'geocode': address,
            'format': 'json',
            'results': 1
        },
        timeout=5
    )
    resp.raise_for_status()
    data = resp.json()
    members = data['response']['GeoObjectCollection']['featureMember']
    if not members:
        return None
    pos = members[0]['GeoObject']['Point']['pos']  # "lon lat"
    lon, lat = pos.split()
    return float(lat), float(lon)


def _haversine_km(lat1, lon1, lat2, lon2):
    """Расстояние между двумя точками на сфере (в км)"""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@app.route('/api/distance')
def api_distance():
    """Расчёт расстояния между двумя адресами"""
    addr_from = request.args.get('from', '').strip()
    addr_to = request.args.get('to', '').strip()

    if not addr_from or not addr_to:
        return jsonify({'ok': False, 'error': 'Не указаны адреса'})

    try:
        coord_from = _geocode(addr_from)
        coord_to = _geocode(addr_to)

        if not coord_from or not coord_to:
            return jsonify({'ok': False, 'error': 'Адрес не найден'})

        straight_km = _haversine_km(
            coord_from[0], coord_from[1],
            coord_to[0], coord_to[1]
        )
        # Коэффициент 1.3 — среднее отношение дорожного расстояния к прямому по России
        road_km = round(straight_km * 1.3)

        logger.info(
            f"📍 [Расстояние] {addr_from} → {addr_to} | "
            f"прямое: {round(straight_km)} км | дорожное: ~{road_km} км"
        )

        return jsonify({
            'ok': True,
            'km': road_km,
            'straight_km': round(straight_km),
            'from_coords': list(coord_from),
            'to_coords': list(coord_to)
        })

    except Exception as e:
        logger.error(f"❌ Ошибка расчёта расстояния: {str(e)}")
        return jsonify({'ok': False, 'error': 'Ошибка расчёта маршрута'})


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
    
    # Проверяем, есть ли переменные окружения для SMTP
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("⚠️ ВНИМАНИЕ: SMTP_HOST / SMTP_USER / SMTP_PASSWORD не установлены!")
        logger.warning("⚠️ Отправка заявок на email будет недоступна.")
    
    # Определяем режим запуска
    debug_mode = os.environ.get('FLASK_ENV') == 'development' or os.environ.get('DEBUG') == 'True'
    
    # Настройки для продакшена
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug_mode,
        threaded=True  # Разрешаем многопоточность
    )
