
import random
from django.core.exceptions import ObjectDoesNotExist
from django.core.mail import send_mail
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.models import Group
from django.http import JsonResponse
from django.shortcuts import render
from rest_framework import viewsets, permissions, status
from rest_framework.authentication import TokenAuthentication
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from django_filters.rest_framework import DjangoFilterBackend

from .serializers import (
    UserSerializer,

)


User = get_user_model()
EMAIL_HOST_USER = 'test@example.com'







class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all().order_by('-id')
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [TokenAuthentication]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['email']


class SignupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    http_method_names = ['post']

    def post(self, request, *args, **kwargs):

        password = request.data.get('password')
        email = request.data.get('email')
        raw_role = request.data.get('role', 'charity')
        role = (raw_role or 'charity').lower()
        # normalize role strings the mobile app expects
        if role in {'families', 'family', 'recipient', 'charity'}:
            role = 'charity'
        elif role in {'donor', 'donors'}:
            role = 'donor'
        elif role in {'volunteer', 'volunteers'}:
            role = 'volunteer'

        if not (email and password):
            return Response({'error': 'Email and password are required'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email=email).exists() :
            return Response({'error': ' email already taken'}, status=status.HTTP_400_BAD_REQUEST)



        user = User.objects.create_user(email=email, password=password, role=role)


       

        token, _ = Token.objects.get_or_create(user=user)

        return Response({'email': user.email, 'role': user.role, 'token': token.key}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        password = request.data.get('password')

        if not (email and password):
            return Response({'error': 'email and password are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'error': 'Invalid email or password'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.check_password(password):
            return Response({'error': 'Invalid email or password'}, status=status.HTTP_401_UNAUTHORIZED)

        login(request, user)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'email': user.email, 'role': user.role, 'token': token.key})


@api_view(['POST'])
def logout_view(request):
    logout(request)
    return JsonResponse({'message': 'Logout successful'})


