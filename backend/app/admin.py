from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _

from .models import (
	AidProgram,
	AidRecommendation,
	Claim,
	Donation,
	DonorProfile,
	DonorTeamMember,
	FamilyProfile,
	FoodInsecurityForecast,
	FoodInspection,
	LocationZone,
	Notification,
	User,
	VolunteerProfile,
	VolunteerTask,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
	ordering = ('email',)
	list_display = ('email', 'first_name', 'last_name', 'role', 'is_staff', 'is_active')
	search_fields = ('email', 'first_name', 'last_name')
	list_filter = ('role', 'is_staff', 'is_active')
	fieldsets = (
		(None, {'fields': ('email', 'password')}),
		(_('Personal info'), {'fields': ('first_name', 'last_name')}),
		(_('Permissions'), {'fields': ('role', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
		(_('Important dates'), {'fields': ('last_login', 'date_joined')}),
	)
	add_fieldsets = (
		(None, {
			'classes': ('wide',),
			'fields': ('email', 'password1', 'password2', 'role', 'is_active', 'is_staff', 'is_superuser'),
		}),
	)
	filter_horizontal = ('groups', 'user_permissions')


@admin.register(LocationZone)
class LocationZoneAdmin(admin.ModelAdmin):
	list_display = ('name', 'level', 'households_supported', 'latitude', 'longitude')
	list_filter = ('level',)
	search_fields = ('name',)


@admin.register(Donation)
class DonationAdmin(admin.ModelAdmin):
	list_display = ('title', 'category', 'status', 'max_pickups', 'location_zone', 'available_from', 'available_until')
	list_filter = ('category', 'status', 'is_prediction')
	search_fields = ('title', 'donor_name')
	raw_id_fields = ('location_zone', 'created_by')


@admin.register(FamilyProfile)
class FamilyProfileAdmin(admin.ModelAdmin):
	list_display = ('user', 'phone_number', 'zip_code', 'household_size')
	search_fields = ('user__email',)


@admin.register(DonorProfile)
class DonorProfileAdmin(admin.ModelAdmin):
	list_display = ('user', 'organization_name', 'contact_name', 'contact_phone', 'max_daily_pickups')
	search_fields = ('user__email', 'organization_name', 'contact_name')


@admin.register(DonorTeamMember)
class DonorTeamMemberAdmin(admin.ModelAdmin):
	list_display = ('profile', 'name', 'email', 'role', 'status')
	list_filter = ('status',)
	search_fields = ('name', 'email')
	raw_id_fields = ('profile',)


@admin.register(VolunteerProfile)
class VolunteerProfileAdmin(admin.ModelAdmin):
	list_display = ('user', 'phone_number', 'vehicle_type', 'verification_status', 'miles_driven', 'meals_delivered')
	list_filter = ('verification_status',)
	search_fields = ('user__email', 'user__first_name', 'user__last_name')


@admin.register(VolunteerTask)
class VolunteerTaskAdmin(admin.ModelAdmin):
	list_display = ('title', 'status', 'urgency', 'load_size', 'scheduled_start', 'scheduled_end', 'volunteer')
	list_filter = ('status', 'urgency', 'load_size')
	search_fields = ('title', 'summary')
	raw_id_fields = ('volunteer',)


@admin.register(Claim)
class ClaimAdmin(admin.ModelAdmin):
	list_display = ('id', 'donation', 'user', 'status', 'reserved_at')
	list_filter = ('status',)
	search_fields = ('donation__title', 'user__email', 'verification_code')
	raw_id_fields = ('donation', 'user')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
	list_display = ('user', 'message', 'notification_type', 'scheduled_for')
	list_filter = ('notification_type',)
	search_fields = ('user__email', 'message')


@admin.register(AidProgram)
class AidProgramAdmin(admin.ModelAdmin):
	list_display = ('name', 'external_url')
	search_fields = ('name',)


@admin.register(AidRecommendation)
class AidRecommendationAdmin(admin.ModelAdmin):
	list_display = ('user', 'title', 'reason', 'created_at')
	search_fields = ('user__email', 'title')


@admin.register(FoodInspection)
class FoodInspectionAdmin(admin.ModelAdmin):
	list_display = ('id', 'uploaded_by', 'status', 'created_at')
	list_filter = ('status',)
	search_fields = ('uploaded_by__email',)
	raw_id_fields = ('uploaded_by',)


@admin.register(FoodInsecurityForecast)
class FoodInsecurityForecastAdmin(admin.ModelAdmin):
	list_display = ('district_id', 'state_abbreviation', 'year', 'overall_food_insecurity_rate')
	list_filter = ('state_abbreviation', 'year')
	search_fields = ('district_id', 'state_name', 'state_abbreviation')
