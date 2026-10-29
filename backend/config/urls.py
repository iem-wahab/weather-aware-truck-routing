from django.http import JsonResponse
from django.urls import path
from routing.views import plan, corridor_weather

urlpatterns = [
    path('api/health/', lambda request: JsonResponse({'status': 'ok'})),
    path('api/plan/', plan),
    path('api/corridor-weather/', corridor_weather),
]
