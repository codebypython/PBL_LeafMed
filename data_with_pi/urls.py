from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('register/', views.register, name='register'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('profile/', views.profile, name='profile'),
    path('profile/edit/', views.edit_profile, name='edit_profile'),
    path('history/', views.history, name='history'),
    path('search/', views.search, name='search'),
    path('capture/', views.capture, name='capture'),
    path('upload/', views.upload_analyze, name='upload_analyze'), 
    path('plant/<int:plant_id>/', views.plant_detail, name='plant_detail'),
]