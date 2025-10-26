from rest_framework import serializers
from django.contrib.auth import get_user_model

from .models import (
    AidProgram,
    AidRecommendation,
    Claim,
    Donation,
    DonorProfile,
    DonorTeamMember,
    FamilyProfile,
    LocationZone,
    Notification,
    FoodInspection,
    VolunteerProfile,
    VolunteerTask,
)
from .utils import normalize_role

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        exclude = ('password',)

    def get_role(self, obj):
        return normalize_role(getattr(obj, 'role', None))


class LocationZoneSerializer(serializers.ModelSerializer):
    level_display = serializers.CharField(source='get_level_display', read_only=True)

    class Meta:
        model = LocationZone
        fields = (
            'id',
            'name',
            'level',
            'level_display',
            'households_supported',
            'latitude',
            'longitude',
        )


class DonationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    zone = LocationZoneSerializer(source='location_zone', read_only=True)
    remaining_pickups = serializers.IntegerField(read_only=True)
    reserved_claims_count = serializers.IntegerField(read_only=True)
    max_pickups = serializers.IntegerField(read_only=True)
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Donation
        fields = (
            'id',
            'title',
            'donor_name',
            'category',
            'category_display',
            'freshness_notes',
            'distance_miles',
            'available_from',
            'available_until',
            'quantity',
            'max_pickups',
            'status',
            'status_display',
            'is_prediction',
            'zone',
            'remaining_pickups',
            'reserved_claims_count',
            'created_by',
        )


class ClaimSerializer(serializers.ModelSerializer):
    donation = DonationSerializer(read_only=True)

    class Meta:
        model = Claim
        fields = (
            'id',
            'status',
            'reserved_at',
            'pickup_window_start',
            'pickup_window_end',
            'verification_code',
            'collected_at',
            'donation',
        )


class DonationManageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Donation
        fields = (
            'id',
            'title',
            'donor_name',
            'category',
            'freshness_notes',
            'distance_miles',
            'available_from',
            'available_until',
            'max_pickups',
            'quantity',
            'status',
            'location_zone',
            'is_prediction',
        )
        read_only_fields = ('quantity', 'is_prediction')

    def validate(self, attrs):
        max_pickups = attrs.get('max_pickups')
        if max_pickups is not None and max_pickups <= 0:
            raise serializers.ValidationError({'max_pickups': 'Max pickups must be at least 1.'})
        return super().validate(attrs)

    def create(self, validated_data):
        max_pickups = validated_data.get('max_pickups') or 0
        validated_data['quantity'] = max_pickups
        return super().create(validated_data)

    def update(self, instance, validated_data):
        max_pickups = validated_data.get('max_pickups')
        instance = super().update(instance, validated_data)
        if max_pickups is not None:
            reserved = instance.claims.exclude(status='cancelled').count()
            instance.quantity = max(instance.max_pickups - reserved, 0)
            instance.save(update_fields=['quantity', 'updated_at'])
        return instance


class ClaimManageSerializer(serializers.ModelSerializer):
    family = serializers.SerializerMethodField()
    donation = DonationSerializer(read_only=True)

    class Meta:
        model = Claim
        fields = (
            'id',
            'status',
            'reserved_at',
            'pickup_window_start',
            'pickup_window_end',
            'verification_code',
            'collected_at',
            'donation',
            'family',
        )

    def get_family(self, obj):
        user = obj.user
        profile = getattr(user, 'family_profile', None)
        return {
            'id': user.id,
            'email': user.email,
            'name': user.get_full_name() or user.email.split('@')[0],
            'household_size': getattr(profile, 'household_size', None),
            'phone_number': getattr(profile, 'phone_number', ''),
        }


class ClaimStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Claim
        fields = ('status', 'pickup_window_start', 'pickup_window_end', 'collected_at')

    def validate_status(self, value):
        valid_statuses = [choice[0] for choice in Claim.STATUS_CHOICES]
        if value not in valid_statuses:
            raise serializers.ValidationError('Invalid claim status.')
        return value


class VolunteerTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = VolunteerTask
        fields = (
            'id',
            'title',
            'summary',
            'status',
            'urgency',
            'load_size',
            'distance_miles',
            'estimated_minutes',
            'pickup_address',
            'pickup_latitude',
            'pickup_longitude',
            'dropoff_address',
            'dropoff_latitude',
            'dropoff_longitude',
            'scheduled_start',
            'scheduled_end',
            'route_sequence',
            'efficiency_score',
            'completion_photo_url',
            'notes',
        )


class FoodInspectionSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    uploaded_by = serializers.SerializerMethodField()

    class Meta:
        model = FoodInspection
        fields = (
            'id',
            'uploaded_by',
            'image',
            'image_url',
            'analysis',
            'status',
            'error_message',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'uploaded_by',
            'analysis',
            'status',
            'error_message',
            'created_at',
            'updated_at',
        )

    def get_image_url(self, obj):
        if obj.image and hasattr(obj.image, 'url'):
            request = self.context.get('request') if self.context else None
            url = obj.image.url
            if request:
                return request.build_absolute_uri(url)
            return url
        return None

    def get_uploaded_by(self, obj):
        user = getattr(obj, 'uploaded_by', None)
        if not user:
            return None
        return {
            'id': user.id,
            'email': user.email,
        }


class VolunteerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = VolunteerProfile
        fields = (
            'id',
            'user',
            'phone_number',
            'vehicle_type',
            'vehicle_capacity',
            'license_plate',
            'driver_license_number',
            'verification_status',
            'availability',
            'notify_email',
            'notify_sms',
            'notify_push',
            'preferred_shift_start',
            'preferred_shift_end',
            'miles_driven',
            'meals_delivered',
            'co2_saved_kg',
            'efficiency_score',
            'badges',
            'rating',
            'last_verified_at',
        )
        read_only_fields = (
            'user',
            'miles_driven',
            'meals_delivered',
            'co2_saved_kg',
            'efficiency_score',
            'badges',
            'rating',
            'last_verified_at',
        )


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            'id',
            'message',
            'notification_type',
            'scheduled_for',
        )


class AidProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = AidProgram
        fields = (
            'id',
            'name',
            'summary',
            'steps',
            'external_url',
            'tags',
        )


class AidRecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AidRecommendation
        fields = (
            'id',
            'title',
            'reason',
            'created_at',
        )


class FamilyProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = FamilyProfile
        fields = (
            'user',
            'phone_number',
            'zip_code',
            'household_size',
            'dietary_preferences',
            'notes',
        )


class DonorTeamMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = DonorTeamMember
        fields = (
            'id',
            'name',
            'email',
            'role',
            'status',
            'invite_sent_at',
            'last_active_at',
            'permissions',
        )


class DonorProfileSerializer(serializers.ModelSerializer):
    team_members = DonorTeamMemberSerializer(many=True, read_only=True)

    class Meta:
        model = DonorProfile
        fields = (
            'organization_name',
            'contact_name',
            'contact_phone',
            'default_category',
            'max_daily_pickups',
            'auto_confirm_ready',
            'auto_publish_ai',
            'preferred_pickup_window',
            'notify_email',
            'notify_sms',
            'notify_push',
            'digest_hour_local',
            'quiet_hours_start',
            'quiet_hours_end',
            'enable_team_notifications',
            'auto_assign_couriers',
            'external_notes',
            'next_pickup_at',
            'volunteers_needed',
            'team_members',
        )
