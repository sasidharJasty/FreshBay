from django.conf import settings
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
        email = (self.normalize_email(email) or '').strip().lower()
        user = self.model(email=email, **extra_fields)
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
    max_pickups = models.PositiveIntegerField(default=1)
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='available')
    location_zone = models.ForeignKey('LocationZone', related_name='donations', on_delete=models.SET_NULL, null=True, blank=True)
    is_prediction = models.BooleanField(default=False)
    created_by = models.ForeignKey('User', related_name='donations_created', on_delete=models.SET_NULL, null=True, blank=True)
    pickup_address = models.CharField(max_length=255, blank=True)
    pickup_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    pickup_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        ordering = ('-available_from',)

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"

    @property
    def reserved_claims_count(self):
        return self.claims.exclude(status='cancelled').count()

    @property
    def remaining_pickups(self):
        remaining = max(self.max_pickups - self.reserved_claims_count, 0)
        return remaining


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


class DonorProfile(TimeStampedModel):
    user = models.OneToOneField(User, related_name='donor_profile', on_delete=models.CASCADE)
    organization_name = models.CharField(max_length=255, blank=True, default='')
    contact_name = models.CharField(max_length=255, blank=True, default='')
    contact_phone = models.CharField(max_length=32, blank=True, default='')
    default_category = models.CharField(max_length=20, choices=Donation.CATEGORY_CHOICES, blank=True, default='')
    max_daily_pickups = models.PositiveIntegerField(default=8)
    auto_confirm_ready = models.BooleanField(default=True)
    auto_publish_ai = models.BooleanField(default=False)
    preferred_pickup_window = models.PositiveIntegerField(default=90)
    notify_email = models.BooleanField(default=True)
    notify_sms = models.BooleanField(default=False)
    notify_push = models.BooleanField(default=True)
    digest_hour_local = models.PositiveSmallIntegerField(default=9)
    quiet_hours_start = models.CharField(max_length=5, default='21:00')
    quiet_hours_end = models.CharField(max_length=5, default='06:00')
    enable_team_notifications = models.BooleanField(default=True)
    auto_assign_couriers = models.BooleanField(default=False)
    external_notes = models.TextField(blank=True, default='')
    next_pickup_at = models.DateTimeField(null=True, blank=True)
    volunteers_needed = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Donor profile'
        verbose_name_plural = 'Donor profiles'

    def __str__(self):
        return f"Donor profile for {self.user.email}"


class DonorTeamMember(TimeStampedModel):
    STATUS_CHOICES = (
        ('active', 'Active'),
        ('invited', 'Invited'),
        ('suspended', 'Suspended'),
    )

    profile = models.ForeignKey(DonorProfile, related_name='team_members', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    email = models.EmailField()
    role = models.CharField(max_length=64, default='collaborator')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='invited')
    invite_sent_at = models.DateTimeField(default=timezone.now)
    last_active_at = models.DateTimeField(null=True, blank=True)
    permissions = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = 'Donor team member'
        verbose_name_plural = 'Donor team members'

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"


class VolunteerProfile(TimeStampedModel):
    VERIFICATION_CHOICES = (
        ('pending', 'Pending'),
        ('verified', 'Verified'),
        ('expired', 'Expired'),
    )

    user = models.OneToOneField(User, related_name='volunteer_profile', on_delete=models.CASCADE)
    phone_number = models.CharField(max_length=32, blank=True, default='')
    vehicle_type = models.CharField(max_length=64, blank=True, default='')
    vehicle_capacity = models.CharField(max_length=64, blank=True, default='')
    license_plate = models.CharField(max_length=32, blank=True, default='')
    driver_license_number = models.CharField(max_length=64, blank=True, default='')
    verification_status = models.CharField(max_length=16, choices=VERIFICATION_CHOICES, default='pending')
    availability = models.JSONField(default=list, blank=True)
    notify_email = models.BooleanField(default=True)
    notify_sms = models.BooleanField(default=False)
    notify_push = models.BooleanField(default=True)
    preferred_shift_start = models.CharField(max_length=5, blank=True, default='')
    preferred_shift_end = models.CharField(max_length=5, blank=True, default='')
    miles_driven = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    meals_delivered = models.PositiveIntegerField(default=0)
    co2_saved_kg = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    efficiency_score = models.DecimalField(max_digits=4, decimal_places=2, default=0)
    badges = models.JSONField(default=list, blank=True)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=5, blank=True)
    last_verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Volunteer profile'
        verbose_name_plural = 'Volunteer profiles'

    def __str__(self):
        return f"Volunteer profile for {self.user.email}"


class VolunteerTask(TimeStampedModel):
    STATUS_CHOICES = (
        ('open', 'Open'),
        ('assigned', 'Assigned'),
        ('en_route', 'En route'),
        ('picked_up', 'Picked up'),
        ('delivering', 'Delivering'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )

    URGENCY_CHOICES = (
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('critical', 'Critical'),
    )

    LOAD_CHOICES = (
        ('small', 'Small'),
        ('medium', 'Medium'),
        ('large', 'Large'),
    )

    volunteer = models.ForeignKey(
        User,
        related_name='volunteer_tasks',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=255)
    summary = models.TextField(blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='open')
    urgency = models.CharField(max_length=16, choices=URGENCY_CHOICES, default='medium')
    load_size = models.CharField(max_length=16, choices=LOAD_CHOICES, default='medium')
    distance_miles = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    estimated_minutes = models.PositiveIntegerField(default=0)
    pickup_address = models.CharField(max_length=255)
    pickup_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    pickup_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    dropoff_address = models.CharField(max_length=255)
    dropoff_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    dropoff_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    scheduled_start = models.DateTimeField(null=True, blank=True)
    scheduled_end = models.DateTimeField(null=True, blank=True)
    route_sequence = models.PositiveIntegerField(default=0)
    efficiency_score = models.DecimalField(max_digits=4, decimal_places=2, default=0)
    completion_photo_url = models.URLField(blank=True, default='')
    completed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    auto_assigned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('route_sequence', 'scheduled_start', 'id')

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"

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


def food_inspection_upload_path(instance, filename):
    timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
    base_name = filename.replace(' ', '_')
    return f"food_inspections/{timestamp}_{base_name}"


class FoodInspection(TimeStampedModel):
    STATUS_PENDING = 'pending'
    STATUS_SUCCEEDED = 'succeeded'
    STATUS_FAILED = 'failed'

    STATUS_CHOICES = (
        (STATUS_PENDING, 'Pending'),
        (STATUS_SUCCEEDED, 'Succeeded'),
        (STATUS_FAILED, 'Failed'),
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='food_inspections',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    image = models.ImageField(upload_to=food_inspection_upload_path)
    analysis = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ('-created_at',)

    def __str__(self):
        return f"Food inspection #{self.pk or 'unsaved'}"

class FoodInsecurityForecast(TimeStampedModel):
    district_id = models.CharField(max_length=32)
    state_name = models.CharField(max_length=64, blank=True, default='')
    state_abbreviation = models.CharField(max_length=4, blank=True, default='')
    year = models.PositiveIntegerField()
    overall_food_insecurity_rate = models.DecimalField(max_digits=6, decimal_places=4)
    child_food_insecurity_rate = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)
    estimated_food_insecure_individuals = models.PositiveIntegerField(null=True, blank=True)
    estimated_food_insecure_children = models.PositiveIntegerField(null=True, blank=True)
    low_income_household_pct = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)
    high_income_household_pct = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)
    low_type_code = models.IntegerField(null=True, blank=True)
    high_type_code = models.IntegerField(null=True, blank=True)
    raw_features = models.JSONField(default=dict, blank=True)
    centroid_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    centroid_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_zone = models.ForeignKey(
        LocationZone,
        related_name='food_insecurity_forecasts',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ('-year', 'state_abbreviation', 'district_id')
        unique_together = (('district_id', 'year'),)

    def __str__(self):
        label = self.state_abbreviation or self.state_name or 'Unknown'
        return f"Forecast {label} {self.district_id} ({self.year})"

