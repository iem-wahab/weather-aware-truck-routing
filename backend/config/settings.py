import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')
DEBUG = os.getenv('DEBUG', '0') == '1'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', '')
if not DEBUG and len(SECRET_KEY) < 32:
    raise ImproperlyConfigured('Set a unique DJANGO_SECRET_KEY of at least 32 characters when DEBUG=0')
if DEBUG and not SECRET_KEY:
    SECRET_KEY = 'local-development-only'
ALLOWED_HOSTS = [host.strip() for host in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if host.strip()]
if not DEBUG and ('*' in ALLOWED_HOSTS or not ALLOWED_HOSTS):
    raise ImproperlyConfigured('Set explicit DJANGO_ALLOWED_HOSTS when DEBUG=0')
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = int(os.getenv('DJANGO_HSTS_SECONDS', '0'))
if os.getenv('DJANGO_TRUST_PROXY_SSL_HEADER') == '1':
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
INSTALLED_APPS = ['corsheaders', 'rest_framework', 'routing']
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
CORS_ALLOWED_ORIGINS = [origin.strip().rstrip('/') for origin in os.getenv('DJANGO_CORS_ALLOWED_ORIGINS', '').split(',') if origin.strip()]
CORS_URLS_REGEX = r'^/api/'
ROOT_URLCONF = 'config.urls'
TEMPLATES = []
WSGI_APPLICATION = 'config.wsgi.application'
USE_TZ = True
TIME_ZONE = 'UTC'
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
REST_FRAMEWORK = {'UNAUTHENTICATED_USER': None, 'DEFAULT_AUTHENTICATION_CLASSES': []}
