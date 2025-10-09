from django.db import models
from django.contrib.auth.models import UserManager, AbstractUser, PermissionsMixin
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class CustomUserManager(UserManager):
    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model( email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra_fields)
    
    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        return self._create_user(email, password, **extra_fields)
    
class User(AbstractUser, PermissionsMixin):
    username = None
    email = models.EmailField('email address', unique=True)
    first_name = models.CharField(max_length=30, blank=True)
    last_name = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    role = models.CharField(max_length=50, blank=True, default='charity')
    date_joined = models.DateTimeField(auto_now_add=True)
    
    objects = CustomUserManager()
    
    USERNAME_FIELD = 'email'
    EMAIL_FIELD = 'email'
    REQUIRED_FIELDS = []
    
    class Meta:
        verbose_name = 'user'
        verbose_name_plural = 'users'

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}"
    
    def get_short_name(self):
        return self.first_name

    def __str__(self):
        return self.email


class LocationZone(TimeStampedModel):
    LEVEL_CHOICES = (
        ('high', 'High availability'),
        ('medium', 'Moderate availability'),
        ('low', 'Low availability'),
    )

    name = models.CharField(max_length=255)
    level = models.CharField(max_length=16, choices=LEVEL_CHOICES)
    households_supported = models.PositiveIntegerField(default=0)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        ordering = ('name',)

    def __str__(self):
        return f"{self.name} ({self.get_level_display()})"


class Donation(TimeStampedModel):
    CATEGORY_CHOICES = (
        ('produce', 'Produce'),
        ('dairy', 'Dairy'),
        ('bread', 'Bread & Bakery'),
        ('prepared', 'Prepared Meals'),
        ('pantry', 'Pantry Staples'),
        ('beverage', 'Beverages'),
    )

    STATUS_CHOICES = (
        ('available', 'Available'),
        ('reserved', 'Reserved'),
        ('ready', 'Ready for pickup'),
        ('collected', 'Collected'),
        ('expired', 'Expired'),
        ('predicted', 'Predicted / Incoming'),
    )

    title = models.CharField(max_length=255)
    donor_name = models.CharField(max_length=255)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    freshness_notes = models.CharField(max_length=255, blank=True)
    distance_miles = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    available_from = models.DateTimeField(default=timezone.now)
    available_until = models.DateTimeField(null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='available')
    location_zone = models.ForeignKey('LocationZone', related_name='donations', on_delete=models.SET_NULL, null=True, blank=True)
    is_prediction = models.BooleanField(default=False)

    class Meta:
        ordering = ('-available_from',)

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"


class FamilyProfile(TimeStampedModel):
    user = models.OneToOneField(User, related_name='family_profile', on_delete=models.CASCADE)
    phone_number = models.CharField(max_length=32, blank=True)
    zip_code = models.CharField(max_length=10, blank=True)
    household_size = models.PositiveIntegerField(default=1)
    dietary_preferences = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Family profile'
        verbose_name_plural = 'Family profiles'

    def __str__(self):
        return f"Profile for {self.user.email}"


class Claim(TimeStampedModel):
    STATUS_CHOICES = (
        ('reserved', 'Reserved'),
        ('ready', 'Ready'),
        ('collected', 'Collected'),
        ('cancelled', 'Cancelled'),
    )

    user = models.ForeignKey(User, related_name='claims', on_delete=models.CASCADE)
    donation = models.ForeignKey(Donation, related_name='claims', on_delete=models.CASCADE)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='reserved')
    reserved_at = models.DateTimeField(default=timezone.now)
    pickup_window_start = models.DateTimeField(null=True, blank=True)
    pickup_window_end = models.DateTimeField(null=True, blank=True)
    verification_code = models.CharField(max_length=12, default='', blank=True)
    collected_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-reserved_at',)

    def __str__(self):
        return f"Claim {self.verification_code or self.pk} for {self.user.email}"


class Notification(TimeStampedModel):
    TYPE_CHOICES = (
        ('upcoming', 'Upcoming'),
        ('confirmed', 'Confirmed'),
        ('info', 'Info'),
    )

    user = models.ForeignKey(User, related_name='notifications', on_delete=models.CASCADE)
    message = models.CharField(max_length=255)
    notification_type = models.CharField(max_length=16, choices=TYPE_CHOICES, default='info')
    scheduled_for = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ('-scheduled_for',)

    def __str__(self):
        return f"Notification for {self.user.email}"


class AidProgram(TimeStampedModel):
    name = models.CharField(max_length=255)
    summary = models.TextField()
    steps = models.CharField(max_length=255, blank=True)
    external_url = models.URLField(blank=True)
    tags = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ('name',)

    def __str__(self):
        return self.name


class AidRecommendation(TimeStampedModel):
    user = models.ForeignKey(User, related_name='aid_recommendations', on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    reason = models.CharField(max_length=255)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self):
        return f"Recommendation for {self.user.email}: {self.title}"
