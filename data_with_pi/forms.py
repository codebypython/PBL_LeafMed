from django import forms
from django.contrib.auth.models import User

class UserProfileForm(forms.ModelForm):
    """Form chỉnh sửa thông tin user (username, email, first_name, last_name)"""
    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name']
        widgets = {
            'username': forms.TextInput(attrs={'class': 'form-control'}),
            'email': forms.EmailInput(attrs={'class': 'form-control'}),
            'first_name': forms.TextInput(attrs={'class': 'form-control'}),
            'last_name': forms.TextInput(attrs={'class': 'form-control'}),
        }